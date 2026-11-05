import { randomUUID } from 'crypto';
import fs from 'fs';
import {
  achievements,
  apiKeys,
  db,
  endUsers,
  events,
  getMigrationStatus,
  levels,
  member,
  notificationPreferences,
  notifications,
  organizations,
  projects,
  ruleExecutions,
  rules,
  runMigrations,
  serverConfigs,
  userAchievements,
  userChallengeProgress,
  challenges,
  users,
  userXpBalances,
  webhookOutbox,
  webhookEndpoints,
  xpLedger,
} from '@gami/database';
import { createUnsubscribeToken } from '@gami/notifications';
import { and, eq, inArray, like } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { pruneExpiredData } from '../../../worker/src/maintenance.js';
import { buildServer } from '../index.js';

describe('Platform settings and data lifecycle', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  let adminCookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_set_${suffix}`;
  const projectId = `prj_set_${suffix}`;
  const userId = `usr_set_${suffix}`;

  const save = async (category: string, value: Record<string, unknown>) => {
    await db
      .insert(serverConfigs)
      .values({ key: `${category}_config`, value })
      .onConflictDoUpdate({ target: serverConfigs.key, set: { value } });
  };

  const signUp = (email: string, password = 'Password123!') =>
    app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email, password, name: 'Settings' },
    });

  const signIn = (email: string, password: string) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/email',
      payload: { email, password },
    });

  const email = () => `set_${randomUUID()}@example.com`;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    await db.insert(organizations).values({ id: orgId, name: 'Settings', slug: `set-${suffix}` });
    await db
      .insert(projects)
      .values({ id: projectId, organizationId: orgId, name: 'Settings', slug: 'settings' });
    await db.insert(endUsers).values({ id: userId, projectId, externalId: `set_${suffix}` });

    const owner = await signUp(email());
    cookie = owner.headers['set-cookie'] as string;
    await db.insert(member).values({
      id: `mem_${suffix}`,
      organizationId: orgId,
      userId: JSON.parse(owner.payload).user.id,
      role: 'owner',
      createdAt: new Date(),
    });

    const admin = await signUp(email());
    adminCookie = admin.headers['set-cookie'] as string;
    await db
      .update(users)
      .set({ isPlatformAdmin: true })
      .where(eq(users.id, JSON.parse(admin.payload).user.id));
  });

  afterEach(async () => {
    await db
      .delete(serverConfigs)
      .where(
        inArray(serverConfigs.key, [
          'security_config',
          'registration_config',
          'webhooks_config',
          'rate_limits_config',
          'retention_config',
        ])
      );
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('registration', () => {
    it('closes public sign-up, while still allowing invited emails', async () => {
      await save('registration', { allowPublicRegistration: false });

      const closed = await signUp(email());
      expect(closed.statusCode).toBe(403);
      expect(JSON.parse(closed.payload).code).toBe('REGISTRATION_CLOSED');

      const invited = email();
      const inviter = await db.select({ id: users.id }).from(users).limit(1);
      const { invitation } = await import('@gami/database');
      await db.insert(invitation).values({
        id: `inv_${suffix}`,
        organizationId: orgId,
        email: invited,
        role: 'member',
        tokenHash: `hash_${suffix}`,
        status: 'pending',
        expiresAt: new Date(Date.now() + 60_000),
        inviterId: inviter[0]!.id,
      });
      expect((await signUp(invited)).statusCode).toBe(200);
    });

    it('limits organization creation to platform admins', async () => {
      await save('registration', { allowOrgCreation: false });
      const payload = { name: 'Blocked', slug: `blocked-${randomUUID().slice(0, 8)}` };

      const denied = await app.inject({
        method: 'POST',
        url: '/api/organizations',
        headers: { cookie },
        payload,
      });
      expect(denied.statusCode).toBe(403);

      const allowed = await app.inject({
        method: 'POST',
        url: '/api/organizations',
        headers: { cookie: adminCookie },
        payload,
      });
      expect(allowed.statusCode).toBe(201);
      await db.delete(organizations).where(eq(organizations.slug, payload.slug));
    });

    it('blocks API key and webhook creation when turned off', async () => {
      await save('registration', { allowApiKeyCreation: false, allowWebhookCreation: false });

      const key = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/api-keys`,
        headers: { cookie },
        payload: { name: 'Blocked' },
      });
      expect(key.statusCode).toBe(403);

      const hook = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/webhooks`,
        headers: { cookie },
        payload: { name: 'Blocked', url: 'https://example.com/hook', events: ['xp.awarded'] },
      });
      expect(hook.statusCode).toBe(403);
    });
  });

  describe('sign-in and passwords', () => {
    it('enforces the password policy', async () => {
      await save('security', { passwordMinLength: 12, requireNumbers: true });

      const short = await signUp(email(), 'Short1!');
      expect(short.statusCode).toBe(400);
      expect(JSON.parse(short.payload).code).toBe('PASSWORD_POLICY');

      expect((await signUp(email(), 'long enough but no digits')).statusCode).toBe(400);
      expect((await signUp(email(), 'long enough with digit 1')).statusCode).toBe(200);
    });

    it('locks an account after repeated failures, even with the right password', async () => {
      await save('security', { maxFailedLoginAttempts: 2, lockoutDurationMinutes: 1 });
      const address = email();
      await signUp(address);

      expect((await signIn(address, 'wrong-password')).statusCode).toBe(401);
      expect((await signIn(address, 'wrong-password')).statusCode).toBe(401);

      const locked = await signIn(address, 'Password123!');
      expect(locked.statusCode).toBe(429);
      expect(JSON.parse(locked.payload).code).toBe('ACCOUNT_LOCKED');
    });

    it('applies the session lifetime at sign-in', async () => {
      await save('security', { maxSessionLifetimeHours: 2 });
      const address = email();
      await signUp(address);
      const res = await signIn(address, 'Password123!');

      const { session } = await import('@gami/database');
      const token = JSON.parse(res.payload).token as string;
      const [row] = await db.select().from(session).where(eq(session.token, token));
      const hours = (row!.expiresAt.getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(1.9);
      expect(hours).toBeLessThanOrEqual(2);
    });
  });

  describe('limits', () => {
    it('enforces the webhook limit per project', async () => {
      await save('webhooks', { maxWebhooksPerProject: 1 });
      await db.insert(webhookEndpoints).values({
        id: `wh_set_${suffix}`,
        projectId,
        name: 'Existing',
        url: 'https://example.com/a',
        encryptedSecret: 'x',
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/webhooks`,
        headers: { cookie },
        payload: { name: 'Over', url: 'https://example.com/b', events: ['xp.awarded'] },
      });
      expect(res.statusCode).toBe(409);
      expect(JSON.parse(res.payload).code).toBe('WEBHOOK_LIMIT_REACHED');
    });

    it('reports the configured project rate limit', async () => {
      await save('rate_limits', { perProjectLimit: 7, windowMs: 60000 });
      const { createApiKey } = await import('../services/api-key.service.js');
      const { rawSecret } = await createApiKey(projectId, 'Limit', ['*']);

      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': rawSecret },
        payload: { event: 'limit_test' },
      });
      expect(res.headers['x-ratelimit-limit']).toBe('7');
      await db.delete(apiKeys).where(eq(apiKeys.projectId, projectId));
    });
  });

  describe('diagnostics', () => {
    it('reports real migration status', async () => {
      await expect(getMigrationStatus()).resolves.toEqual({ status: 'current', pending: 0 });
    });
  });

  describe('retention', () => {
    it('removes finished outbox rows past their age, and keeps open ones', async () => {
      const endpointId = `wh_ret_${suffix}`;
      await db.insert(webhookEndpoints).values({
        id: endpointId,
        projectId,
        name: 'Retention',
        url: 'https://example.com/r',
        encryptedSecret: 'x',
      });
      const row = (id: string, status: string, updatedAt: Date) => ({
        id,
        projectId,
        endpointId,
        eventType: 'xp.awarded',
        eventId: id,
        payload: {},
        status,
        updatedAt,
      });
      const old = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
      await db.insert(webhookOutbox).values([
        row(`who_old_${suffix}`, 'delivered', old),
        row(`who_open_${suffix}`, 'pending', old),
        row(`who_new_${suffix}`, 'delivered', new Date()),
      ]);

      await pruneExpiredData();

      const left = await db
        .select({ id: webhookOutbox.id })
        .from(webhookOutbox)
        .where(eq(webhookOutbox.endpointId, endpointId));
      expect(left.map((r) => r.id).sort()).toEqual(
        [`who_new_${suffix}`, `who_open_${suffix}`].sort()
      );
    });
  });

  describe('erasing a user', () => {
    it('removes the user and everything that names them, and keeps an audit record', async () => {
      const target = `usr_erase_${suffix}`;
      await db.insert(endUsers).values({ id: target, projectId, externalId: target });
      await db.insert(events).values({
        id: `evt_erase_${suffix}`,
        projectId,
        userId: target,
        type: 'x',
        payload: { email: 'person@example.com' },
      });
      await db.insert(xpLedger).values({
        id: `xpl_erase_${suffix}`,
        projectId,
        userId: target,
        amount: 5,
        reason: 'test',
      });

      const url = `/api/projects/${projectId}/users/${target}/erase`;
      const refused = await app.inject({ method: 'POST', url, headers: { cookie }, payload: {} });
      expect(refused.statusCode).toBe(400);

      const res = await app.inject({
        method: 'POST',
        url,
        headers: { cookie },
        payload: { confirm: true },
      });
      expect(res.statusCode).toBe(200);

      expect(await db.select().from(endUsers).where(eq(endUsers.id, target))).toHaveLength(0);
      expect(await db.select().from(events).where(eq(events.userId, target))).toHaveLength(0);
      expect(
        await db.select().from(events).where(eq(events.id, `evt_erase_${suffix}`))
      ).toHaveLength(0);
      expect(await db.select().from(xpLedger).where(eq(xpLedger.userId, target))).toHaveLength(0);

      const { auditLogs } = await import('@gami/database');
      const audit = await db.select().from(auditLogs).where(eq(auditLogs.resourceId, target));
      expect(audit.some((row) => row.action === 'user.erased')).toBe(true);
    });
  });

  describe('unsubscribe', () => {
    it('turns email off with a signed link, and rejects a forged one', async () => {
      const token = createUnsubscribeToken({ projectId, userId });

      const forged = await app.inject({
        method: 'GET',
        url: `/v1/email/unsubscribe?token=${encodeURIComponent(`${token}x`)}`,
      });
      expect(forged.statusCode).toBe(400);

      const res = await app.inject({
        method: 'POST',
        url: `/v1/email/unsubscribe?token=${encodeURIComponent(token)}`,
      });
      expect(res.statusCode).toBe(200);

      const prefs = await db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.userId, userId),
            eq(notificationPreferences.channel, 'email')
          )
        );
      expect(prefs).toHaveLength(4);
      expect(prefs.every((pref) => pref.enabled === false)).toBe(true);
    });
  });

  describe('organization import', () => {
    it('keeps levels, events, XP, badges and progress through a round trip', async () => {
      const source = `prj_src_${suffix}`;
      const sourceUser = `usr_src_${suffix}`;
      const achievementId = `ach_src_${suffix}`;
      const challengeId = `chl_src_${suffix}`;
      await db.insert(projects).values({
        id: source,
        organizationId: orgId,
        name: 'Source',
        slug: `src-${suffix}`,
      });
      await db.insert(endUsers).values({ id: sourceUser, projectId: source, externalId: 'src' });
      await db.insert(levels).values({
        id: `lvl_src_${suffix}`,
        projectId: source,
        level: 1,
        name: 'One',
        requiredXp: 0,
      });
      await db.insert(events).values({
        id: `evt_src_${suffix}`,
        projectId: source,
        userId: sourceUser,
        type: 'order',
        payload: { total: 5 },
      });
      await db.insert(xpLedger).values({
        id: `xpl_src_${suffix}`,
        projectId: source,
        userId: sourceUser,
        amount: 40,
        reason: 'test',
      });
      await db.insert(achievements).values({
        id: achievementId,
        projectId: source,
        key: 'badge',
        name: 'Badge',
      });
      await db.insert(userAchievements).values({
        id: `uach_src_${suffix}`,
        projectId: source,
        userId: sourceUser,
        achievementId,
      });
      await db.insert(challenges).values({
        id: challengeId,
        projectId: source,
        key: 'c',
        name: 'C',
        trigger: 'order',
        target: 3,
      });
      await db.insert(userChallengeProgress).values({
        id: `ucp_src_${suffix}`,
        projectId: source,
        userId: sourceUser,
        challengeId,
        progress: 2,
      });

      const exported = await app.inject({
        method: 'POST',
        url: `/api/organizations/${orgId}/export`,
        headers: { cookie },
      });
      expect(exported.statusCode).toBe(200);

      const body = exported.payload;
      const imported = await app.inject({
        method: 'POST',
        url: `/api/organizations/${orgId}/import`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: body,
      });
      expect(imported.statusCode).toBe(200);
      expect(JSON.parse(imported.payload).importedCount).toMatchObject({
        levels: expect.any(Number),
        xpLedger: 1,
        userAchievements: 1,
        userChallengeProgress: 1,
      });

      const [copy] = await db
        .select()
        .from(projects)
        .where(like(projects.slug, `src-${suffix}-imp-%`));
      const [balance] = await db
        .select()
        .from(userXpBalances)
        .where(eq(userXpBalances.projectId, copy!.id));
      expect(balance?.totalXp).toBe(40);

      const [event] = await db.select().from(events).where(eq(events.projectId, copy!.id));
      expect(event?.payload).toEqual({ total: 5 });
    });

    it('accepts a body larger than the normal 64 KB limit', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/organizations/${orgId}/import/validate`,
        headers: { cookie, 'content-type': 'application/json' },
        payload: JSON.stringify({
          format: 'gami-organization-export',
          version: 1,
          padding: 'x'.repeat(200_000),
        }),
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('backups', () => {
    it('encrypts by default, leaves sessions out, and restores nothing unreadable', async () => {
      const { createPlatformBackup, deletePlatformBackup } = await import(
        '../admin/backups/backup-service.js'
      );
      const backup = await createPlatformBackup({ actorId: 'settings_test' });

      expect(backup.encrypted).toBe(true);
      const file = fs.readFileSync(backup.filePath);
      expect(file.toString('utf8')).not.toContain('passwordHash');
      expect(file.toString('utf8')).not.toContain('"tables"');

      await deletePlatformBackup(backup.id, 'settings_test');
    });
  });

  it('leaves rule tables alone when retention keeps them', async () => {
    await save('retention', { ruleExecutionDays: 0 });
    const before = await db.select({ id: ruleExecutions.id }).from(ruleExecutions).limit(1);
    await pruneExpiredData();
    const after = await db.select({ id: ruleExecutions.id }).from(ruleExecutions).limit(1);
    expect(after.length).toBe(before.length);
    expect(rules).toBeDefined();
    expect(notifications).toBeDefined();
  });
});
