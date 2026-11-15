/** Proxy trust, limits per key and player, ending tokens, and batches (SUG-01, SUG-03, SUG-04, SUG-10). */
import { randomUUID } from 'crypto';
import { db, endUsers, events, organizations, projects, runMigrations } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer, trustProxySetting } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('hardening', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_hd_${suffix}`;
  const projectId = `prj_hd_${suffix}`;
  const saved = {
    key: process.env['RATE_LIMIT_KEY_MAX'],
    player: process.env['RATE_LIMIT_PLAYER_MAX'],
  };

  const makeUser = async (label: string, active = true) => {
    const id = `usr_${label}_${suffix}`;
    await db
      .insert(endUsers)
      .values({ id, projectId, externalId: `${label}_${suffix}`, name: label, active });
    return id;
  };
  const withKey = (apiKey: string, method: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method, url, headers: { 'x-api-key': apiKey }, payload: payload as object });

  beforeAll(async () => {
    // Set before the server reads its settings, so the limits below are the ones in force.
    process.env['RATE_LIMIT_KEY_MAX'] = '3';
    process.env['RATE_LIMIT_PLAYER_MAX'] = '4';
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'HD', slug: `hd-${suffix}` });
    await db
      .insert(projects)
      .values({ id: projectId, organizationId: orgId, name: 'Production', slug: 'prod' });
  }, 120_000);

  afterAll(async () => {
    for (const [name, value] of [
      ['RATE_LIMIT_KEY_MAX', saved.key],
      ['RATE_LIMIT_PLAYER_MAX', saved.player],
    ] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  // ---------- SUG-01 ----------

  it('reads TRUST_PROXY as off, on, a number of proxies, or a list of addresses', () => {
    expect(trustProxySetting(undefined)).toBe(false);
    expect(trustProxySetting('')).toBe(false);
    expect(trustProxySetting('false')).toBe(false);
    expect(trustProxySetting('true')).toBe(true);
    expect(trustProxySetting('1')).toBe(1);
    expect(trustProxySetting('2')).toBe(2);
    expect(trustProxySetting('10.0.0.5')).toBe('10.0.0.5');
    expect(trustProxySetting('10.0.0.0/8, 172.16.0.0/12')).toBe('10.0.0.0/8,172.16.0.0/12');
    // A typo must never end up trusting everyone.
    expect(trustProxySetting('yes')).toBe(false);
    expect(trustProxySetting('10.0.0.0/8, proxy.local')).toBe(false);
  });

  it('takes the client address from the trusted proxy only', async () => {
    const before = process.env['TRUST_PROXY'];
    try {
      const addressSeen = async (setting: string) => {
        process.env['TRUST_PROXY'] = setting;
        const server = await buildServer();
        server.get('/__ip', async (request) => ({ ip: request.ip }));
        await server.ready();
        const res = await server.inject({
          method: 'GET',
          url: '/__ip',
          headers: { 'x-forwarded-for': '203.0.113.9, 10.0.0.5' },
          remoteAddress: '10.0.0.5',
        });
        await server.close();
        return JSON.parse(res.payload).ip as string;
      };
      // Nobody trusted: the header a client sent is ignored.
      expect(await addressSeen('false')).toBe('10.0.0.5');
      // The connecting proxy is trusted, and so is the one named in the header: the client is next.
      expect(await addressSeen('10.0.0.5')).toBe('203.0.113.9');
      // Some other proxy is trusted, not this one: the header is ignored.
      expect(await addressSeen('192.168.1.1')).toBe('10.0.0.5');
    } finally {
      if (before === undefined) delete process.env['TRUST_PROXY'];
      else process.env['TRUST_PROXY'] = before;
    }
  }, 120_000);

  // ---------- SUG-03 ----------

  it('limits how fast one API key can call, apart from other keys', async () => {
    const first = (await createApiKey(projectId, 'One', ['users:read'])).rawSecret;
    const second = (await createApiKey(projectId, 'Two', ['users:read'])).rawSecret;

    const statuses: number[] = [];
    for (let i = 0; i < 5; i++)
      statuses.push((await withKey(first, 'GET', '/v1/users')).statusCode);
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses).toContain(429);

    // Another key has its own allowance.
    expect((await withKey(second, 'GET', '/v1/users')).statusCode).toBe(200);
  });

  it('limits how fast one player can call, apart from other players', async () => {
    const serverKey = (await createApiKey(projectId, 'Tokens', ['users:write'])).rawSecret;
    const tokenFor = async (userId: string) =>
      JSON.parse((await withKey(serverKey, 'POST', '/v1/end-user-tokens', { userId })).payload)
        .token as string;
    const busy = await tokenFor(await makeUser('busy'));
    const calm = await tokenFor(await makeUser('calm'));
    const me = (token: string) =>
      app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${token}` } });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await me(busy)).statusCode);
    expect(statuses.slice(0, 4)).toEqual([200, 200, 200, 200]);
    expect(statuses).toContain(429);
    expect((await me(calm)).statusCode).toBe(200);
  });

  // ---------- SUG-04 ----------

  it("ends a player's tokens when the server asks, and lets new ones work", async () => {
    const serverKey = (await createApiKey(projectId, 'Revoke', ['users:write'])).rawSecret;
    const userId = await makeUser('signout');
    const newToken = async () =>
      JSON.parse((await withKey(serverKey, 'POST', '/v1/end-user-tokens', { userId })).payload)
        .token as string;
    const me = (token: string) =>
      app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${token}` } });

    const old = await newToken();
    expect((await me(old)).statusCode).toBe(200);

    const revoked = await withKey(serverKey, 'POST', `/v1/users/signout_${suffix}/tokens/revoke`);
    expect(revoked.statusCode).toBe(200);
    expect(JSON.parse(revoked.payload)).toEqual({ revoked: true });

    const refused = await me(old);
    expect(refused.statusCode).toBe(401);
    expect(JSON.parse(refused.payload).code).toBe('TOKEN_REVOKED');
    expect((await me(await newToken())).statusCode).toBe(200);

    // The counter behind this is not part of a user as the API shows one.
    const user = await withKey(serverKey, 'GET', `/v1/users/${userId}`);
    expect(user.statusCode).toBe(200);
    expect(JSON.parse(user.payload)).not.toHaveProperty('tokenVersion');
  });

  // ---------- SUG-10 ----------

  it('takes a batch in one go, and still answers for each event', async () => {
    const eventsKey = (await createApiKey(projectId, 'Events', ['events:write'])).rawSecret;
    await makeUser('gone', false);
    const item = (user: string, key: string) => ({
      event: 'lesson_completed',
      user_id: `${user}_${suffix}`,
      payload: { n: 1 },
      idempotency_key: key,
    });

    const res = await withKey(eventsKey, 'POST', '/v1/events/batch', {
      events: [
        item('a', `k1_${suffix}`),
        item('b', `k2_${suffix}`),
        item('a', `k1_${suffix}`),
        item('gone', `k3_${suffix}`),
      ],
    });
    expect(res.statusCode).toBe(207);
    const body = JSON.parse(res.payload) as {
      accepted: number;
      results: { index: number; status: string; duplicate?: boolean; code?: string }[];
    };
    expect(body.results.map((result) => result.status)).toEqual([
      'accepted',
      'accepted',
      'accepted',
      'rejected',
    ]);
    expect(body.results[2]!.duplicate).toBe(true);
    expect(body.results[3]!.code).toBe('USER_DEACTIVATED');

    const stored = await db
      .select()
      .from(events)
      .where(and(eq(events.projectId, projectId), eq(events.type, 'lesson_completed')));
    expect(stored).toHaveLength(2);

    // Sending it again changes nothing.
    const again = JSON.parse(
      (
        await withKey(eventsKey, 'POST', '/v1/events/batch', {
          events: [item('a', `k1_${suffix}`), item('b', `k2_${suffix}`)],
        })
      ).payload
    );
    expect(
      again.results.every((result: { duplicate?: boolean }) => result.duplicate === true)
    ).toBe(true);
    expect(
      await db
        .select()
        .from(events)
        .where(and(eq(events.projectId, projectId), eq(events.type, 'lesson_completed')))
    ).toHaveLength(2);
  }, 120_000);
});
