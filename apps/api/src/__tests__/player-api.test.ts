/** Player tokens and the `/v1/me` routes. */
import { randomUUID } from 'crypto';
import {
  achievements,
  currencies,
  db,
  endUsers,
  organizations,
  projects,
  rewards,
  runMigrations,
  userAchievements,
} from '@gami/database';
import { creditWallet } from '@gami/rewards';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { redactUrl } from '../middleware/request-tracing.js';
import { createApiKey } from '../services/api-key.service.js';

describe('player tokens and the player API', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let apiKey: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_pa_${suffix}`;
  const projectId = `prj_pa_${suffix}`;

  const makeUser = async (label: string) => {
    const id = `usr_${label}_${suffix}`;
    await db
      .insert(endUsers)
      .values({ id, projectId, externalId: `${label}_${suffix}`, name: label });
    return id;
  };
  const tokenFor = async (userId: string, access?: 'read' | 'write') => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/end-user-tokens',
      headers: { 'x-api-key': apiKey },
      payload: { userId, ...(access ? { access } : {}) },
    });
    return JSON.parse(res.payload) as { token: string; access: string };
  };
  /** A player with a write token, unless told otherwise. */
  const asPlayer = async (userId: string, access: 'read' | 'write' = 'write') => {
    const { token } = await tokenFor(userId, access);
    return async (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
      const res = await app.inject({
        method,
        url,
        headers: { authorization: `Bearer ${token}` },
        payload: payload as object,
      });
      return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
    };
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'PA', slug: `pa-${suffix}` });
    await db
      .insert(projects)
      .values({ id: projectId, organizationId: orgId, name: 'Production', slug: 'prod' });
    apiKey = (await createApiKey(projectId, 'Server', ['users:write'])).rawSecret;
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });


  it('lets a browser on another site send the requests that change things', async () => {
    for (const method of ['POST', 'DELETE']) {
      const preflight = await app.inject({
        method: 'OPTIONS',
        url: '/v1/me/friends',
        headers: {
          origin: 'https://app.example.com',
          'access-control-request-method': method,
          'access-control-request-headers': 'authorization,content-type',
        },
      });
      expect(preflight.statusCode).toBe(204);
      expect(String(preflight.headers['access-control-allow-methods'])).toContain(method);
      expect(preflight.headers['access-control-allow-origin']).toBe('https://app.example.com');
    }
  });


  it('makes read-only tokens unless write is asked for', async () => {
    const ada = await makeUser('ada');
    expect((await tokenFor(ada)).access).toBe('read');
    expect((await tokenFor(ada, 'write')).access).toBe('write');

    const reader = await asPlayer(ada, 'read');
    expect((await reader('GET', '/v1/me')).status).toBe(200);
    for (const [method, url, body] of [
      ['POST', '/v1/me/friends', { code: 'ABCD2345' }],
      ['POST', '/v1/me/kudos', { code: 'ABCD2345' }],
      ['POST', '/v1/me/referral', { code: 'ABCD2345' }],
      ['POST', '/v1/me/rewards/anything/redeem', {}],
      ['POST', '/v1/me/devices', { token: 'x'.repeat(32), platform: 'ios' }],
      ['DELETE', '/v1/me/friends/ABCD2345', undefined],
    ] as const) {
      const res = await reader(method, url, body);
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.code).toBe('TOKEN_READ_ONLY');
    }

    const writer = await asPlayer(ada, 'write');
    expect((await writer('POST', '/v1/me/friends', { code: 'ABCD2345' })).status).toBe(404);
  });


  it("never shows one player another player's purchase through its idempotency key", async () => {
    const buyer = await makeUser('buyer');
    const other = await makeUser('other');
    const currencyId = `cur_${suffix}`;
    await db.insert(currencies).values({ id: currencyId, projectId, key: 'coins', name: 'Coins' });
    await db
      .insert(rewards)
      .values({
        id: `rwd_${suffix}`,
        projectId,
        key: 'coupon',
        name: 'Coupon',
        currencyId,
        cost: 10,
        kind: 'generated',
      });
    const [currency] = await db.select().from(currencies).where(eq(currencies.id, currencyId));
    for (const userId of [buyer, other]) {
      await db.transaction((tx) =>
        creditWallet(tx, currency!, { projectId, userId, amount: 50, reason: 'Test', kind: 'earn' })
      );
    }

    const asBuyer = await asPlayer(buyer);
    const asOther = await asPlayer(other);
    const bought = await asBuyer('POST', '/v1/me/rewards/coupon/redeem', {
      idempotencyKey: 'order-1',
    });
    expect(bought.status).toBe(201);
    expect(bought.body.code).toBeTruthy();

    // The buyer's own retry gets the same purchase back.
    const again = await asBuyer('POST', '/v1/me/rewards/coupon/redeem', {
      idempotencyKey: 'order-1',
    });
    expect(again.body).toMatchObject({ id: bought.body.id, duplicate: true });

    const stolen = await asOther('POST', '/v1/me/rewards/coupon/redeem', {
      idempotencyKey: 'order-1',
    });
    expect(stolen.status).toBe(409);
    expect(stolen.body.code).toBe('IDEMPOTENCY_KEY_IN_USE');
    expect(JSON.stringify(stolen.body)).not.toContain(bought.body.code);
  }, 120_000);


  it('makes two players friends only after the second one accepts', async () => {
    const max = await makeUser('max');
    const noa = await makeUser('noa');
    const eve = await makeUser('eve');
    const asMax = await asPlayer(max);
    const asNoa = await asPlayer(noa);
    const asEve = await asPlayer(eve);
    const noaCode = (await asNoa('GET', '/v1/me/referral')).body.code as string;
    const maxCode = (await asMax('GET', '/v1/me/referral')).body.code as string;

    // Having someone's code is not enough to see anything of theirs.
    const asked = await asMax('POST', '/v1/me/friends', { code: noaCode });
    expect(asked.status).toBe(201);
    expect(asked.body).toEqual({ friends: false, status: 'requested' });
    expect((await asMax('GET', '/v1/me/friends')).body.data).toEqual([]);
    expect((await asNoa('GET', '/v1/me/friends')).body.data).toEqual([]);

    const waiting = (await asNoa('GET', '/v1/me/friends/requests')).body.data;
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ name: 'max', code: maxCode });
    expect(JSON.stringify(waiting)).not.toContain(max);

    // Only the player who was asked can accept.
    expect((await asEve('POST', `/v1/me/friends/requests/${maxCode}/accept`)).status).toBe(404);
    expect((await asMax('POST', `/v1/me/friends/requests/${noaCode}/accept`)).status).toBe(404);

    expect((await asNoa('POST', `/v1/me/friends/requests/${maxCode}/accept`)).status).toBe(201);
    expect((await asMax('GET', '/v1/me/friends')).body.data).toEqual([
      { name: 'noa', avatarUrl: null, totalXp: 0, code: noaCode },
    ]);
    expect((await asNoa('GET', '/v1/me/friends')).body.data).toEqual([
      { name: 'max', avatarUrl: null, totalXp: 0, code: maxCode },
    ]);
    expect((await asNoa('GET', '/v1/me/friends/requests')).body.data).toEqual([]);

    // A declined request leaves nothing behind.
    expect((await asEve('POST', '/v1/me/friends', { code: noaCode })).body.status).toBe(
      'requested'
    );
    expect(
      (
        await asNoa(
          'DELETE',
          `/v1/me/friends/requests/${(await asEve('GET', '/v1/me/referral')).body.code}`
        )
      ).status
    ).toBe(204);
    expect((await asNoa('GET', '/v1/me/friends/requests')).body.data).toEqual([]);
    expect((await asEve('GET', '/v1/me/friends')).body.data).toEqual([]);

    // Two players who ask each other are friends without a further step.
    expect((await asEve('POST', '/v1/me/friends', { code: maxCode })).body.status).toBe(
      'requested'
    );
    const eveCode = (await asEve('GET', '/v1/me/referral')).body.code as string;
    expect((await asMax('POST', '/v1/me/friends', { code: eveCode })).body).toEqual({
      friends: true,
      status: 'friends',
    });
  }, 120_000);


  it('stops a token working once its player is deactivated or erased', async () => {
    const tom = await makeUser('tom');
    const asTom = await asPlayer(tom);
    expect((await asTom('GET', '/v1/me')).status).toBe(200);

    await db.update(endUsers).set({ active: false }).where(eq(endUsers.id, tom));
    const refused = await asTom('GET', '/v1/me/wallets');
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('USER_DEACTIVATED');

    await db.delete(endUsers).where(eq(endUsers.id, tom));
    expect((await asTom('GET', '/v1/me/achievements')).status).toBe(404);
  });

  it('keeps tokens in a query string out of the logs', () => {
    expect(redactUrl('/v1/me/stream?access_token=geu_abc.def')).toBe(
      '/v1/me/stream?access_token=[redacted]'
    );
    expect(redactUrl('/v1/email/unsubscribe?token=abc.def&x=1')).toBe(
      '/v1/email/unsubscribe?token=[redacted]&x=1'
    );
    expect(redactUrl('/v1/users?limit=5&access_token=secret')).toBe(
      '/v1/users?limit=5&access_token=[redacted]'
    );
    expect(redactUrl('/v1/users?limit=5')).toBe('/v1/users?limit=5');
  });


  it("builds share links from the server's own address, not from the request", async () => {
    const zed = await makeUser('zed');
    const achievementId = `ach_${randomUUID()}`;
    await db
      .insert(achievements)
      .values({ id: achievementId, projectId, key: 'first_win', name: 'First win' });
    await db
      .insert(userAchievements)
      .values({ id: `ua_${randomUUID()}`, projectId, userId: zed, achievementId });
    const { token } = await tokenFor(zed);

    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/achievements/first_win/share',
      headers: { authorization: `Bearer ${token}`, host: 'evil.example.net' },
    });
    const { url } = JSON.parse(res.payload) as { url: string };
    const expected = new URL(process.env['BETTER_AUTH_URL'] || 'http://localhost:3001');
    expect(new URL(url).host).toBe(expected.host);
    expect(url).not.toContain('evil.example.net');

    // The link is under /v1, which reverse proxies already send to the API.
    const path = new URL(url).pathname;
    expect(path.startsWith('/v1/share/')).toBe(true);
    const image = await app.inject({ method: 'GET', url: path });
    expect(image.statusCode).toBe(200);
    expect(image.headers['content-type']).toContain('image/svg+xml');
  });
});
