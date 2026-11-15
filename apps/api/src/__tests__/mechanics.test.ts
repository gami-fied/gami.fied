/**
 * Phase 13.1: random rewards, season passes, teams and shared goals, cosmetics, leaderboard prizes
 * and journeys. Each is tried through the API a dashboard or a player would use, and the parts the
 * worker does are run directly.
 */
import { randomUUID } from 'crypto';
import {
  achievements,
  challenges,
  db,
  endUsers,
  events,
  leaderboardPayouts,
  leaderboardPrizes,
  lootBoxOpens,
  member,
  organizations,
  projects,
  runMigrations,
  sharedGoalContributions,
  userAchievements,
  userXpBalances,
  xpLedger,
} from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processChallengesForEvent } from '../../../worker/src/challenge-processor.js';
import { closedPeriod, payGoalPrizes, payLeaderboardPrizes, processSharedGoalsForEvent } from '../../../worker/src/mechanics.js';
import { featureForPlayerPath, featureForProjectRoute } from '../authorization/features.js';
import { resolveProjectPermission } from '../authorization/permissions.js';
import { buildServer } from '../index.js';
import { dropTable, openBox, pickItem } from '../mechanics/boxes.js';
import { createApiKey } from '../services/api-key.service.js';

describe('mechanics (Phase 13.1)', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  let apiKey: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_mx_${suffix}`;
  const projectId = `prj_mx_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const parse = (res: { statusCode: number; payload: string }) => ({ status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null });
  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) =>
    parse(await app.inject({ method, url: `${base}${url}`, headers: { cookie }, payload: payload as object }));
  const makeUser = async (label: string, name: string | null = null) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}`, name });
    return id;
  };
  const tokenFor = async (userId: string, access: 'read' | 'write' = 'write') =>
    JSON.parse((await app.inject({ method: 'POST', url: '/v1/end-user-tokens', headers: { 'x-api-key': apiKey }, payload: { userId, access } })).payload).token as string;
  const me = async (token: string, method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) =>
    parse(await app.inject({ method, url: `/v1/me${url}`, headers: { authorization: `Bearer ${token}` }, payload: payload as object }));
  const give = (user: string, amount: number, currency = 'gems') => call('POST', `/users/${user}/wallets/${currency}/adjust`, { amount, reason: 'Test grant' });
  const balance = async (user: string, currency = 'gems') =>
    ((await call('GET', `/users/${user}/wallets`)).body.data as { currency: string; balance: number }[]).find((item) => item.currency === currency)?.balance ?? 0;
  const xpOf = async (user: string) => (await db.select().from(userXpBalances).where(eq(userXpBalances.userId, user)))[0]?.totalXp ?? 0;
  /** Writes XP as it would have been earned at a given time. */
  const earnedAt = async (user: string, amount: number, at: Date) => {
    await db.insert(xpLedger).values({ id: `xpl_${randomUUID()}`, projectId, userId: user, amount, reason: 'Test', createdAt: at });
    await db
      .insert(userXpBalances)
      .values({ id: `xpb_${randomUUID()}`, projectId, userId: user, totalXp: amount })
      .onConflictDoUpdate({ target: [userXpBalances.projectId, userXpBalances.userId], set: { totalXp: (await xpOf(user)) + amount } });
  };
  const sendEvent = async (userId: string, type: string, payload: Record<string, unknown> = {}) => {
    const event = { id: `evt_${randomUUID()}`, projectId, userId, type, payload, occurredAt: new Date() };
    await db.insert(events).values(event);
    return event;
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'MX', slug: `mx-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'MX', slug: 'mx' });
    const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `mx_${randomUUID()}@example.com`, password: 'Password123!', name: 'MX' } });
    cookie = res.headers['set-cookie'] as string;
    await db.insert(member).values({ id: `mem_${suffix}`, organizationId: orgId, userId: JSON.parse(res.payload).user.id, role: 'owner', createdAt: new Date() });
    apiKey = (await createApiKey(projectId, 'Server', ['*'])).rawSecret;
    expect((await call('POST', '/currencies', { key: 'gems', name: 'Gems', symbol: '💎' })).status).toBe(201);
    await db.insert(achievements).values({ id: `ach_mx_${suffix}`, projectId, key: 'founder', name: 'Founder' });
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('puts every new route behind a feature switch and an API key scope', () => {
    expect(featureForProjectRoute('/api/projects/:projectId/boxes')).toBe('loot_boxes');
    expect(featureForProjectRoute('/api/projects/:projectId/users/:userId/passes/:passKey/claim')).toBe('season_pass');
    expect(featureForProjectRoute('/api/projects/:projectId/goals')).toBe('teams');
    expect(featureForProjectRoute('/api/projects/:projectId/leaderboard-prizes')).toBe('leaderboard_prizes');
    expect(featureForPlayerPath('/v1/me/boxes/x/open')).toBe('loot_boxes');
    expect(featureForPlayerPath('/v1/me/cosmetics')).toBe('cosmetics');
    expect(featureForPlayerPath('/v1/me/team')).toBe('teams');
    expect(featureForPlayerPath('/v1/me/journeys')).toBe('journeys');
    expect(featureForPlayerPath('/v1/me/leaderboard/prizes')).toBe('leaderboard_prizes');
    expect(featureForPlayerPath('/v1/me/leaderboard')).toBe('leaderboards');

    for (const path of ['boxes', 'passes', 'cosmetics', 'teams', 'goals', 'journeys', 'leaderboard-prizes']) {
      const write = resolveProjectPermission('POST', `/api/projects/:projectId/${path}`);
      expect(write.sessionOnly, path).toBe(false);
      expect(write.minRole, path).toBe('admin');
      expect(resolveProjectPermission('GET', `/api/projects/:projectId/${path}`).minRole, path).toBe('member');
    }
    expect(resolveProjectPermission('POST', '/api/projects/:projectId/users/:userId/boxes/:boxKey/open').scope).toBe('rewards:write');
    expect(resolveProjectPermission('POST', '/api/projects/:projectId/users/:userId/team').scope).toBe('social:write');
  });

  describe('random rewards', () => {
    const items = [
      { name: 'Common', weight: 90, rare: false, prizes: [{ type: 'xp', amount: 10 }] },
      { name: 'Jackpot', weight: 10, rare: true, prizes: [{ type: 'currency', currency: 'gems', amount: 500 }] },
    ];

    it('refuses a box that could not pay out', async () => {
      expect((await call('POST', '/boxes', { key: 'empty', name: 'Empty', items: [] })).status).toBe(400);
      expect((await call('POST', '/boxes', { key: 'paid', name: 'Paid', cost: 5, items })).body.message).toMatch(/currency/);
      expect((await call('POST', '/boxes', { key: 'pity', name: 'Pity', guaranteeAfter: 3, items: [items[0]] })).body.message).toMatch(/rare/);
      const missing = await call('POST', '/boxes', { key: 'ghost', name: 'Ghost', items: [{ name: 'x', weight: 1, prizes: [{ type: 'currency', currency: 'nope', amount: 1 }] }] });
      expect(missing.status).toBe(400);
      expect(missing.body.message).toBe('There is no currency "nope"');
    });

    it('publishes odds that add up, and draws by weight', async () => {
      const created = await call('POST', '/boxes', { key: 'chest', name: 'Chest', currency: 'gems', cost: 20, guaranteeAfter: 3, items });
      expect(created.status).toBe(201);
      expect((await call('POST', '/boxes', { key: 'chest', name: 'Again', items })).status).toBe(400);

      const table = dropTable(created.body.items);
      expect(table.map((item) => item.chance)).toEqual([90, 10]);
      expect(table.reduce((sum, item) => sum + item.chance, 0)).toBe(100);
      expect(pickItem(created.body.items, 0).name).toBe('Common');
      expect(pickItem(created.body.items, 89).name).toBe('Common');
      expect(pickItem(created.body.items, 90).name).toBe('Jackpot');
      expect(pickItem(created.body.items, 99).name).toBe('Jackpot');
    });

    it('charges, pays the prize, and keeps its guarantee', async () => {
      const user = await makeUser('box');
      const broke = await call('POST', `/users/${user}/boxes/chest/open`);
      expect(broke.status).toBe(409);
      expect(broke.body.code).toBe('INSUFFICIENT_POINTS');

      await give(user, 100);
      const common = () => openBox({ projectId, user, boxKey: 'chest', random: () => 0 });
      for (let i = 0; i < 3; i++) {
        const open = await common();
        expect(open.item.name).toBe('Common');
        expect(open.guaranteed).toBe(false);
      }
      expect(await balance(user)).toBe(40);
      expect(await xpOf(user)).toBe(30);

      const view = (await call('GET', `/users/${user}/boxes`)).body.data[0];
      expect(view.triesUntilGuarantee).toBe(0);
      expect(view.items.map((item: { chance: number }) => item.chance)).toEqual([90, 10]);

      // Three tries with nothing rare: the fourth is drawn from the rare items, whatever the roll.
      const lucky = await common();
      expect(lucky.item).toMatchObject({ name: 'Jackpot', rare: true });
      expect(lucky.guaranteed).toBe(true);
      expect(await balance(user)).toBe(40 - 20 + 500);
      // The count starts over after a rare item.
      expect((await common()).guaranteed).toBe(false);
    });

    it('opens once for one idempotency key, and never shows it to another player', async () => {
      const user = await makeUser('boxidem');
      const other = await makeUser('boxother');
      await give(user, 100);
      await give(other, 100);
      const first = await call('POST', `/users/${user}/boxes/chest/open`, { idempotencyKey: `k-${suffix}` });
      const again = await call('POST', `/users/${user}/boxes/chest/open`, { idempotencyKey: `k-${suffix}` });
      expect(first.status).toBe(201);
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ id: first.body.id, duplicate: true });
      expect(await balance(user)).toBe(80);
      expect((await call('POST', `/users/${other}/boxes/chest/open`, { idempotencyKey: `k-${suffix}` })).body.code).toBe('IDEMPOTENCY_KEY_IN_USE');
    });

    it('holds a daily limit when many tries arrive at once', async () => {
      expect((await call('POST', '/boxes', { key: 'daily', name: 'Daily', dailyLimit: 2, items: [items[0]] })).status).toBe(201);
      const user = await makeUser('boxlimit');
      const token = await tokenFor(user);
      const results = await Promise.all(Array.from({ length: 6 }, () => me(token, 'POST', '/boxes/daily/open', {})));
      expect(results.filter((result) => result.status === 201)).toHaveLength(2);
      expect(results.filter((result) => result.body.code === 'LIMIT_REACHED')).toHaveLength(4);
      expect(await db.select().from(lootBoxOpens).where(eq(lootBoxOpens.userId, user))).toHaveLength(2);
      expect((await me(token, 'GET', '/boxes')).body.data.find((box: { key: string }) => box.key === 'daily').triesLeftToday).toBe(0);
    });

    it('needs a write token to open, and reports what each item really gave', async () => {
      const user = await makeUser('boxread');
      const readOnly = await tokenFor(user, 'read');
      expect((await me(readOnly, 'GET', '/boxes')).status).toBe(200);
      expect((await me(readOnly, 'POST', '/boxes/daily/open', {})).body.code).toBe('TOKEN_READ_ONLY');

      const report = await call('GET', '/boxes/chest/opens');
      expect(report.status).toBe(200);
      expect(report.body.total).toBeGreaterThanOrEqual(6);
      const jackpot = report.body.items.find((item: { name: string }) => item.name === 'Jackpot');
      expect(jackpot.givenByGuarantee).toBe(1);
    });
  });

  describe('season pass', () => {
    const start = new Date(Date.now() - 10 * 86_400_000);
    const end = new Date(Date.now() + 10 * 86_400_000);
    const pass = {
      key: 'season',
      name: 'Season one',
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      premiumCurrency: 'gems',
      premiumCost: 50,
      tiers: [
        { xp: 100, free: [{ type: 'xp', amount: 5 }], premium: [{ type: 'currency', currency: 'gems', amount: 30 }] },
        { xp: 300, free: [{ type: 'currency', currency: 'gems', amount: 10 }], premium: [{ type: 'achievement', achievement: 'founder' }] },
      ],
    };

    it('checks the season and its tiers', async () => {
      expect((await call('POST', '/passes', { ...pass, endAt: start.toISOString() })).body.message).toMatch(/end after/);
      expect((await call('POST', '/passes', { ...pass, tiers: [...pass.tiers].reverse() })).body.message).toMatch(/more XP/);
      expect((await call('POST', '/passes', { ...pass, premiumCurrency: null, premiumCost: null })).body.message).toMatch(/premium lane costs/);
      expect((await call('POST', '/passes', pass)).status).toBe(201);
    });

    it('counts only XP earned during the season, and gives each reward once', async () => {
      const user = await makeUser('pass');
      await earnedAt(user, 5000, new Date(start.getTime() - 86_400_000));
      await earnedAt(user, 150, new Date());
      const token = await tokenFor(user);

      const view = (await me(token, 'GET', '/passes')).body.data[0];
      expect(view).toMatchObject({ key: 'season', status: 'active', xp: 150, tier: 1, xpToNextTier: 150 });
      expect(view.tiers[0].free.claimable).toBe(true);
      expect(view.tiers[0].premium.claimable).toBe(false);

      expect((await me(token, 'POST', '/passes/season/claim', { tier: 2, lane: 'free' })).body.code).toBe('TIER_LOCKED');
      expect((await me(token, 'POST', '/passes/season/claim', { tier: 1, lane: 'premium' })).body.code).toBe('PREMIUM_REQUIRED');
      expect((await me(token, 'POST', '/passes/season/claim', { tier: 9, lane: 'free' })).body.code).toBe('TIER_NOT_FOUND');

      // Several claims at once pay the reward once.
      const before = await xpOf(user);
      const claims = await Promise.all(Array.from({ length: 4 }, () => me(token, 'POST', '/passes/season/claim', { tier: 1, lane: 'free' })));
      expect(claims.filter((claim) => claim.status === 200)).toHaveLength(1);
      expect(claims.filter((claim) => claim.body.code === 'ALREADY_CLAIMED')).toHaveLength(3);
      expect(await xpOf(user)).toBe(before + 5);
    });

    it('sells the premium lane once and opens its rewards for tiers already reached', async () => {
      const user = await makeUser('premium');
      await earnedAt(user, 400, new Date());
      const token = await tokenFor(user);
      expect((await me(token, 'POST', '/passes/season/premium')).body.code).toBe('INSUFFICIENT_POINTS');

      await give(user, 60);
      const bought = await me(token, 'POST', '/passes/season/premium');
      expect(bought.status).toBe(201);
      expect((await me(token, 'POST', '/passes/season/premium')).body).toMatchObject({ duplicate: true, cost: 0 });
      expect(await balance(user)).toBe(10);

      // Claiming with no tier gives everything that is ready: both lanes of both tiers.
      const all = await me(token, 'POST', '/passes/season/claim', {});
      expect(all.body.claimed).toHaveLength(4);
      expect(await balance(user)).toBe(10 + 30 + 10);
      expect(await db.select().from(userAchievements).where(eq(userAchievements.userId, user))).toHaveLength(1);
      expect((await me(token, 'POST', '/passes/season/claim', {})).body.claimed).toEqual([]);

      const list = (await call('GET', '/passes')).body.data[0];
      expect(list).toMatchObject({ players: 2, premiumPlayers: 1, status: 'active' });
    });

    it('stops claims a week after the season, and before it starts', async () => {
      const user = await makeUser('late');
      const long = new Date(Date.now() - 40 * 86_400_000);
      await call('POST', '/passes', { ...pass, key: 'old', startAt: long.toISOString(), endAt: new Date(Date.now() - 20 * 86_400_000).toISOString() });
      await call('POST', '/passes', { ...pass, key: 'soon', startAt: new Date(Date.now() + 86_400_000).toISOString(), endAt: new Date(Date.now() + 9 * 86_400_000).toISOString() });
      expect((await call('POST', `/users/${user}/passes/old/claim`, {})).body.code).toBe('PASS_ENDED');
      expect((await call('POST', `/users/${user}/passes/soon/claim`, {})).body.code).toBe('PASS_NOT_STARTED');
      const keys = (await call('GET', `/users/${user}/passes`)).body.data.map((item: { key: string }) => item.key);
      expect(keys).toEqual(['season', 'soon']);
    });
  });

  describe('teams and shared goals', () => {
    it('keeps a player in one team and holds the size limit', async () => {
      expect((await call('POST', '/teams', { key: 'red', name: 'Red', maxMembers: 2 })).status).toBe(201);
      expect((await call('POST', '/teams', { key: 'blue', name: 'Blue' })).status).toBe(201);
      const [a, b, c] = await Promise.all([makeUser('ta', 'Ada'), makeUser('tb', 'Bea'), makeUser('tc', 'Cy')]);
      const tokens = await Promise.all([a, b, c].map((user) => tokenFor(user!)));

      // Three join a team of two at once: two get in.
      const joins = await Promise.all(tokens.map((token) => me(token, 'POST', '/team', { team: 'red' })));
      expect(joins.filter((join) => join.status === 200)).toHaveLength(2);
      expect(joins.filter((join) => join.body.code === 'TEAM_FULL')).toHaveLength(1);

      const inRed = tokens[joins.findIndex((join) => join.status === 200)]!;
      const mine = (await me(inRed, 'GET', '/team')).body.team;
      expect(mine).toMatchObject({ key: 'red', members: 2, maxMembers: 2 });
      expect(mine.roster.filter((row: { isMe: boolean }) => row.isMe)).toHaveLength(1);
      expect(JSON.stringify(mine)).not.toContain('usr_');

      // Moving to another team leaves the first.
      expect((await me(inRed, 'POST', '/team', { team: 'blue' })).body.joined).toBe(true);
      const board = (await me(inRed, 'GET', '/teams')).body.data as { key: string; members: number; isMine: boolean; full: boolean }[];
      expect(board.find((team) => team.key === 'red')).toMatchObject({ members: 1, full: false, isMine: false });
      expect(board.find((team) => team.key === 'blue')).toMatchObject({ members: 1, isMine: true });
      expect((await me(inRed, 'DELETE', '/team')).status).toBe(204);
      expect((await me(inRed, 'GET', '/team')).body.team).toBeNull();
      expect((await me(inRed, 'POST', '/team', { team: 'nope' })).status).toBe(404);
    });

    it('adds everyone up for a community goal, counts each event once, and pays every contributor once', async () => {
      const goal = await call('POST', '/goals', { key: 'lessons', name: 'Five lessons', trigger: 'lesson_done', target: 5, rewards: [{ type: 'xp', amount: 40 }] });
      expect(goal.status).toBe(201);
      const [a, b, idle] = await Promise.all([makeUser('ga'), makeUser('gb'), makeUser('gidle')]);

      const first = await sendEvent(a!, 'lesson_done');
      await processSharedGoalsForEvent(first);
      // The worker retries an event: it is not counted again.
      await processSharedGoalsForEvent(first);
      await processSharedGoalsForEvent(await sendEvent(a!, 'other_event'));
      for (let i = 0; i < 3; i++) await processSharedGoalsForEvent(await sendEvent(b!, 'lesson_done'));

      const token = await tokenFor(a!);
      expect((await me(token, 'GET', '/goals')).body.data[0]).toMatchObject({ key: 'lessons', progress: 4, percent: 80, myContribution: 1, completed: false, open: true });

      const last = await processSharedGoalsForEvent(await sendEvent(a!, 'lesson_done'));
      expect(last.completed).toBe(1);
      // Nothing is added once the target is reached.
      expect((await processSharedGoalsForEvent(await sendEvent(idle!, 'lesson_done'))).counted).toBe(0);

      expect(await payGoalPrizes()).toBe(2);
      expect(await payGoalPrizes()).toBe(0);
      expect(await xpOf(a!)).toBe(40);
      expect(await xpOf(b!)).toBe(40);
      expect(await xpOf(idle!)).toBe(0);
      expect((await me(token, 'GET', '/goals')).body.data[0]).toMatchObject({ progress: 5, percent: 100, myContribution: 2, completed: true, open: false });
      expect((await call('GET', '/goals')).body.data[0]).toMatchObject({ contributors: 2, paid: 2 });
    });

    it('keeps a total per team, adds up a field of the event, and ignores players in no team', async () => {
      const goal = await call('POST', '/goals', { key: 'distance', name: '100 km', scope: 'team', trigger: 'run_logged', amountField: 'payload.km', target: 100, filters: [{ field: 'payload.kind', operator: 'equals', value: 'run' }], rewards: [{ type: 'currency', currency: 'gems', amount: 7 }] });
      expect(goal.status).toBe(201);
      expect((await call('POST', '/goals', { key: 'bad', name: 'Bad', trigger: 'x', target: 1, amountField: 'userId' })).status).toBe(400);
      expect((await call('PATCH', `/goals/${goal.body.id}`, { scope: 'community' })).body.message).toMatch(/cannot change/);

      const [red, blue, loner] = await Promise.all([makeUser('dr'), makeUser('db'), makeUser('dl')]);
      await call('POST', `/users/${red}/team`, { team: 'red' });
      await call('POST', `/users/${blue}/team`, { team: 'blue' });
      const run = async (user: string, km: unknown, kind = 'run') => processSharedGoalsForEvent(await sendEvent(user, 'run_logged', { km, kind }));

      await run(red!, 60.9);
      await run(red!, 30, 'walk');
      await run(red!, -5);
      await run(blue!, 20);
      expect((await run(loner!, 500)).counted).toBe(0);
      expect((await call('GET', `/users/${red}/goals`)).body.data.find((item: { key: string }) => item.key === 'distance')).toMatchObject({ progress: 60, team: { key: 'red' }, myContribution: 60 });
      expect((await call('GET', `/users/${loner}/goals`)).body.data.find((item: { key: string }) => item.key === 'distance')).toMatchObject({ progress: 0, team: null });

      expect((await run(red!, 45)).completed).toBe(1);
      await payGoalPrizes();
      expect(await balance(red!)).toBe(7);
      expect(await balance(blue!)).toBe(0);
      const lines = (await call('GET', '/goals')).body.data.find((item: { key: string }) => item.key === 'distance').progress;
      expect(lines.map((line: { team: { key: string }; progress: number }) => [line.team.key, line.progress])).toEqual([['red', 100], ['blue', 20]]);

      // Removing a team removes its totals with it.
      const blueTeam = (await call('GET', '/teams')).body.data.find((team: { key: string }) => team.key === 'blue');
      expect((await call('DELETE', `/teams/${blueTeam.id}`)).status).toBe(204);
      expect(await db.select().from(sharedGoalContributions).where(eq(sharedGoalContributions.userId, blue!))).toHaveLength(0);
    });
  });

  describe('cosmetics', () => {
    it('is owned through an achievement, a purchase or a gift, and worn one of a kind at a time', async () => {
      expect((await call('POST', '/cosmetics', { key: 'founder_title', name: 'Founder', kind: 'title', achievement: 'founder' })).status).toBe(201);
      expect((await call('POST', '/cosmetics', { key: 'sage', name: 'Sage', kind: 'title', currency: 'gems', cost: 25 })).status).toBe(201);
      expect((await call('POST', '/cosmetics', { key: 'ring', name: 'Gold ring', kind: 'frame', imageUrl: 'https://example.com/ring.png' })).status).toBe(201);
      expect((await call('POST', '/cosmetics', { key: 'half', name: 'Half', cost: 5 })).body.message).toMatch(/both a currency and a cost/);
      expect((await call('POST', '/cosmetics', { key: 'ghost', name: 'Ghost', achievement: 'nope' })).status).toBe(400);

      const user = await makeUser('cos', 'Cos');
      const token = await tokenFor(user);
      const find = async (key: string) => ((await me(token, 'GET', '/cosmetics')).body.data as { key: string; owned: boolean; equipped: boolean; affordable: boolean }[]).find((item) => item.key === key)!;

      expect(await find('founder_title')).toMatchObject({ owned: false, achievement: { key: 'founder' } });
      expect((await me(token, 'POST', '/cosmetics/founder_title/equip')).body.code).toBe('NOT_OWNED');
      await db.insert(userAchievements).values({ id: `uach_${randomUUID()}`, projectId, userId: user, achievementId: `ach_mx_${suffix}` });
      expect((await find('founder_title')).owned).toBe(true);
      expect((await me(token, 'POST', '/cosmetics/founder_title/equip')).body).toMatchObject({ equipped: true, kind: 'title' });

      expect((await me(token, 'POST', '/cosmetics/founder_title/buy')).body.code).toBe('NOT_FOR_SALE');
      expect((await me(token, 'POST', '/cosmetics/sage/buy')).body.code).toBe('INSUFFICIENT_POINTS');
      await give(user, 30);
      expect((await me(token, 'POST', '/cosmetics/sage/buy')).status).toBe(201);
      expect((await me(token, 'POST', '/cosmetics/sage/buy')).body.code).toBe('ALREADY_OWNED');
      expect(await balance(user)).toBe(5);

      // A second title replaces the first. A frame is worn beside it.
      await me(token, 'POST', '/cosmetics/sage/equip');
      expect((await call('POST', `/users/${user}/cosmetics`, { cosmetic: 'ring' })).body.given).toBe(true);
      await me(token, 'POST', '/cosmetics/ring/equip');
      expect((await find('founder_title')).equipped).toBe(false);
      expect((await me(token, 'GET', '')).body.cosmetics).toEqual({ title: { key: 'sage', name: 'Sage' }, frame: { key: 'ring', name: 'Gold ring', imageUrl: 'https://example.com/ring.png' }, items: [] });

      await earnedAt(user, 10, new Date());
      const row = (await me(token, 'GET', '/leaderboard?limit=50')).body.entries.find((entry: { isMe: boolean }) => entry.isMe);
      expect(row).toMatchObject({ title: 'Sage', frameUrl: 'https://example.com/ring.png' });

      expect((await me(token, 'DELETE', '/cosmetics/sage/equip')).body.equipped).toBe(false);
      expect((await me(token, 'GET', '')).body.cosmetics.title).toBeNull();
    });
  });

  describe('leaderboard prizes', () => {
    it('finds nothing paid for plain boards before prizes exist, then pays each closed period once', async () => {
      const now = new Date();
      const week = closedPeriod('weekly', now);
      const users = await Promise.all(['l1', 'l2', 'l3', 'l4'].map((label) => makeUser(label)));
      // Last week: l1 400, l2 300, l3 200, l4 100. Far more than anyone else in this project earned then.
      for (const [index, user] of users.entries()) await earnedAt(user!, 1_000_000 - index * 100_000, week.inside);
      const before = await Promise.all(users.map((user) => xpOf(user!)));

      // ADD-05's check: with no prize set up, a board that closes pays nothing.
      expect(await payLeaderboardPrizes(now)).toBe(0);
      expect(await db.select().from(leaderboardPayouts).where(eq(leaderboardPayouts.projectId, projectId))).toHaveLength(0);

      expect((await call('POST', '/leaderboard-prizes', { name: 'Bad', period: 'weekly', fromRank: 3, toRank: 1, rewards: [{ type: 'xp', amount: 1 }] })).status).toBe(400);
      expect((await call('POST', '/leaderboard-prizes', { name: 'None', period: 'weekly', rewards: [] })).status).toBe(400);
      const winner = await call('POST', '/leaderboard-prizes', { name: 'Weekly winner', period: 'weekly', fromRank: 1, toRank: 1, rewards: [{ type: 'currency', currency: 'gems', amount: 100 }] });
      const podium = await call('POST', '/leaderboard-prizes', { name: 'Weekly podium', period: 'weekly', fromRank: 2, toRank: 3, rewards: [{ type: 'xp', amount: 50 }] });
      expect(podium.status).toBe(201);

      // A prize made after the period ended does not reach back into it.
      expect(await payLeaderboardPrizes(now)).toBe(0);
      expect((await db.select().from(leaderboardPrizes).where(eq(leaderboardPrizes.id, winner.body.id)))[0]!.lastPaidPeriod).toBe(week.key);

      // Pretend both prizes were set up before last week ended.
      await db.update(leaderboardPrizes).set({ createdAt: new Date(week.inside.getTime() - 86_400_000), lastPaidPeriod: null }).where(eq(leaderboardPrizes.projectId, projectId));
      expect(await payLeaderboardPrizes(now)).toBe(3);
      expect(await payLeaderboardPrizes(now)).toBe(0);

      expect(await balance(users[0]!)).toBe(100);
      expect(await xpOf(users[1]!)).toBe(before[1]! + 50);
      expect(await xpOf(users[2]!)).toBe(before[2]! + 50);
      expect(await xpOf(users[3]!)).toBe(before[3]!);

      const payouts = (await call('GET', '/leaderboard-prizes/payouts')).body.data as { rank: number; prizeName: string; periodStart: string }[];
      expect(payouts.map((row) => row.rank).sort()).toEqual([1, 2, 3]);
      expect(payouts.every((row) => row.periodStart === week.key)).toBe(true);

      const token = await tokenFor(users[0]!);
      const mine = (await me(token, 'GET', '/leaderboard/prizes')).body;
      expect(mine.prizes).toHaveLength(2);
      expect(mine.won).toMatchObject([{ period: 'weekly', rank: 1, periodStart: week.key }]);

      // The next week is a new period, and is paid when it closes.
      const later = new Date(now.getTime() + 7 * 86_400_000);
      expect(closedPeriod('weekly', later).key).not.toBe(week.key);
    });
  });

  describe('journeys', () => {
    const makeChallenge = async (key: string, trigger: string, target: number, extra: Record<string, unknown> = {}) => {
      const id = `chl_${key}_${suffix}`;
      await db.insert(challenges).values({ id, projectId, key, name: key, trigger, target, rewards: [], ...extra });
      return id;
    };
    const play = async (user: string, type: string) => processChallengesForEvent(await sendEvent(user, type));

    it('opens each step when the one before is finished, and pays once at the end', async () => {
      await makeChallenge('pick', 'language_picked', 1);
      await makeChallenge('learn', 'lesson_done', 2);
      await makeChallenge('invite', 'friend_invited', 1);
      await makeChallenge('weekly', 'lesson_done', 1, { recurrence: 'weekly' });

      expect((await call('POST', '/journeys', { key: 'j', name: 'J', steps: ['pick'] })).body.message).toMatch(/at least two/);
      expect((await call('POST', '/journeys', { key: 'j', name: 'J', steps: ['pick', 'nope'] })).body.message).toBe('There is no challenge "nope"');
      expect((await call('POST', '/journeys', { key: 'j', name: 'J', steps: ['pick', 'weekly'] })).body.message).toMatch(/runs once/);
      expect((await call('POST', '/journeys', { key: 'j', name: 'J', steps: ['pick', 'pick'] })).body.message).toMatch(/only once/);
      const journey = await call('POST', '/journeys', { key: 'start', name: 'Getting started', steps: ['pick', 'learn', 'invite'], rewards: [{ type: 'xp', amount: 300 }, { type: 'achievement', achievement: 'founder' }] });
      expect(journey.status).toBe(201);
      expect((await call('POST', '/journeys', { key: 'other', name: 'Other', steps: ['learn', 'invite'] })).body.message).toMatch(/already a step in the journey "start"/);

      const user = await makeUser('journey');
      const token = await tokenFor(user);
      const steps = async () => (await me(token, 'GET', '/journeys')).body.data[0].steps as { challenge: string; progress: number; completed: boolean; locked: boolean }[];
      expect((await steps()).map((step) => step.locked)).toEqual([false, true, true]);

      // A lesson before picking a language moves the weekly challenge, but not the locked step.
      await play(user, 'lesson_done');
      expect((await steps())[1]).toMatchObject({ progress: 0, locked: true });
      const listed = (await me(token, 'GET', '/challenges')).body.data as { key: string; locked: boolean; progress: number }[];
      expect(listed.find((item) => item.key === 'learn')).toMatchObject({ locked: true, progress: 0 });
      expect(listed.find((item) => item.key === 'weekly')).toMatchObject({ locked: false, progress: 1 });

      await play(user, 'language_picked');
      expect((await steps()).map((step) => step.locked)).toEqual([false, false, true]);
      await play(user, 'friend_invited');
      await play(user, 'lesson_done');
      await play(user, 'lesson_done');
      expect((await steps())[2]).toMatchObject({ locked: false, completed: false });
      expect(await xpOf(user)).toBe(0);

      await play(user, 'friend_invited');
      const done = (await me(token, 'GET', '/journeys')).body.data[0];
      expect(done).toMatchObject({ completed: true, stepsDone: 3 });
      expect(await xpOf(user)).toBe(300);
      expect(await db.select().from(userAchievements).where(and(eq(userAchievements.userId, user), eq(userAchievements.achievementId, `ach_mx_${suffix}`)))).toHaveLength(1);

      // Another event afterwards pays nothing more.
      await play(user, 'friend_invited');
      expect(await xpOf(user)).toBe(300);
      expect((await call('GET', '/journeys')).body.data[0].completions).toBe(1);
    });

    it('leaves challenges alone when the journeys feature is off', async () => {
      const user = await makeUser('nojourney');
      const result = await processChallengesForEvent(await sendEvent(user, 'lesson_done'), { journeys: false });
      // `learn` is locked for this player, but with journeys off it counts like any challenge.
      expect(result.processedChallengesCount).toBe(2);
    });
  });
});
