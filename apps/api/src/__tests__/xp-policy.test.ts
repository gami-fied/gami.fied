import { randomUUID } from 'crypto';
import {
  db,
  endUsers,
  events,
  member,
  organizations,
  projects,
  runMigrations,
  rules,
  userXpBalances,
  xpLedger,
  xpLimitHits,
} from '@gami/database';
import { getLeaderboard, getUserRank } from '@gami/leaderboards';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { executeRuleForEvent } from '../../../worker/src/executor.js';
import { buildServer } from '../index.js';

describe('XP boosts, limits and shadow bans', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_xp_${suffix}`;
  const projectId = `prj_xp_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const call = async (method: 'POST' | 'PATCH' | 'GET' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url: `${base}${url}`, headers: { cookie }, payload: payload as object });
    return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
  };

  const makeUser = async (label: string) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}` });
    return id;
  };

  const makeRule = async (trigger: string, amount: number) => {
    const id = `rule_${randomUUID()}`;
    await db.insert(rules).values({ id, projectId, name: id, trigger, actions: [{ type: 'award_xp', params: { amount } }] });
    return (await db.select().from(rules).where(eq(rules.id, id)))[0]!;
  };

  const fire = async (rule: Awaited<ReturnType<typeof makeRule>>, userId: string, at = new Date()) => {
    const id = `evt_${randomUUID()}`;
    await db.insert(events).values({ id, projectId, userId, type: rule.trigger, payload: {}, occurredAt: at });
    return executeRuleForEvent(rule, { id, projectId, userId, type: rule.trigger, payload: {}, occurredAt: at });
  };

  const xp = async (userId: string) =>
    (await db.select().from(userXpBalances).where(eq(userXpBalances.userId, userId)))[0]?.totalXp ?? 0;

  const clearPolicy = async () => {
    for (const kind of ['boosts', 'limits']) {
      const list = (await call('GET', `/${kind}`)).body.data as { id: string }[];
      for (const item of list) await call('DELETE', `/${kind}/${item.id}`);
    }
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'XP', slug: `xp-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'XP', slug: 'xp' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `xp_${randomUUID()}@example.com`, password: 'Password123!', name: 'XP' },
    });
    cookie = res.headers['set-cookie'] as string;
    await db.insert(member).values({ id: `mem_${suffix}`, organizationId: orgId, userId: JSON.parse(res.payload).user.id, role: 'owner', createdAt: new Date() });
  }, 120_000);

  afterEach(clearPolicy);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('boosts', () => {
    it('validates what is saved', async () => {
      expect((await call('POST', '/boosts', { name: 'x', multiplier: 50 })).status).toBe(400);
      expect((await call('POST', '/boosts', { name: 'x', multiplier: 2, startAt: '2026-03-10T00:00:00Z', endAt: '2026-03-09T00:00:00Z' })).status).toBe(400);
      expect((await call('POST', '/boosts', { name: 'x', multiplier: 2, fromHour: 9 })).status).toBe(400);
      expect((await call('POST', '/boosts', { name: 'x', multiplier: 2, timeZone: 'Mars/Base' })).status).toBe(400);
    });

    it('doubles rule XP while a promotion is on, and records what it was', async () => {
      const rule = await makeRule('lesson_a', 10);
      const user = await makeUser('boosted');
      await fire(rule, user);
      expect(await xp(user)).toBe(10);

      const created = await call('POST', '/boosts', { name: 'Double XP', multiplier: 2 });
      expect(created.status).toBe(201);
      await fire(rule, user);
      expect(await xp(user)).toBe(30);

      const entries = await db.select().from(xpLedger).where(eq(xpLedger.userId, user));
      const boosted = entries.find((entry) => entry.amount === 20)!;
      expect(boosted.metadata).toMatchObject({ baseAmount: 10, boost: { name: 'Double XP', multiplier: 2 } });

      await call('PATCH', `/boosts/${created.body.id}`, { enabled: false });
      await fire(rule, user);
      expect(await xp(user)).toBe(40);
      await clearPolicy();
    }, 180_000);

    it('uses the time of the event, so an old event keeps its original value', async () => {
      const rule = await makeRule('lesson_b', 10);
      const user = await makeUser('timed');
      await call('POST', '/boosts', { name: 'Last week', multiplier: 3, startAt: new Date(Date.now() - 10 * 86_400_000).toISOString(), endAt: new Date(Date.now() - 5 * 86_400_000).toISOString() });
      await fire(rule, user, new Date(Date.now() - 7 * 86_400_000));
      await fire(rule, user, new Date(Date.now() - 60_000));
      expect(await xp(user)).toBe(40); // 30 inside the window, 10 outside it
      await clearPolicy();
    }, 120_000);

    it('does not touch manual adjustments', async () => {
      const user = await makeUser('manual');
      await call('POST', '/boosts', { name: 'Double', multiplier: 2 });
      const res = await call('POST', `/users/${user}/xp/adjust`, { amount: 50, reason: 'Support', idempotencyKey: randomUUID() });
      expect(res.status).toBe(201);
      expect(await xp(user)).toBe(50);
      await clearPolicy();
    }, 120_000);
  });

  describe('limits', () => {
    it('validates what is saved', async () => {
      expect((await call('POST', '/limits', { name: 'x', kind: 'xp_cap', amount: 100 })).status).toBe(400); // needs a period
      expect((await call('POST', '/limits', { name: 'x', kind: 'cooldown', amount: 99_999_999 })).status).toBe(400);
      expect((await call('POST', '/limits', { name: 'x', kind: 'xp_cap', period: 'day', amount: 10, ruleId: 'rule_elsewhere' })).status).toBe(400);
    });

    it('caps XP per day, giving the room that is left, and records the hits', async () => {
      const rule = await makeRule('lesson_c', 40);
      const user = await makeUser('capped');
      await call('POST', '/limits', { name: 'Daily cap', kind: 'xp_cap', period: 'day', amount: 100 });

      for (let i = 0; i < 4; i++) await fire(rule, user);
      expect(await xp(user)).toBe(100); // 40 + 40 + 20 + nothing

      const hits = await db.select().from(xpLimitHits).where(eq(xpLimitHits.userId, user));
      expect(hits.map((hit) => [hit.wanted, hit.given]).sort()).toEqual([[40, 0], [40, 20]].sort());

      const listed = (await call('GET', `/limits/hits?userId=${user}`)).body.data as { limitName: string }[];
      expect(listed).toHaveLength(2);
      const limit = (await call('GET', '/limits')).body.data[0];
      expect(limit).toMatchObject({ hitsLastWeek: expect.any(Number), peopleLastWeek: 1 });
      await clearPolicy();
    }, 240_000);

    it('limits the number of awards, and only for the rule it is set on', async () => {
      const limited = await makeRule('lesson_d', 5);
      const other = await makeRule('lesson_e', 5);
      const user = await makeUser('counted');
      await call('POST', '/limits', { name: 'Twice a day', kind: 'award_cap', period: 'day', amount: 2, ruleId: limited.id });

      for (let i = 0; i < 4; i++) await fire(limited, user);
      for (let i = 0; i < 3; i++) await fire(other, user);
      expect(await xp(user)).toBe(10 + 15);
      await clearPolicy();
    }, 240_000);

    it('enforces a cooldown between awards', async () => {
      const rule = await makeRule('lesson_f', 5);
      const user = await makeUser('cooling');
      await call('POST', '/limits', { name: 'Slow down', kind: 'cooldown', amount: 3600, eventType: 'lesson_f' });
      await fire(rule, user);
      await fire(rule, user);
      expect(await xp(user)).toBe(5);
      await clearPolicy();
    }, 180_000);

    it('applies a boost before a cap', async () => {
      const rule = await makeRule('lesson_g', 40);
      const user = await makeUser('both');
      await call('POST', '/boosts', { name: 'Double', multiplier: 2 });
      await call('POST', '/limits', { name: 'Cap', kind: 'xp_cap', period: 'day', amount: 100 });
      await fire(rule, user);
      await fire(rule, user);
      expect(await xp(user)).toBe(100); // 80, then only 20 of the next 80
      await clearPolicy();
    }, 180_000);
  });

  describe('shadow bans', () => {
    it('keeps a hidden user off every leaderboard and out of the count, while they keep earning', async () => {
      const rule = await makeRule('lesson_h', 500);
      const honest = await makeUser('honest');
      const cheat = await makeUser('cheat');
      await fire(rule, honest);
      for (let i = 0; i < 3; i++) await fire(rule, cheat);

      const before = await getLeaderboard(projectId, { period: 'all_time', limit: 10 });
      expect(before.entries[0]!.userId).toBe(cheat);

      const res = await call('POST', `/users/${cheat}/ranking`, { hidden: true });
      expect(res.body).toMatchObject({ rankingHidden: true });

      const after = await getLeaderboard(projectId, { period: 'all_time', limit: 10 });
      expect(after.entries.map((entry) => entry.userId)).not.toContain(cheat);
      expect(after.entries[0]).toMatchObject({ userId: honest, rank: 1 });
      expect(after.total).toBe(before.total - 1);
      expect((await getUserRank(projectId, honest, { period: 'all_time' })).rank).toBe(1);

      const weekly = await getLeaderboard(projectId, { period: 'weekly', limit: 10 });
      expect(weekly.entries.map((entry) => entry.userId)).not.toContain(cheat);
      expect(await xp(cheat)).toBe(1500); // still earning

      await call('POST', `/users/${cheat}/ranking`, { hidden: false });
      expect((await getLeaderboard(projectId, { period: 'all_time', limit: 10 })).entries[0]!.userId).toBe(cheat);
    }, 240_000);

    it('returns 404 for a user that is not in the project', async () => {
      expect((await call('POST', '/users/nobody/ranking', { hidden: true })).status).toBe(404);
    });
  });
});
