import crypto, { randomUUID } from 'crypto';
import {
  achievements,
  currencies,
  db,
  endUsers,
  events,
  leagueMembers,
  leagues,
  member,
  organizations,
  projects,
  referrals,
  rewards,
  ruleVersions,
  rules,
  userAchievements,
  userXpBalances,
  xpLimits,
  runMigrations,
} from '@gami/database';
import { closeSeason, ensureSeason, groupStandings, joinLeaguesForUser, placeInLeague } from '@gami/leaderboards';
import { awardXp, qualifyReferral } from '@gami/rewards';
import { clearPlugins, registerPlugin } from '@gami/rules';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { executeRuleForEvent } from '../../../worker/src/executor.js';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('segments, leagues, social, invites, connectors and environments', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  let apiKey: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_cm_${suffix}`;
  const projectId = `prj_cm_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const call = async (method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
    const res = await app.inject({ method, url: url.startsWith('/api/') ? url : `${base}${url}`, headers: { cookie }, payload: payload as object });
    return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
  };
  const makeUser = async (label: string, metadata: Record<string, unknown> = {}, project = projectId) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId: project, externalId: `${label}_${suffix}`, name: label, metadata });
    return id;
  };
  const giveXp = (userId: string, amount: number) => db.transaction((tx) => awardXp(tx, { projectId, userId, amount, reason: 'Test', idempotencyKey: randomUUID() }));
  const tokenFor = async (userId: string) =>
    JSON.parse((await app.inject({ method: 'POST', url: '/v1/end-user-tokens', headers: { 'x-api-key': apiKey }, payload: { userId } })).payload).token as string;
  const asPlayer = async (userId: string) => {
    const token = await tokenFor(userId);
    return async (method: 'GET' | 'POST' | 'DELETE', url: string, payload?: unknown) => {
      const res = await app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, payload: payload as object });
      return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
    };
  };

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'CM', slug: `cm-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'Production', slug: 'prod' });
    const res = await app.inject({ method: 'POST', url: '/api/auth/sign-up/email', payload: { email: `cm_${randomUUID()}@example.com`, password: 'Password123!', name: 'CM' } });
    cookie = res.headers['set-cookie'] as string;
    await db.insert(member).values({ id: `mem_${suffix}`, organizationId: orgId, userId: JSON.parse(res.payload).user.id, role: 'owner', createdAt: new Date() });
    apiKey = (await createApiKey(projectId, 'Server', ['users:write', 'leaderboard:read', 'social:write', 'referrals:write', 'leagues:read', 'segments:read'])).rawSecret;
  }, 120_000);

  afterAll(async () => {
    clearPlugins();
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  describe('segments and group boards', () => {
    let ana: string;
    let bo: string;
    let cy: string;

    beforeAll(async () => {
      ana = await makeUser('ana', { country: 'IN', team: 'red', plan: 'pro', age: 31 });
      bo = await makeUser('bo', { country: 'IN', team: 'blue', age: 19 });
      cy = await makeUser('cy', { country: 'US', team: 'red', age: 45 });
      await giveXp(ana, 300);
      await giveXp(bo, 200);
      await giveXp(cy, 900);
    }, 120_000);

    it('refuses filters that could never work', async () => {
      expect((await call('POST', '/segments', { key: 'bad', name: 'Bad', filter: { match: 'all', conditions: [{ field: 'password', operator: 'equals', value: 'x' }] } })).status).toBe(400);
      expect((await call('POST', '/segments', { key: 'bad', name: 'Bad', filter: { match: 'all', conditions: [{ field: 'metadata.age', operator: 'greater_than', value: 'old' }] } })).status).toBe(400);
      expect((await call('POST', '/segments', { key: 'bad', name: 'Bad', filter: { match: 'all', conditions: [] } })).status).toBe(400);
    });

    it('previews, saves and counts a segment', async () => {
      const filter = { match: 'all', conditions: [{ field: 'metadata.country', operator: 'equals', value: 'IN' }, { field: 'metadata.age', operator: 'greater_than', value: 18 }] };
      const preview = await call('POST', '/segments/preview', { filter });
      expect(preview.body.count).toBe(2);
      expect(preview.body.sample.map((row: { name: string }) => row.name)).toEqual(['ana', 'bo']);

      expect((await call('POST', '/segments', { key: 'india', name: 'India', filter })).status).toBe(201);
      expect((await call('POST', '/segments', { key: 'india', name: 'Again', filter })).status).toBe(400);
      expect((await call('GET', '/segments/india/members')).body.count).toBe(2);

      const either = await call('POST', '/segments/preview', { filter: { match: 'any', conditions: [{ field: 'metadata.plan', operator: 'equals', value: 'pro' }, { field: 'totalXp', operator: 'greater_than', value: 500 }] } });
      expect(either.body.count).toBe(2);
    }, 120_000);

    it('ranks only the segment, keeping the right ranks and totals', async () => {
      const board = await call('GET', '/leaderboard?segment=india');
      expect(board.body.entries.map((entry: { name: string; rank: number }) => [entry.name, entry.rank])).toEqual([['ana', 1], ['bo', 2]]);
      expect(board.body.total).toBe(2);
      const rank = await call('GET', `/leaderboard/${bo}?segment=india`);
      expect(rank.body.rank).toBe(2);
      expect((await call('GET', '/leaderboard?segment=missing')).status).toBe(404);
    }, 120_000);

    it('ranks teams by total or average XP', async () => {
      const total = await call('GET', '/leaderboard?groupBy=metadata.team');
      expect(total.body.entries).toEqual([
        { rank: 1, group: 'red', xp: 1200, members: 2 },
        { rank: 2, group: 'blue', xp: 200, members: 1 },
      ]);
      const average = await call('GET', '/leaderboard?groupBy=metadata.team&score=average&segment=india');
      expect(average.body.entries.map((entry: { group: string; xp: number }) => [entry.group, entry.xp])).toEqual([['red', 300], ['blue', 200]]);
      expect((await call('GET', '/leaderboard?groupBy=password')).status).toBe(400);
    }, 120_000);

    it('gives players boards of their country and of their friends', async () => {
      const play = await asPlayer(bo);
      const country = await play('GET', '/v1/me/leaderboard?sameAs=metadata.country');
      expect(country.body.entries.map((entry: { name: string }) => entry.name)).toEqual(['ana', 'bo']);
      expect(country.body.me).toMatchObject({ rank: 2, isMe: true });
      expect((await play('GET', '/v1/me/leaderboard?sameAs=email')).status).toBe(400);

      await call('POST', `/users/${bo}/friends`, { friendId: cy });
      const friends = await play('GET', '/v1/me/leaderboard?scope=friends');
      expect(friends.body.entries.map((entry: { name: string }) => entry.name)).toEqual(['cy', 'bo']);
    }, 120_000);
  });

  describe('leagues', () => {
    it('fills groups, shows who moves, and moves them next season', async () => {
      const created = await call('POST', '/leagues', { key: 'weekly', name: 'Weekly', tiers: ['Bronze', 'Silver', 'Gold'], groupSize: 4, promote: 1, relegate: 1 });
      expect(created.status).toBe(201);
      expect((await call('POST', '/leagues', { key: 'tight', name: 'Tight', tiers: ['A', 'B'], groupSize: 4, promote: 2, relegate: 2 })).status).toBe(400);
      const [league] = await db.select().from(leagues).where(eq(leagues.id, created.body.id));

      const players = await Promise.all(['l1', 'l2', 'l3', 'l4', 'l5', 'l6'].map((name) => makeUser(name)));
      for (const [index, id] of players.entries()) {
        await giveXp(id, (index + 1) * 10);
        expect(await joinLeaguesForUser(projectId, id)).toBe(1);
        expect(await joinLeaguesForUser(projectId, id)).toBe(0); // already in
      }
      const lazy = await makeUser('lazy');
      expect(await joinLeaguesForUser(projectId, lazy)).toBe(0); // no XP this season, so no place

      const season = await ensureSeason(league!);
      const members = await db.select().from(leagueMembers).where(eq(leagueMembers.seasonId, season.id));
      expect(members.filter((row) => row.groupNo === 1)).toHaveLength(4);
      expect(members.filter((row) => row.groupNo === 2)).toHaveLength(2);

      const table = await groupStandings(league!, season, 0, 1);
      expect(table[0]).toMatchObject({ name: 'l4', zone: 'promotion' });
      expect(table.slice(1).every((row) => row.zone === 'safe')).toBe(true); // nobody falls out of the lowest tier

      const groups = await call('GET', `/leagues/${league!.id}/groups`);
      expect(groups.body.data.map((group: { members: number }) => group.members).sort()).toEqual([2, 4]);
      const mine = await (await asPlayer(players[3]!))('GET', '/v1/me/leagues');
      expect(mine.body.data[0]).toMatchObject({ tierName: 'Bronze', standings: expect.arrayContaining([expect.objectContaining({ isMe: true, zone: 'promotion' })]) });

      expect(await closeSeason(league!, season)).toEqual({ promoted: 2, relegated: 0 });
      expect(await closeSeason(league!, { ...season, closedAt: new Date() })).toEqual({ promoted: 0, relegated: 0 });

      const nextWeek = new Date(season.endsAt.getTime() + 60_000);
      const moved = await placeInLeague(league!, players[3]!, nextWeek);
      const stayed = await placeInLeague(league!, players[0]!, nextWeek);
      expect(moved.tier).toBe(1);
      expect(stayed.tier).toBe(0);
    }, 300_000);
  });

  describe('friends, kudos, feed and share cards', () => {
    it('keeps friendships both ways, limits kudos, and shows a feed', async () => {
      const kim = await makeUser('kim');
      const lee = await makeUser('lee');
      expect((await call('POST', `/users/${kim}/friends`, { friendId: kim })).status).toBe(400);
      expect((await call('POST', `/users/${kim}/friends`, { friendId: lee })).status).toBe(201);
      expect((await call('GET', `/users/${lee}/friends`)).body.data.map((row: { name: string }) => row.name)).toEqual(['kim']);

      expect((await call('POST', `/users/${kim}/kudos`, { to: lee, message: 'Great run' })).status).toBe(201);
      expect((await call('POST', `/users/${kim}/kudos`, { to: lee })).body.code).toBe('ALREADY_SENT');
      const feed = await call('GET', `/users/${kim}/feed`);
      expect(feed.body.data[0]).toMatchObject({ type: 'kudos', name: 'lee', detail: 'Great run' });

      await call('DELETE', `/users/${lee}/friends/${kim}`);
      expect((await call('GET', `/users/${kim}/friends`)).body.data).toEqual([]);
    }, 120_000);

    it('lets players befriend and thank each other by invite code, never by ID', async () => {
      const max = await makeUser('max');
      const noa = await makeUser('noa');
      const asMax = await asPlayer(max);
      const asNoa = await asPlayer(noa);
      const code = (await asNoa('GET', '/v1/me/referral')).body.code as string;
      expect(code).toMatch(/^[A-Z2-9]{8}$/);

      expect((await asMax('POST', '/v1/me/friends', { code: 'NOPE2345' })).status).toBe(404);
      expect((await asMax('POST', '/v1/me/friends', { code: code.toLowerCase() })).status).toBe(201);
      const friends = (await asMax('GET', '/v1/me/friends')).body.data;
      expect(friends).toEqual([{ name: 'noa', avatarUrl: null, totalXp: 0, code }]);
      expect(JSON.stringify(friends)).not.toContain(noa);

      expect((await asMax('POST', '/v1/me/kudos', { code, message: 'Thanks' })).status).toBe(201);
      expect((await asNoa('GET', '/v1/me/kudos')).body.data[0]).toMatchObject({ from: 'max', message: 'Thanks' });
      expect((await asMax('DELETE', `/v1/me/friends/${code}`)).status).toBe(204);
    }, 120_000);

    it('makes a signed image link for an earned achievement', async () => {
      const zed = await makeUser('zed');
      const achievementId = `ach_${randomUUID()}`;
      await db.insert(achievements).values({ id: achievementId, projectId, key: 'first_win', name: 'First <Win>', description: 'Won a game' });
      await db.insert(userAchievements).values({ id: `ua_${randomUUID()}`, projectId, userId: zed, achievementId });
      const asZed = await asPlayer(zed);
      expect((await asZed('GET', '/v1/me/achievements/other/share')).status).toBe(404);
      const { url } = (await asZed('GET', '/v1/me/achievements/first_win/share')).body as { url: string };
      const path = new URL(url).pathname;

      const image = await app.inject({ method: 'GET', url: path });
      expect(image.statusCode).toBe(200);
      expect(image.headers['content-type']).toContain('image/svg+xml');
      expect(image.payload).toContain('First &lt;Win&gt;');
      expect(image.payload).not.toContain(zed);

      const tampered = path.replace(/\.([^.]+)\.svg$/, '.AAAAAAAAAAAAAAAAAAAAAA.svg');
      expect((await app.inject({ method: 'GET', url: tampered })).statusCode).toBe(404);
    }, 120_000);
  });

  describe('invites', () => {
    const xpOf = async (userId: string) => (await db.select().from(userXpBalances).where(eq(userXpBalances.userId, userId)))[0]?.totalXp ?? 0;

    it('rewards both sides once, when the invite qualifies, and respects the limit', async () => {
      const inviter = await makeUser('inviter');
      const code = (await call('GET', `/users/${inviter}/referral`)).body.code as string;
      const first = await makeUser('first');
      expect((await call('POST', `/users/${first}/referral`, { code })).body.code).toBe('NO_PROGRAM');

      expect((await call('PUT', '/referral-program', { enabled: true, qualifyingEvent: 'first_purchase', referrerXp: 100, refereeXp: 40, maxRewardsPerReferrer: 1 })).status).toBe(200);
      expect((await call('POST', `/users/${first}/referral`, { code: 'WRONG234' })).body.code).toBe('INVALID_CODE');
      expect((await call('POST', `/users/${inviter}/referral`, { code })).body.code).toBe('SELF_REFERRAL');
      expect((await call('POST', `/users/${first}/referral`, { code })).body).toMatchObject({ status: 'pending' });
      expect((await call('POST', `/users/${first}/referral`, { code })).body.code).toBe('ALREADY_REFERRED');
      expect(await xpOf(inviter)).toBe(0);

      expect(await qualifyReferral(projectId, first, 'page_view')).toBeNull();
      expect((await qualifyReferral(projectId, first, 'first_purchase'))?.status).toBe('rewarded');
      expect(await qualifyReferral(projectId, first, 'first_purchase')).toBeNull(); // already paid
      expect(await xpOf(inviter)).toBe(100);
      expect(await xpOf(first)).toBe(40);

      const second = await makeUser('second');
      await call('POST', `/users/${second}/referral`, { code });
      expect((await qualifyReferral(projectId, second, 'first_purchase'))?.status).toBe('capped');
      expect(await xpOf(inviter)).toBe(100);
      expect(await xpOf(second)).toBe(40);

      const old = await makeUser('old');
      await db.update(endUsers).set({ createdAt: new Date(Date.now() - 40 * 86_400_000) }).where(eq(endUsers.id, old));
      expect((await call('POST', `/users/${old}/referral`, { code })).body.code).toBe('TOO_LATE');

      const summary = (await call('GET', `/users/${inviter}/referral`)).body;
      expect(summary).toEqual({ code, invited: 2, rewarded: 1, pending: 0 });
      expect((await call('GET', '/referrals')).body.data).toHaveLength(2);
    }, 300_000);

    it('pays at once when no event is needed', async () => {
      await call('PUT', '/referral-program', { enabled: true, qualifyingEvent: null, referrerXp: 5, refereeXp: 5, maxRewardsPerReferrer: null });
      const host = await makeUser('host');
      const guest = await makeUser('guest');
      const asGuest = await asPlayer(guest);
      const code = (await (await asPlayer(host))('GET', '/v1/me/referral')).body.code;
      expect((await asGuest('POST', '/v1/me/referral', { code })).body).toEqual({ status: 'rewarded' });
      const [row] = await db.select().from(referrals).where(eq(referrals.refereeId, guest));
      expect(row?.status).toBe('rewarded');
    }, 120_000);
  });

  describe('connectors', () => {
    const post = (id: string, body: string, headers: Record<string, string>) =>
      app.inject({ method: 'POST', url: `/v1/connectors/${id}`, payload: body, headers: { 'content-type': 'application/json', ...headers } });

    it('turns Segment calls into events and profiles, once each, and refuses bad secrets', async () => {
      const created = await call('POST', '/connectors', { type: 'segment', name: 'Segment' });
      expect(created.status).toBe(201);
      expect(created.body.secret).toMatch(/^gcs_/);
      expect(JSON.stringify((await call('GET', '/connectors')).body)).not.toContain(created.body.secret);

      const body = JSON.stringify({
        batch: [
          { type: 'identify', userId: `seg_${suffix}`, traits: { name: 'Seg User', email: 'seg@example.com', plan: 'pro' } },
          { type: 'track', event: 'Order Completed', userId: `seg_${suffix}`, messageId: `m_${suffix}`, properties: { total: 30 } },
        ],
      });
      expect((await post(created.body.id, body, { authorization: 'Bearer wrong' })).statusCode).toBe(401);
      const ok = await post(created.body.id, body, { authorization: `Bearer ${created.body.secret}` });
      expect(ok.statusCode).toBe(202);
      expect(JSON.parse(ok.payload)).toEqual({ accepted: 1, duplicates: 0, skipped: 0, identified: 1 });
      expect(JSON.parse((await post(created.body.id, body, { authorization: `Bearer ${created.body.secret}` })).payload)).toMatchObject({ accepted: 0, duplicates: 1 });

      const [person] = await db.select().from(endUsers).where(and(eq(endUsers.projectId, projectId), eq(endUsers.externalId, `seg_${suffix}`)));
      expect(person).toMatchObject({ name: 'Seg User', email: 'seg@example.com' });
      expect(person!.metadata).toMatchObject({ plan: 'pro' });
      const stored = await db.select().from(events).where(eq(events.userId, person!.id));
      expect(stored.map((row) => row.type)).toEqual(['order_completed']);

      await call('PATCH', `/connectors/${created.body.id}`, { enabled: false });
      expect((await post(created.body.id, body, { authorization: `Bearer ${created.body.secret}` })).statusCode).toBe(404);
    }, 180_000);

    it('checks Stripe and GitHub signatures over the exact bytes', async () => {
      expect((await call('POST', '/connectors', { type: 'stripe', name: 'Stripe' })).status).toBe(400);
      const stripe = await call('POST', '/connectors', { type: 'stripe', name: 'Stripe', secret: 'whsec_testsecret' });
      expect(stripe.body.secret).toBeUndefined();
      const body = JSON.stringify({ id: `evt_${suffix}`, type: 'invoice.paid', created: Math.floor(Date.now() / 1000), data: { object: { customer: 'cus_1', amount_paid: 1500, currency: 'eur', metadata: { gami_user_id: `pay_${suffix}` } } } });
      const t = Math.floor(Date.now() / 1000);
      const sig = crypto.createHmac('sha256', 'whsec_testsecret').update(`${t}.${body}`).digest('hex');
      const paid = await post(stripe.body.id, body, { 'stripe-signature': `t=${t},v1=${sig}` });
      expect(JSON.parse(paid.payload)).toMatchObject({ accepted: 1 });
      expect((await post(stripe.body.id, `${body} `, { 'stripe-signature': `t=${t},v1=${sig}` })).statusCode).toBe(401);

      const github = await call('POST', '/connectors', { type: 'github', name: 'GitHub', secret: 'gh-secret-123' });
      const push = JSON.stringify({ sender: { login: `octo_${suffix}` }, commits: [{}], repository: { full_name: 'acme/app' } });
      const signed = `sha256=${crypto.createHmac('sha256', 'gh-secret-123').update(push).digest('hex')}`;
      const res = await post(github.body.id, push, { 'x-hub-signature-256': signed, 'x-github-event': 'push', 'x-github-delivery': `d_${suffix}` });
      expect(JSON.parse(res.payload)).toMatchObject({ accepted: 1 });
      const [row] = await db.select().from(events).where(and(eq(events.projectId, projectId), eq(events.type, 'github.push')));
      expect(row?.payload).toMatchObject({ commits: 1, repository: 'acme/app' });
    }, 180_000);

    it('keeps connectors away from API keys', async () => {
      const res = await app.inject({ method: 'GET', url: '/v1/connectors', headers: { 'x-api-key': apiKey } });
      expect(res.statusCode).not.toBe(200);
    });
  });

  describe('environments and promotion', () => {
    const stagingId = `prj_cs_${suffix}`;

    beforeAll(async () => {
      await db.insert(projects).values({ id: stagingId, organizationId: orgId, name: 'Staging', slug: 'staging', environment: 'staging' });
    });

    it('gives staging projects test keys that work', async () => {
      const key = await createApiKey(stagingId, 'Staging', ['users:read']);
      expect(key.rawSecret.startsWith('gami_test_')).toBe(true);
      expect((await app.inject({ method: 'GET', url: '/v1/users', headers: { 'x-api-key': key.rawSecret } })).statusCode).toBe(200);
      expect((await call('PATCH', `/api/projects/${stagingId}`, { promotesToProjectId: stagingId })).status).toBe(400);
      expect((await call('PATCH', `/api/projects/${stagingId}`, { environment: 'qa' })).status).toBe(400);
    }, 120_000);

    it('copies the design with references fixed, and only what changed', async () => {
      const sb = `/api/projects/${stagingId}`;
      await call('POST', `${sb}/currencies`, { key: 'gems', name: 'Gems' });
      await call('POST', `${sb}/achievements`, { key: 'starter', name: 'Starter' });
      const [stagingAchievement] = await db.select().from(achievements).where(and(eq(achievements.projectId, stagingId), eq(achievements.key, 'starter')));
      expect(stagingAchievement).toBeTruthy();
      const rule = await call('POST', `${sb}/rules`, { name: 'Welcome', trigger: 'signed_up', actions: [{ type: 'award_xp', params: { amount: 10 } }, { type: 'award_achievement', params: { achievementKey: 'starter', achievementId: stagingAchievement!.id } }] });
      expect(rule.status).toBe(201);
      await call('POST', `${sb}/limits`, { name: 'Welcome cap', kind: 'award_cap', period: 'day', amount: 1, ruleId: rule.body.id });
      await call('POST', `${sb}/rewards`, { key: 'gem_pack', name: 'Gem pack', currency: 'gems', cost: 5 });
      expect((await call('PATCH', sb, { promotesToProjectId: projectId })).status).toBe(200);

      const diff = await call('GET', `${sb}/promotion`);
      expect(diff.status).toBe(200);
      const wanted = ['currencies:gems', 'achievements:starter', 'rules:Welcome', 'limits:Welcome cap', 'rewards:gem_pack'];
      const keys = diff.body.data.filter((item: { status: string }) => item.status === 'new').map((item: { kind: string; identity: string }) => `${item.kind}:${item.identity}`);
      for (const key of wanted) expect(keys).toContain(key);

      const done = await call('POST', `${sb}/promotion`, {});
      expect(done.status).toBe(200);
      expect(done.body.created).toBeGreaterThanOrEqual(5);

      const [prodAchievement] = await db.select().from(achievements).where(and(eq(achievements.projectId, projectId), eq(achievements.key, 'starter')));
      const [prodRule] = await db.select().from(rules).where(and(eq(rules.projectId, projectId), eq(rules.name, 'Welcome')));
      expect((prodRule!.actions as { params: { achievementId?: string } }[])[1]!.params.achievementId).toBe(prodAchievement!.id);
      const [prodLimit] = await db.select().from(xpLimits).where(and(eq(xpLimits.projectId, projectId), eq(xpLimits.name, 'Welcome cap')));
      expect(prodLimit!.ruleId).toBe(prodRule!.id);
      const [prodCurrency] = await db.select().from(currencies).where(and(eq(currencies.projectId, projectId), eq(currencies.key, 'gems')));
      const [prodReward] = await db.select().from(rewards).where(and(eq(rewards.projectId, projectId), eq(rewards.key, 'gem_pack')));
      expect(prodReward!.currencyId).toBe(prodCurrency!.id);
      expect((await db.select().from(ruleVersions).where(eq(ruleVersions.ruleId, prodRule!.id))).length).toBeGreaterThan(0);

      const again = await call('GET', `${sb}/promotion`);
      expect(again.body.summary.new + again.body.summary.changed).toBe(0);

      await call('PATCH', `${sb}/rules/${rule.body.id}`, { actions: [{ type: 'award_xp', params: { amount: 25 } }] });
      const changed = await call('GET', `${sb}/promotion`);
      expect(changed.body.data.find((item: { identity: string }) => item.identity === 'Welcome')).toMatchObject({ status: 'changed', changes: ['actions'] });
      expect((await call('POST', `${sb}/promotion`, { items: [{ kind: 'rules', identity: 'Welcome' }] })).body).toEqual({ created: 0, updated: 1 });
      const [updated] = await db.select().from(rules).where(eq(rules.id, prodRule!.id));
      expect((updated!.actions as { params: { amount: number } }[])[0]!.params.amount).toBe(25);
    }, 300_000);

    it('refuses to promote outside the organization', async () => {
      const otherOrg = `org_cx_${suffix}`;
      await db.insert(organizations).values({ id: otherOrg, name: 'Other', slug: `cx-${suffix}` });
      await db.insert(projects).values({ id: `prj_cx_${suffix}`, organizationId: otherOrg, name: 'Theirs', slug: 'theirs' });
      expect([403, 404]).toContain((await call('GET', `/api/projects/${stagingId}/promotion?target=prj_cx_${suffix}`)).status);
      await db.delete(organizations).where(eq(organizations.id, otherOrg));
    }, 120_000);
  });

  describe('expressions and plugins in rules', () => {
    it('saves and runs a rule with an expression condition and a plugin action', async () => {
      const ran: { idempotencyKey: string; params: Record<string, unknown> }[] = [];
      registerPlugin({
        name: 'acme',
        actions: {
          'acme.send_gift': {
            label: 'Send a gift',
            validate: (params) => {
              if (typeof params['sku'] !== 'string') throw new Error('acme.send_gift needs a sku');
            },
            run: (context) => {
              ran.push({ idempotencyKey: context.idempotencyKey, params: context.params });
            },
          },
        },
      });

      expect((await call('POST', '/rules', { name: 'Gift bad', trigger: 'order', actions: [{ type: 'acme.send_gift', params: {} }] })).status).toBe(400);
      expect((await call('POST', '/rules', { name: 'Logic bad', trigger: 'order', conditions: { all: [{ logic: { eval: 'x' } }] }, actions: [{ type: 'award_xp', params: { amount: 1 } }] })).status).toBe(400);
      const created = await call('POST', '/rules', {
        name: 'Big order gift',
        trigger: 'order',
        conditions: { all: [{ logic: { '>': [{ '*': [{ var: 'payload.price' }, { var: 'payload.qty' }] }, 100] } }] },
        actions: [{ type: 'acme.send_gift', params: { sku: 'mug' } }],
      });
      expect(created.status).toBe(201);
      expect((await call('GET', '/api/plugins')).body.actions).toEqual([{ type: 'acme.send_gift', label: 'Send a gift', description: null, plugin: 'acme' }]);

      const [rule] = await db.select().from(rules).where(eq(rules.id, created.body.id));
      const buyer = await makeUser('buyer');
      const small = { id: `evt_${randomUUID()}`, projectId, userId: buyer, type: 'order', payload: { price: 20, qty: 2 }, occurredAt: new Date() };
      const big = { ...small, id: `evt_${randomUUID()}`, payload: { price: 60, qty: 2 } };
      await db.insert(events).values([small, big]);
      expect((await executeRuleForEvent(rule!, small)).status).toBe('skipped');
      expect((await executeRuleForEvent(rule!, big)).status).toBe('completed');
      expect(ran).toHaveLength(1);
      expect(ran[0]!.params).toEqual({ sku: 'mug' });
      expect(ran[0]!.idempotencyKey).toMatch(/^rule:.+:0$/);
    }, 180_000);
  });
});
