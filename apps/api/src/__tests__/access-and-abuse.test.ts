/** Connectors, rate-limit counting, sign-in lockout, the bootstrap secret and unsubscribe links. */
import { randomUUID } from 'crypto';
import {
  auditLogs,
  db,
  endUsers,
  featureSettings,
  member,
  notificationPreferences,
  organizationPolicies,
  organizations,
  projects,
  runMigrations,
} from '@gami/database';
import { createUnsubscribeToken } from '@gami/notifications';
import { getRedisConnection } from '@gami/queue';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { countWithExpiry } from '../middleware/rate-limiter.js';
import { createApiKey } from '../services/api-key.service.js';

describe('access, abuse and limits', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_aa_${suffix}`;
  const projectId = `prj_aa_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const call = async (
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    url: string,
    payload?: unknown
  ) => {
    const res = await app.inject({
      method,
      url: `${base}${url}`,
      headers: { cookie },
      payload: payload as object,
    });
    return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'AA', slug: `aa-${suffix}` });
    await db
      .insert(projects)
      .values({ id: projectId, organizationId: orgId, name: 'Production', slug: 'prod' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `aa_${randomUUID()}@example.com`, password: 'Password123!', name: 'AA' },
    });
    cookie = res.headers['set-cookie'] as string;
    await db
      .insert(member)
      .values({
        id: `mem_${suffix}`,
        organizationId: orgId,
        userId: JSON.parse(res.payload).user.id,
        role: 'owner',
        createdAt: new Date(),
      });
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });


  describe('connectors', () => {
    const event = (id: string) =>
      JSON.stringify({
        type: 'track',
        event: 'Order Completed',
        userId: `seg_${suffix}`,
        messageId: id,
        properties: { total: 1 },
      });
    const send = (connectorId: string, secret: string, id: string) =>
      app.inject({
        method: 'POST',
        url: `/v1/connectors/${connectorId}`,
        payload: event(id),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${secret}` },
      });

    it('records every change to a connector', async () => {
      const created = await call('POST', '/connectors', { type: 'segment', name: 'Audited' });
      expect(created.status).toBe(201);
      await call('PATCH', `/connectors/${created.body.id}`, { name: 'Renamed' });
      await call('POST', `/connectors/${created.body.id}/rotate`);
      await call('DELETE', `/connectors/${created.body.id}`);

      const actions = (
        await db
          .select()
          .from(auditLogs)
          .where(and(eq(auditLogs.projectId, projectId), eq(auditLogs.resourceId, created.body.id)))
      ).map((row) => row.action);
      expect(actions.sort()).toEqual([
        'connector.created',
        'connector.deleted',
        'connector.secret_rotated',
        'connector.updated',
      ]);
    });

    it('stops taking events when the organization is suspended or connectors are switched off', async () => {
      const created = await call('POST', '/connectors', { type: 'segment', name: 'Gate' });
      const { id, secret } = created.body as { id: string; secret: string };
      expect((await send(id, secret, `ok_${suffix}`)).statusCode).toBe(202);

      await db
        .update(organizations)
        .set({ status: 'suspended' })
        .where(eq(organizations.id, orgId));
      expect((await send(id, secret, `sus_${suffix}`)).statusCode).toBe(403);
      await db.update(organizations).set({ status: 'active' }).where(eq(organizations.id, orgId));

      // A second organization, so the feature switch is read fresh and not from a cache.
      const offOrg = `org_off_${suffix}`;
      const offProject = `prj_off_${suffix}`;
      await db.insert(organizations).values({ id: offOrg, name: 'Off', slug: `off-${suffix}` });
      await db
        .insert(projects)
        .values({ id: offProject, organizationId: offOrg, name: 'Production', slug: 'prod' });
      const { connectors } = await import('@gami/database');
      const { encryptSecret } = await import('@gami/webhooks');
      await db
        .insert(connectors)
        .values({
          id: `con_off_${suffix}`,
          projectId: offProject,
          type: 'segment',
          name: 'Off',
          secretEncrypted: encryptSecret('gcs_off_secret'),
          settings: {},
        });
      await db
        .insert(featureSettings)
        .values({
          id: `fs_${suffix}`,
          organizationId: offOrg,
          feature: 'connectors',
          enabled: false,
        });

      const refused = await send(`con_off_${suffix}`, 'gcs_off_secret', `off_${suffix}`);
      expect(refused.statusCode).toBe(403);
      expect(JSON.parse(refused.payload).code).toBe('FEATURE_DISABLED');
      await db.delete(organizations).where(eq(organizations.id, offOrg));
    }, 120_000);

    it("counts connector requests against the organization's event limit", async () => {
      const limitedOrg = `org_lim_${suffix}`;
      const limitedProject = `prj_lim_${suffix}`;
      await db
        .insert(organizations)
        .values({ id: limitedOrg, name: 'Limited', slug: `lim-${suffix}` });
      await db
        .insert(projects)
        .values({
          id: limitedProject,
          organizationId: limitedOrg,
          name: 'Production',
          slug: 'prod',
        });
      await db
        .insert(organizationPolicies)
        .values({ id: `pol_lim_${suffix}`, organizationId: limitedOrg, eventsPerMinute: 2 });
      const { connectors } = await import('@gami/database');
      const { encryptSecret } = await import('@gami/webhooks');
      await db
        .insert(connectors)
        .values({
          id: `con_lim_${suffix}`,
          projectId: limitedProject,
          type: 'segment',
          name: 'Limited',
          secretEncrypted: encryptSecret('gcs_lim_secret'),
          settings: {},
        });

      const statuses: number[] = [];
      for (let i = 0; i < 4; i++)
        statuses.push(
          (await send(`con_lim_${suffix}`, 'gcs_lim_secret', `lim_${suffix}_${i}`)).statusCode
        );
      // The minute can turn over part way, so only the end is certain.
      expect(statuses.slice(0, 2)).toEqual([202, 202]);
      expect(statuses).toContain(429);
      await db.delete(organizations).where(eq(organizations.id, limitedOrg));
    }, 120_000);
  });


  it('authenticates and counts a /v1 call once, though it is served by an inner call', async () => {
    const apiKey = (await createApiKey(projectId, 'Server', ['users:read'])).rawSecret;
    const before = process.env['RATE_LIMIT_IP_MAX'];
    process.env['RATE_LIMIT_IP_MAX'] = '1000';
    try {
      const address = `10.9.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
      const keys = async () =>
        (await getRedisConnection().keys(`ratelimit:ip:${address}:*`)).length;
      const res = await app.inject({
        method: 'GET',
        url: '/v1/users',
        headers: { 'x-api-key': apiKey },
        remoteAddress: address,
      });
      expect(res.statusCode).toBe(200);
      expect(await keys()).toBe(1);
      const [key] = await getRedisConnection().keys(`ratelimit:ip:${address}:*`);
      expect(await getRedisConnection().get(key!)).toBe('1');
    } finally {
      if (before === undefined) delete process.env['RATE_LIMIT_IP_MAX'];
      else process.env['RATE_LIMIT_IP_MAX'] = before;
    }

    // The marker that skips the limit cannot be sent from outside.
    const forged = await app.inject({
      method: 'GET',
      url: `${base}/users`,
      headers: { 'x-api-key': 'gami_live_nope', 'x-gami-internal': 'guess.guess' },
    });
    expect(forged.statusCode).toBe(401);
  });


  it('never leaves a rate-limit counter without an expiry', async () => {
    const redis = getRedisConnection();
    const key = `ratelimit:test:${suffix}`;
    expect(await countWithExpiry(redis, key, 30)).toBe(1);
    expect(await countWithExpiry(redis, key, 30)).toBe(2);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(30);
    await redis.del(key);
  });


  it('locks out the address that guessed wrong, not the owner of the account', async () => {
    const email = `lock_${randomUUID()}@example.com`;
    await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email, password: 'Password123!', name: 'Lock' },
    });
    const { getPlatformSettings } = await import('@gami/database');
    const { maxFailedLoginAttempts } = await getPlatformSettings('security');

    const signIn = (password: string, remoteAddress: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/email',
        payload: { email, password },
        remoteAddress,
      });

    const stranger = '203.0.113.7';
    for (let i = 0; i < maxFailedLoginAttempts; i++) await signIn('wrong-password', stranger);
    const locked = await signIn('Password123!', stranger);
    expect(locked.statusCode).toBe(429);
    expect(JSON.parse(locked.payload).code).toBe('ACCOUNT_LOCKED');

    // The owner, from their own address, is not affected.
    expect((await signIn('Password123!', '198.51.100.9')).statusCode).toBe(200);
  }, 120_000);


  it('allows only a few guesses at the bootstrap secret', async () => {
    const before = process.env['PLATFORM_BOOTSTRAP_SECRET'];
    process.env['PLATFORM_BOOTSTRAP_SECRET'] = `secret-${suffix}`;
    try {
      const address = `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
      const guess = () =>
        app.inject({
          method: 'POST',
          url: '/api/admin/bootstrap',
          headers: { cookie },
          payload: { bootstrapSecret: 'not-it' },
          remoteAddress: address,
        });
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) statuses.push((await guess()).statusCode);
      // 401 for a wrong secret, or 409 when this database already has an administrator.
      expect(statuses.slice(0, 5).every((status) => status === 401 || status === 409)).toBe(true);
      expect(statuses.slice(5)).toEqual([429, 429]);
    } finally {
      if (before === undefined) delete process.env['PLATFORM_BOOTSTRAP_SECRET'];
      else process.env['PLATFORM_BOOTSTRAP_SECRET'] = before;
    }
  }, 120_000);


  it('asks before unsubscribing, and accepts the form a mail client posts', async () => {
    const userId = `usr_unsub_${suffix}`;
    await db.insert(endUsers).values({ id: userId, projectId, externalId: `unsub_${suffix}` });
    const url = `/v1/email/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken({ projectId, userId }))}`;
    const preferences = () =>
      db
        .select()
        .from(notificationPreferences)
        .where(
          and(
            eq(notificationPreferences.userId, userId),
            eq(notificationPreferences.channel, 'email')
          )
        );

    // Opening the link, as a mail scanner does, changes nothing.
    const opened = await app.inject({ method: 'GET', url });
    expect(opened.statusCode).toBe(200);
    expect(opened.headers['content-type']).toContain('text/html');
    expect(opened.payload).toContain('<form method="post"');
    expect(await preferences()).toEqual([]);

    const posted = await app.inject({
      method: 'POST',
      url,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'List-Unsubscribe=One-Click',
    });
    expect(posted.statusCode).toBe(200);
    const saved = await preferences();
    expect(saved).toHaveLength(4);
    expect(saved.every((row) => row.enabled === false)).toBe(true);

    expect((await app.inject({ method: 'GET', url: `${url}x` })).statusCode).toBe(400);
  });

  it('gives signed-in staff a read-only token to preview one player, and nobody else', async () => {
    const userId = `usr_preview_${suffix}`;
    await db.insert(endUsers).values({ id: userId, projectId, externalId: `preview_${suffix}`, name: 'Preview' });

    const made = await call('POST', `/users/${userId}/preview-token`);
    expect(made.status).toBe(201);
    expect(made.body.access).toBe('read');

    const headers = { authorization: `Bearer ${made.body.token}` };
    const me = await app.inject({ method: 'GET', url: '/v1/me', headers });
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.payload).name).toBe('Preview');
    // It cannot change anything for the player.
    const write = await app.inject({ method: 'POST', url: '/v1/me/kudos', headers, payload: { code: 'ABCD2345' } });
    expect(JSON.parse(write.payload).code).toBe('TOKEN_READ_ONLY');

    // An API key has its own way to make tokens, and does not get this one.
    const apiKey = (await createApiKey(projectId, 'Server', ['users:write'])).rawSecret;
    const withKey = await app.inject({ method: 'POST', url: `${base}/users/${userId}/preview-token`, headers: { 'x-api-key': apiKey } });
    expect(withKey.statusCode).toBe(403);

    const signedOut = await app.inject({ method: 'POST', url: `${base}/users/${userId}/preview-token` });
    expect(signedOut.statusCode).toBe(401);
  });
});
