import { randomUUID } from 'crypto';
import {
  abuseFlags,
  apiKeys,
  clearFeatureCache,
  currencies,
  db,
  endUsers,
  featureSettings,
  member,
  notifications,
  organizationPolicies,
  organizations,
  projects,
  runMigrations,
  users,
  walletLots,
} from '@gami/database';
import { warnExpiringLots } from '@gami/rewards';
import { and, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkVelocity } from '../../../worker/src/abuse.js';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('platform controls: features, organization rules and access', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let adminCookie: string;
  let ownerCookie: string;
  let apiKey: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_pc_${suffix}`;
  const otherOrgId = `org_pc2_${suffix}`;
  const projectId = `prj_pc_${suffix}`;
  const otherProjectId = `prj_pc2_${suffix}`;
  const playerId = `usr_pc_${suffix}`;

  const signUp = async (label: string) => {
    const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `${label}_${randomUUID()}@example.com`, password: 'Password123!', name: label } });
    return { cookie: res.headers['set-cookie'] as string, id: JSON.parse(res.payload).user.id as string };
  };
  const as = (cookie: string) => async (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url, headers: { cookie }, payload: payload as object });
    return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
  };
  const admin = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => as(adminCookie)(method, url, payload);
  const owner = (method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => as(ownerCookie)(method, url, payload);
  const withKey = (method: 'GET' | 'POST', url: string, key = apiKey, remoteAddress?: string, payload?: unknown) =>
    app.inject({ method, url, headers: { 'x-api-key': key }, ...(remoteAddress ? { remoteAddress } : {}), payload: payload as object });

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values([
      { id: orgId, name: 'Controls', slug: `pc-${suffix}` },
      { id: otherOrgId, name: 'Other', slug: `pc2-${suffix}` },
    ]);
    await db.insert(projects).values([
      { id: projectId, organizationId: orgId, name: 'Main', slug: 'main' },
      { id: otherProjectId, organizationId: otherOrgId, name: 'Other', slug: 'other' },
    ]);
    await db.insert(endUsers).values({ id: playerId, projectId, externalId: `player_${suffix}`, name: 'Player' });

    const platformAdmin = await signUp('padmin');
    await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, platformAdmin.id));
    adminCookie = platformAdmin.cookie;

    const orgOwner = await signUp('owner');
    ownerCookie = orgOwner.cookie;
    await db.insert(member).values([
      { id: `mem_pc_${suffix}`, organizationId: orgId, userId: orgOwner.id, role: 'owner', createdAt: new Date() },
      { id: `mem_pc2_${suffix}`, organizationId: otherOrgId, userId: orgOwner.id, role: 'owner', createdAt: new Date() },
    ]);
    apiKey = (await createApiKey(projectId, 'Server', ['*'])).rawSecret;
  }, 120_000);

  afterAll(async () => {
    // Instance-wide rows would leak into other test files, so put the instance back as it was.
    await db.delete(featureSettings).where(isNull(featureSettings.organizationId));
    await db.delete(organizationPolicies).where(isNull(organizationPolicies.organizationId));
    clearFeatureCache();
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db.delete(organizations).where(eq(organizations.id, otherOrgId));
    await app.close();
  });

  describe('features for the whole instance', () => {
    it('is for platform administrators only', async () => {
      expect((await owner('GET', '/api/admin/features')).status).toBe(403);
      const list = await admin('GET', '/api/admin/features');
      expect(list.status).toBe(200);
      expect(list.body.data.find((feature: { key: string }) => feature.key === 'rules')).toMatchObject({ base: true, enabled: true });
    });

    it('never turns off a base feature', async () => {
      expect((await admin('PUT', '/api/admin/features/rules', { enabled: false })).body.code).toBe('BASE_FEATURE');
      expect((await admin('PUT', '/api/admin/features/nope', { enabled: false })).status).toBe(404);
    });

    it('asks before turning off what depends on a feature, then turns off both', async () => {
      const ask = await admin('PUT', '/api/admin/features/wallets', { enabled: false });
      expect(ask.status).toBe(409);
      expect(ask.body).toMatchObject({ code: 'CONFIRM_CASCADE', alsoOff: ['store'] });
      expect((await withKey('GET', '/v1/users/x/wallets')).statusCode).not.toBe(403); // nothing changed yet

      const done = await admin('PUT', '/api/admin/features/wallets', { enabled: false, confirmCascade: true });
      expect(done.status).toBe(200);
      expect(done.body.changes.map((change: { feature: string }) => change.feature)).toEqual(['wallets', 'store']);

      const blocked = await owner('GET', `/api/projects/${projectId}/currencies`);
      expect(blocked.status).toBe(403);
      expect(blocked.body).toMatchObject({ code: 'FEATURE_DISABLED', feature: 'wallets' });
      expect((await owner('GET', `/api/projects/${projectId}/rewards`)).body.feature).toBe('store');
      expect(JSON.parse((await withKey('GET', `/v1/users/${playerId}/wallets`)).payload).code).toBe('FEATURE_DISABLED');
      expect((await owner('GET', `/api/projects/${projectId}/rules`)).status).toBe(200);

      const token = JSON.parse((await withKey('POST', '/v1/end-user-tokens', apiKey, undefined, { userId: playerId })).payload).token;
      const me = await app.inject({ method: 'GET', url: '/v1/me/wallets', headers: { authorization: `Bearer ${token}` } });
      expect(me.statusCode).toBe(403);

      const features = await owner('GET', `/api/projects/${projectId}/features`);
      expect(features.body.features).toMatchObject({ wallets: false, store: false, rules: true });
    }, 120_000);

    it('turns on what a feature needs, after asking', async () => {
      const ask = await admin('PUT', '/api/admin/features/store', { enabled: true });
      expect(ask.body).toMatchObject({ code: 'CONFIRM_CASCADE', alsoOn: ['wallets'] });
      const preview = await admin('PUT', '/api/admin/features/store', { enabled: true, dryRun: true });
      expect(preview.status).toBe(200);
      await admin('PUT', '/api/admin/features/store', { enabled: true, confirmCascade: true });
      expect((await owner('GET', `/api/projects/${projectId}/currencies`)).status).toBe(200);
    }, 120_000);
  });

  describe('features for one organization', () => {
    it('turns a feature off for one organization only, and back', async () => {
      const off = await admin('PUT', `/api/admin/organizations/${orgId}/features/social`, { enabled: false });
      expect(off.status).toBe(200);
      expect(off.body.data.find((feature: { key: string }) => feature.key === 'social')).toMatchObject({ enabled: false, override: false, instanceEnabled: true });
      expect((await owner('GET', `/api/projects/${projectId}/users/${playerId}/friends`)).body.code).toBe('FEATURE_DISABLED');
      expect((await owner('GET', `/api/projects/${otherProjectId}/segments`)).status).toBe(200);

      const back = await admin('PUT', `/api/admin/organizations/${orgId}/features/social`, { enabled: true });
      expect(back.body.data.find((feature: { key: string }) => feature.key === 'social')).toMatchObject({ enabled: true, override: null });
      expect((await owner('GET', `/api/projects/${projectId}/users/${playerId}/friends`)).status).toBe(200);
    }, 120_000);

    it('cannot give an organization something the instance has off', async () => {
      await admin('PUT', '/api/admin/features/leagues', { enabled: false, confirmCascade: true });
      const refused = await admin('PUT', `/api/admin/organizations/${orgId}/features/leagues`, { enabled: true });
      expect(refused.status).toBe(409);
      expect(refused.body).toMatchObject({ code: 'INSTANCE_OFF', blockedBy: ['leagues'] });
      await admin('PUT', '/api/admin/features/leagues', { enabled: true });
    }, 120_000);

    it('resets an organization to the instance settings', async () => {
      await admin('PUT', `/api/admin/organizations/${orgId}/features/leaderboards`, { enabled: false, confirmCascade: true });
      const reset = await admin('DELETE', `/api/admin/organizations/${orgId}/features`);
      expect(reset.body.data.every((feature: { override: unknown }) => feature.override === null)).toBe(true);
    }, 120_000);
  });

  describe('organization rules', () => {
    it('validates rules, and shows defaults beside an organization\'s own', async () => {
      expect((await admin('PUT', '/api/admin/policies', { apiIpAllowlist: ['999.1.1.1'] })).status).toBe(400);
      expect((await admin('PUT', '/api/admin/policies', { allowedEmailDomains: ['not a domain'] })).status).toBe(400);
      expect((await admin('PUT', '/api/admin/policies', { maxProjects: 50 })).status).toBe(200);
      const own = await admin('GET', `/api/admin/organizations/${orgId}/policy`);
      expect(own.body).toMatchObject({ own: { maxProjects: null }, effective: { maxProjects: 50 }, defaults: { maxProjects: 50 } });
    }, 120_000);

    it('limits projects and who can be invited', async () => {
      await admin('PUT', `/api/admin/organizations/${orgId}/policy`, { maxProjects: 1, allowedEmailDomains: ['example.org'], maxMembers: 5 });
      const project = await owner('POST', '/api/projects', { organizationId: orgId, name: 'Second', slug: `second-${suffix}` });
      expect(project.body.code).toBe('PROJECT_LIMIT');
      const invite = await owner('POST', `/api/organizations/${orgId}/invitations`, { email: 'someone@example.com' });
      expect(invite.body.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
      expect((await owner('POST', `/api/organizations/${orgId}/invitations`, { email: 'someone@team.example.org' })).status).toBe(201);
      expect((await owner('POST', '/api/projects', { organizationId: otherOrgId, name: 'Fine', slug: `fine-${suffix}` })).status).toBe(201);
    }, 120_000);

    it('caps API key lifetimes', async () => {
      await admin('PUT', `/api/admin/organizations/${orgId}/policy`, { apiKeyMaxLifetimeDays: 30 });
      const made = await owner('POST', `/api/projects/${projectId}/api-keys`, { name: 'Default expiry' });
      expect(made.status).toBe(201);
      const days = (new Date(made.body.expiresAt).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(29.9);
      expect(days).toBeLessThan(30.1);
      const tooLong = await owner('POST', `/api/projects/${projectId}/api-keys`, { name: 'Too long', expiresAt: new Date(Date.now() + 90 * 86_400_000).toISOString() });
      expect(tooLong.body.code).toBe('KEY_LIFETIME_TOO_LONG');
    }, 120_000);

    it('only lets API keys in from allowed addresses, events included', async () => {
      await admin('PUT', `/api/admin/organizations/${orgId}/policy`, { apiIpAllowlist: ['203.0.113.0/24'] });
      expect(JSON.parse((await withKey('GET', '/v1/users')).payload).code).toBe('IP_NOT_ALLOWED');
      expect((await withKey('GET', '/v1/users', apiKey, '203.0.113.9')).statusCode).toBe(200);
      const event = await withKey('POST', '/v1/events', apiKey, '198.51.100.1', { event: 'x', user_id: 'u' });
      expect(JSON.parse(event.payload).code).toBe('IP_NOT_ALLOWED');
      await admin('PUT', `/api/admin/organizations/${orgId}/policy`, { apiIpAllowlist: [] });
      expect((await withKey('GET', '/v1/users')).statusCode).toBe(200);
    }, 120_000);

    it('can require projects to list their sites before player tokens work', async () => {
      await admin('PUT', `/api/admin/organizations/${orgId}/policy`, { requireAllowedOrigins: true });
      const token = JSON.parse((await withKey('POST', '/v1/end-user-tokens', apiKey, undefined, { userId: playerId })).payload).token;
      const refused = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${token}` } });
      expect(JSON.parse(refused.payload).code).toBe('ORIGINS_REQUIRED');
      await db.update(projects).set({ allowedOrigins: ['https://app.example.org'] }).where(eq(projects.id, projectId));
      const allowed = await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${token}`, origin: 'https://app.example.org' } });
      expect(allowed.statusCode).toBe(200);
      await admin('PUT', `/api/admin/organizations/${orgId}/policy`, { requireAllowedOrigins: null });
    }, 120_000);

    it('limits event requests per minute', async () => {
      // Redis connects lazily and the limit fails open while it does, so wake it first.
      await (await import('@gami/queue')).getRedisConnection().ping().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await admin('PUT', `/api/admin/organizations/${orgId}/policy`, { eventsPerMinute: 2 });
      const statuses = [];
      for (let i = 0; i < 3; i++) statuses.push((await withKey('POST', '/v1/events', apiKey, undefined, { event: 'tick', user_id: `rate_${suffix}` })).statusCode);
      expect(statuses.slice(0, 2).every((status) => status === 201 || status === 202)).toBe(true);
      expect(statuses[2]).toBe(429);
      await admin('PUT', `/api/admin/organizations/${orgId}/policy`, { eventsPerMinute: null });
    }, 120_000);
  });

  describe('people and access', () => {
    it('keeps an owner, changes roles, revokes keys and signs people out', async () => {
      const people = await admin('GET', `/api/admin/organizations/${orgId}/members`);
      expect(people.body.members).toHaveLength(1);
      const [only] = people.body.members;
      expect((await admin('PATCH', `/api/admin/organizations/${orgId}/members/${only.id}`, { role: 'member' })).body.code).toBe('LAST_OWNER');
      expect((await admin('DELETE', `/api/admin/organizations/${orgId}/members/${only.id}`)).body.code).toBe('LAST_OWNER');

      const revoked = await admin('POST', `/api/admin/organizations/${orgId}/revoke-api-keys`, {});
      expect(revoked.body.revoked).toBeGreaterThan(0);
      const live = await db.select().from(apiKeys).where(and(eq(apiKeys.projectId, projectId), isNull(apiKeys.revokedAt)));
      expect(live).toHaveLength(0);
      expect((await withKey('GET', '/v1/users')).statusCode).toBe(401);
      apiKey = (await createApiKey(projectId, 'Again', ['*'])).rawSecret;

      const signedOut = await admin('POST', `/api/admin/organizations/${orgId}/sign-out`, {});
      expect(signedOut.body.sessionsEnded).toBeGreaterThan(0);
      expect((await owner('GET', `/api/projects/${projectId}/rules`)).status).toBe(401);
    }, 120_000);
  });

  describe('leftovers from the economy work', () => {
    it('flags fast earners, hides them when asked, and clears the hide on dismissal', async () => {
      const fast = `usr_fast_${suffix}`;
      await db.insert(endUsers).values({ id: fast, projectId, externalId: `fast_${suffix}`, name: 'Fast' });
      const { awardXp } = await import('@gami/rewards');
      await db.transaction((tx) => awardXp(tx, { projectId, userId: fast, amount: 900, reason: 'Burst', idempotencyKey: randomUUID() }));

      expect(await checkVelocity(projectId, fast)).toBe(0); // flags are off until set up
      await db.insert((await import('@gami/database')).abuseSettings).values({ projectId, enabled: true, xpPerHour: 500, autoHide: true });
      expect(await checkVelocity(projectId, fast)).toBe(1);
      expect(await checkVelocity(projectId, fast)).toBe(0); // once an hour
      const [person] = await db.select().from(endUsers).where(eq(endUsers.id, fast));
      expect(person?.rankingHidden).toBe(true);

      const apiKeyAgain = (await createApiKey(projectId, 'Flags', ['*'])).rawSecret;
      void apiKeyAgain;
      const ownerAgain = (await signUp('owner2'));
      await db.insert(member).values({ id: `mem_pc3_${suffix}`, organizationId: orgId, userId: ownerAgain.id, role: 'owner', createdAt: new Date() });
      const flags = await as(ownerAgain.cookie)('GET', `/api/projects/${projectId}/abuse/flags`);
      expect(flags.body.data[0]).toMatchObject({ userId: fast, kind: 'xp_velocity', observed: 900, threshold: 500 });
      await as(ownerAgain.cookie)('POST', `/api/projects/${projectId}/abuse/flags/${flags.body.data[0].id}`, { action: 'dismiss' });
      const [after] = await db.select().from(endUsers).where(eq(endUsers.id, fast));
      expect(after?.rankingHidden).toBe(false);
      const [flag] = await db.select().from(abuseFlags).where(eq(abuseFlags.userId, fast));
      expect(flag?.status).toBe('dismissed');
    }, 120_000);

    it('makes a fresh coupon for each purchase, and warns before points expire', async () => {
      const ownerAgain = await signUp('owner3');
      await db.insert(member).values({ id: `mem_pc4_${suffix}`, organizationId: orgId, userId: ownerAgain.id, role: 'owner', createdAt: new Date() });
      const call = as(ownerAgain.cookie);
      const base = `/api/projects/${projectId}`;
      await call('POST', `${base}/currencies`, { key: 'gems', name: 'Gems' });
      expect((await call('POST', `${base}/rewards`, { key: 'coupon', name: 'Coupon', currency: 'gems', cost: 5, kind: 'generated', codePrefix: 'GC-' })).status).toBe(201);
      await call('POST', `${base}/users/${playerId}/wallets/gems/adjust`, { amount: 20, reason: 'Test' });

      const first = await call('POST', `${base}/users/${playerId}/rewards/coupon/redeem`, {});
      const second = await call('POST', `${base}/users/${playerId}/rewards/coupon/redeem`, {});
      expect(first.body).toMatchObject({ status: 'fulfilled' });
      expect(first.body.code).toMatch(/^GC-[A-Z2-9]{10}$/);
      expect(second.body.code).not.toBe(first.body.code);

      const [gems] = await db.select().from(currencies).where(and(eq(currencies.projectId, projectId), eq(currencies.key, 'gems')));
      await db.update(walletLots).set({ expiresAt: new Date(Date.now() + 2 * 86_400_000) }).where(eq(walletLots.currencyId, gems!.id));
      expect(await warnExpiringLots()).toBeGreaterThanOrEqual(1);
      expect(await warnExpiringLots()).toBe(0); // once per lot
      const notes = await db.select().from(notifications).where(and(eq(notifications.userId, playerId), eq(notifications.type, 'points_expiring')));
      expect(notes).toHaveLength(1);
      expect(notes[0]!.message).toContain('10 Gems');
    }, 120_000);
  });
});
