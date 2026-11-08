import { randomUUID } from 'crypto';
import {
  currencies,
  db,
  endUsers,
  events,
  member,
  organizations,
  projects,
  rewardCodes,
  rewards,
  rules,
  runMigrations,
  walletEntries,
  walletLots,
} from '@gami/database';
import { expireLots, walletBalance } from '@gami/rewards';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeRuleForEvent } from '../../../worker/src/executor.js';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('wallets and the reward store', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  let apiKey: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_st_${suffix}`;
  const projectId = `prj_st_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url: `${base}${url}`, headers: { cookie }, payload: payload as object });
    return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
  };
  const makeUser = async (label: string) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}` });
    return id;
  };
  const give = (user: string, amount: number, currency = 'coins') => call('POST', `/users/${user}/wallets/${currency}/adjust`, { amount, reason: 'Test grant' });
  const balance = async (user: string, currency = 'coins') => {
    const list = (await call('GET', `/users/${user}/wallets`)).body.data as { currency: string; balance: number }[];
    return list.find((item) => item.currency === currency)!.balance;
  };
  const reward = (key: string, extra: Record<string, unknown> = {}) => call('POST', '/rewards', { key, name: key, currency: 'coins', cost: 100, ...extra });
  const buy = (user: string, key: string, body: Record<string, unknown> = {}) => call('POST', `/users/${user}/rewards/${key}/redeem`, body);

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'ST', slug: `st-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'ST', slug: 'st' });
    const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `st_${randomUUID()}@example.com`, password: 'Password123!', name: 'ST' } });
    cookie = res.headers['set-cookie'] as string;
    await db.insert(member).values({ id: `mem_${suffix}`, organizationId: orgId, userId: JSON.parse(res.payload).user.id, role: 'owner', createdAt: new Date() });
    apiKey = (await createApiKey(projectId, 'Server', ['rewards:write', 'wallets:read', 'users:write'])).rawSecret;
    expect((await call('POST', '/currencies', { key: 'coins', name: 'Coins', symbol: '🪙' })).status).toBe(201);
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('wallets', () => {
    it('validates currencies and rewards', async () => {
      expect((await call('POST', '/currencies', { key: 'coins', name: 'Again' })).status).toBe(400);
      expect((await call('POST', '/currencies', { key: 'bad key!', name: 'x' })).status).toBe(400);
      expect((await reward('nope', { currency: 'missing' })).status).toBe(400);
      expect((await reward('free', { cost: 0 })).status).toBe(400);
    });

    it('adds, removes and refuses to go below zero, with a ledger and idempotency', async () => {
      const user = await makeUser('wallet');
      expect((await give(user, 300)).body.balance).toBe(300);
      expect((await give(user, -100)).body.balance).toBe(200);
      expect((await give(user, -500)).status).toBe(409);
      expect(await balance(user)).toBe(200);

      const once = { amount: 10, reason: 'Retry', idempotencyKey: 'same' };
      await call('POST', `/users/${user}/wallets/coins/adjust`, once);
      await call('POST', `/users/${user}/wallets/coins/adjust`, once);
      expect(await balance(user)).toBe(210);

      const ledger = (await call('GET', `/users/${user}/wallets/coins/ledger`)).body.data as { amount: number; kind: string }[];
      expect(ledger.map((entry) => entry.amount).sort((a, b) => a - b)).toEqual([-100, 10, 300]);
      expect((await call('POST', `/users/${user}/wallets/gems/adjust`, { amount: 1, reason: 'x' })).status).toBe(404);
    }, 180_000);

    it('lets a rule give currency, once per rule run', async () => {
      const user = await makeUser('rule');
      const ruleId = `rule_${randomUUID()}`;
      await db.insert(rules).values({ id: ruleId, projectId, name: 'Coins', trigger: 'daily_login', actions: [{ type: 'award_currency', params: { currency: 'coins', amount: 25 } }] });
      const [rule] = await db.select().from(rules).where(eq(rules.id, ruleId));
      const id = `evt_${randomUUID()}`;
      await db.insert(events).values({ id, projectId, userId: user, type: 'daily_login', payload: {}, occurredAt: new Date() });
      const event = { id, projectId, userId: user, type: 'daily_login', payload: {}, occurredAt: new Date() };

      expect((await executeRuleForEvent(rule!, event)).status).toBe('completed');
      expect((await executeRuleForEvent(rule!, event)).status).toBe('skipped');
      expect(await balance(user)).toBe(25);
    }, 120_000);

    it('rejects an award_currency rule that cannot work', async () => {
      const bad = await call('POST', '/rules', { name: 'Bad', trigger: 'x', actions: [{ type: 'award_currency', params: { amount: 5 } }] });
      expect(bad.status).toBe(400);
    });

    it('spends the points that expire soonest first, and writes off the rest when they lapse', async () => {
      const user = await makeUser('expiry');
      const [coins] = await db.select().from(currencies).where(and(eq(currencies.projectId, projectId), eq(currencies.key, 'coins')));
      await give(user, 100); // never expires, because coins do not expire yet
      await call('PATCH', `/currencies/${coins!.id}`, { expiresAfterDays: 30 });
      await give(user, 50);
      await call('PATCH', `/currencies/${coins!.id}`, { expiresAfterDays: null });

      const lots = await db.select().from(walletLots).where(eq(walletLots.userId, user));
      const expiring = lots.find((lot) => lot.expiresAt)!;
      expect(expiring.amount).toBe(50);
      expect((await call('GET', `/users/${user}/wallets`)).body.data[0].expiringSoon).toBe(0);

      // Spend 60: the 50 that would expire go first, then 10 of the permanent ones.
      await give(user, -60);
      const after = await db.select().from(walletLots).where(eq(walletLots.userId, user));
      expect(after.find((lot) => lot.id === expiring.id)!.remaining).toBe(0);
      expect(after.find((lot) => !lot.expiresAt)!.remaining).toBe(90);

      // A lot whose time is up is not spendable, and is written off.
      await give(user, 40);
      const [fresh] = (await db.select().from(walletLots).where(eq(walletLots.userId, user))).filter((lot) => lot.amount === 40);
      await db.update(walletLots).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(walletLots.id, fresh!.id));
      expect(await balance(user)).toBe(90);
      await db.transaction((tx) => expireLots(tx));
      const entries = await db.select().from(walletEntries).where(and(eq(walletEntries.userId, user), eq(walletEntries.kind, 'expire')));
      expect(entries.map((entry) => entry.amount)).toEqual([-40]);
      expect(await db.transaction((tx) => walletBalance(tx, projectId, user, coins!.id))).toBe(90);
    }, 240_000);
  });

  describe('buying', () => {
    it('takes the points, returns what was bought, and sends the purchase to be fulfilled', async () => {
      const user = await makeUser('buyer');
      await give(user, 250);
      await reward('mug', { cost: 100, stock: 5 });

      const bought = await buy(user, 'mug', { idempotencyKey: 'order-1' });
      expect(bought.status).toBe(201);
      expect(bought.body).toMatchObject({ rewardName: 'mug', cost: 100, status: 'pending', duplicate: false });
      expect(await balance(user)).toBe(150);

      const again = await buy(user, 'mug', { idempotencyKey: 'order-1' });
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ id: bought.body.id, duplicate: true });
      expect(await balance(user)).toBe(150);

      const [row] = await db.select().from(rewards).where(and(eq(rewards.projectId, projectId), eq(rewards.key, 'mug')));
      expect(row!.stock).toBe(4);
    }, 180_000);

    it('refuses when there are not enough points, no stock, or the limit is reached', async () => {
      const user = await makeUser('refused');
      await give(user, 150);
      await reward('rare', { cost: 100, stock: 0 });
      await reward('once', { cost: 50, perUserLimit: 1 });
      await reward('pricey', { cost: 5000 });

      expect((await buy(user, 'rare')).body.code).toBe('OUT_OF_STOCK');
      expect((await buy(user, 'pricey')).body.code).toBe('INSUFFICIENT_POINTS');
      expect((await buy(user, 'once')).status).toBe(201);
      expect((await buy(user, 'once')).body.code).toBe('LIMIT_REACHED');
      expect((await buy(user, 'missing')).status).toBe(404);
      expect((await buy('nobody', 'once')).status).toBe(404);
      expect(await balance(user)).toBe(100); // only the one purchase went through
    }, 180_000);

    it('never sells more than the stock when many people buy at once', async () => {
      await reward('last_two', { cost: 10, stock: 2 });
      const buyers = await Promise.all(Array.from({ length: 6 }, (_, i) => makeUser(`rush${i}`)));
      await Promise.all(buyers.map((user) => give(user, 100)));

      const results = await Promise.all(buyers.map((user) => buy(user, 'last_two')));
      expect(results.filter((result) => result.status === 201)).toHaveLength(2);
      expect(results.filter((result) => result.body.code === 'OUT_OF_STOCK')).toHaveLength(4);

      const charged = await Promise.all(buyers.map((user) => balance(user)));
      expect(charged.filter((value) => value === 90)).toHaveLength(2);
      expect(charged.filter((value) => value === 100)).toHaveLength(4);
    }, 300_000);

    it('does not let one person spend the same points on two purchases at once', async () => {
      const user = await makeUser('double');
      await give(user, 100);
      await reward('hundred', { cost: 100 });
      await reward('hundred_b', { cost: 100 });
      const results = await Promise.all([buy(user, 'hundred'), buy(user, 'hundred_b')]);
      expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
      expect(await balance(user)).toBe(0);
    }, 180_000);

    it('hands out one code per purchase, and runs out cleanly', async () => {
      const made = await reward('gift_card', { kind: 'code', cost: 10 });
      expect((await call('POST', `/rewards/${made.body.id}/codes`, { codes: ['AAA', 'BBB', 'AAA'] })).body).toEqual({ added: 2, skipped: 0 });
      expect((await call('POST', `/rewards/${made.body.id}/codes`, { codes: ['AAA', 'CCC'] })).body).toEqual({ added: 1, skipped: 1 });

      const users = await Promise.all(['c1', 'c2', 'c3', 'c4'].map(makeUser));
      await Promise.all(users.map((user) => give(user, 10)));
      const results = [];
      for (const user of users) results.push(await buy(user, 'gift_card'));

      const given = results.filter((result) => result.status === 201).map((result) => result.body.code).sort();
      expect(given).toEqual(['AAA', 'BBB', 'CCC']);
      expect(results.filter((result) => result.status === 201).every((result) => result.body.status === 'fulfilled')).toBe(true);
      expect(results[3]!.body.code).toBe('OUT_OF_CODES');
      expect(await balance(users[3]!)).toBe(10); // the failed purchase cost nothing

      const listed = (await call('GET', '/rewards')).body.data.find((item: { key: string }) => item.key === 'gift_card');
      expect(listed).toMatchObject({ codesTotal: 3, codesLeft: 0, redeemed: 3 });
      expect((await reward('plain')).status).toBe(201);
      const plain = (await call('GET', '/rewards')).body.data.find((item: { key: string }) => item.key === 'plain');
      expect((await call('POST', `/rewards/${plain.id}/codes`, { codes: ['X'] })).status).toBe(400);
    }, 300_000);

    it('fulfils a purchase, and cancelling refunds the points, restocks, and frees the code', async () => {
      const made = await reward('refundable', { cost: 40, stock: 3, kind: 'code' });
      await call('POST', `/rewards/${made.body.id}/codes`, { codes: ['REFUND-1'] });
      const user = await makeUser('refund');
      await give(user, 100);

      // A code purchase is delivered at once, so it cannot be cancelled.
      const delivered = await buy(user, 'refundable');
      expect(delivered.body.status).toBe('fulfilled');
      expect((await call('POST', `/redemptions/${delivered.body.id}/cancel`, {})).status).toBe(409);

      const plain = await reward('shippable', { cost: 40, stock: 3 });
      expect(plain.status).toBe(201);
      const order = await buy(user, 'shippable');
      expect(await balance(user)).toBe(20);

      const cancelled = await call('POST', `/redemptions/${order.body.id}/cancel`, { note: 'Out of the box' });
      expect(cancelled.body).toMatchObject({ status: 'cancelled', note: 'Out of the box' });
      expect(await balance(user)).toBe(60);
      const [shippable] = await db.select().from(rewards).where(eq(rewards.id, plain.body.id));
      expect(shippable!.stock).toBe(3);
      expect((await call('POST', `/redemptions/${order.body.id}/cancel`, {})).status).toBe(200); // repeating is harmless
      expect(await balance(user)).toBe(60);

      const second = await buy(user, 'shippable');
      const done = await call('POST', `/redemptions/${second.body.id}/fulfill`, { note: 'Shipped' });
      expect(done.body).toMatchObject({ status: 'fulfilled', note: 'Shipped' });
      expect((await call('POST', `/redemptions/${second.body.id}/cancel`, {})).status).toBe(409);

      const codes = await db.select().from(rewardCodes).where(eq(rewardCodes.rewardId, made.body.id));
      expect(codes[0]!.redemptionId).toBe(delivered.body.id);
    }, 300_000);

    it('lists purchases by status, and will not delete a reward that has been bought', async () => {
      const pending = (await call('GET', '/redemptions?status=pending')).body.data as { status: string }[];
      expect(pending.length).toBeGreaterThan(0);
      expect(pending.every((item) => item.status === 'pending')).toBe(true);

      const bought = (await call('GET', '/rewards')).body.data.find((item: { key: string }) => item.key === 'mug');
      expect((await call('DELETE', `/rewards/${bought.id}`)).status).toBe(409);
      const unused = await reward('unused');
      expect((await call('DELETE', `/rewards/${unused.body.id}`)).status).toBe(204);
    }, 120_000);

    it('keeps a deactivated reward off the shelf', async () => {
      const made = await reward('hidden_one', { cost: 1 });
      await call('PATCH', `/rewards/${made.body.id}`, { enabled: false });
      const user = await makeUser('shelf');
      await give(user, 10);
      expect((await buy(user, 'hidden_one')).status).toBe(404);
    }, 120_000);
  });

  describe('for players and servers', () => {
    const tokenFor = async (userId: string) =>
      JSON.parse((await app.inject({ method: 'POST', url: '/v1/end-user-tokens', headers: { 'x-api-key': apiKey }, payload: { userId } })).payload).token as string;

    it('shows a player their balance and a store that says what they can afford', async () => {
      const user = await makeUser('player');
      await give(user, 120);
      await reward('cheap_one', { cost: 100 });
      await reward('dear_one', { cost: 900 });
      await reward('sold_out', { cost: 5, stock: 0 });
      const headers = { authorization: `Bearer ${await tokenFor(user)}` };

      const wallets = JSON.parse((await app.inject({ method: 'GET', url: '/v1/me/wallets', headers })).payload).data;
      expect(wallets).toEqual([{ currency: 'coins', name: 'Coins', symbol: '🪙', balance: 120 }]);

      const store = JSON.parse((await app.inject({ method: 'GET', url: '/v1/me/rewards', headers })).payload).data as { key: string; affordable: boolean; inStock: boolean }[];
      expect(store.find((item) => item.key === 'cheap_one')).toMatchObject({ affordable: true, inStock: true });
      expect(store.find((item) => item.key === 'dear_one')).toMatchObject({ affordable: false });
      expect(store.find((item) => item.key === 'sold_out')).toMatchObject({ inStock: false });
      expect(store.map((item) => item.key)).not.toContain('hidden_one');

      const bought = await app.inject({ method: 'POST', url: '/v1/me/rewards/cheap_one/redeem', headers, payload: { idempotencyKey: 'p1' } });
      expect(bought.statusCode).toBe(201);
      expect(JSON.parse(bought.payload)).toMatchObject({ reward: 'cheap_one', cost: 100, status: 'pending' });

      const broke = await app.inject({ method: 'POST', url: '/v1/me/rewards/dear_one/redeem', headers, payload: {} });
      expect(broke.statusCode).toBe(409);
      expect(JSON.parse(broke.payload).code).toBe('INSUFFICIENT_POINTS');

      const history = JSON.parse((await app.inject({ method: 'GET', url: '/v1/me/redemptions', headers })).payload).data;
      expect(history).toHaveLength(1);
    }, 240_000);

    it('lets a server read wallets and buy for a user with scoped keys', async () => {
      const user = await makeUser('server');
      await give(user, 300);
      const headers = { 'x-api-key': apiKey };

      const wallets = await app.inject({ method: 'GET', url: `/v1/users/${user}/wallets`, headers });
      expect(JSON.parse(wallets.payload).data[0]).toMatchObject({ currency: 'coins', balance: 300 });
      expect(JSON.parse((await app.inject({ method: 'GET', url: '/v1/rewards', headers: { 'x-api-key': (await createApiKey(projectId, 'Reader', ['rewards:read'])).rawSecret } })).payload).data.length).toBeGreaterThan(3);

      const bought = await app.inject({ method: 'POST', url: `/v1/users/${user}/rewards/cheap_one/redeem`, headers, payload: { idempotencyKey: 'srv' } });
      expect(bought.statusCode).toBe(201);

      const readOnly = (await createApiKey(projectId, 'Read only', ['wallets:read'])).rawSecret;
      const denied = await app.inject({ method: 'POST', url: `/v1/users/${user}/rewards/cheap_one/redeem`, headers: { 'x-api-key': readOnly }, payload: {} });
      expect(denied.statusCode).toBe(403);
    }, 240_000);
  });
});
