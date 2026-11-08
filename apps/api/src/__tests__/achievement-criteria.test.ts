import { randomUUID } from 'crypto';
import {
  db,
  endUsers,
  events,
  member,
  notifications,
  organizations,
  projects,
  runMigrations,
  userAchievements,
  userXpBalances,
} from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { processAchievementCriteriaForEvent } from '../../../worker/src/achievement-progress.js';
import { loadAchievementProgress } from '../achievements/progress.js';
import { buildServer } from '../index.js';

describe('achievements that measure themselves', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_ac_${suffix}`;
  const projectId = `prj_ac_${suffix}`;
  const base = `/api/projects/${projectId}`;

  const create = async (body: Record<string, unknown>) => {
    const res = await app.inject({ method: 'POST', url: `${base}/achievements`, headers: { cookie }, payload: body });
    return { status: res.statusCode, body: JSON.parse(res.payload) };
  };

  const makeUser = async (label: string) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}` });
    return id;
  };

  const record = async (userId: string, type: string, payload: Record<string, unknown> = {}) => {
    const id = `evt_${randomUUID()}`;
    const occurredAt = new Date(Date.now() - 5000);
    await db.insert(events).values({ id, projectId, userId, type, payload, occurredAt });
    return { id, projectId, userId, type, payload, occurredAt };
  };

  const xp = async (userId: string) =>
    (await db.select().from(userXpBalances).where(eq(userXpBalances.userId, userId)))[0]?.totalXp ?? 0;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();
    await db.insert(organizations).values({ id: orgId, name: 'AC', slug: `ac-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'AC', slug: 'ac' });

    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `ac_${randomUUID()}@example.com`, password: 'Password123!', name: 'AC' },
    });
    cookie = res.headers['set-cookie'] as string;
    await db.insert(member).values({
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

  describe('saving criteria', () => {
    it('stores criteria, tiers and the secret flag', async () => {
      const { status, body } = await create({
        key: 'bookworm',
        name: 'Bookworm',
        hidden: true,
        criteria: { event: 'lesson_done', metric: 'count', window: 'all_time', target: 3 },
        tiers: [
          { name: 'Silver', target: 5, xp: 100 },
          { name: 'Gold', target: 8, xp: 250 },
        ],
      });
      expect(status).toBe(201);
      expect(body).toMatchObject({ hidden: true, criteria: { target: 3 }, tiers: [{ name: 'Silver' }, { name: 'Gold' }] });
    });

    it.each([
      ['a target of zero', { criteria: { event: 'e', metric: 'count', window: 'all_time', target: 0 } }],
      ['no event', { criteria: { metric: 'count', window: 'all_time', target: 3 } }],
      ['a sum with no field', { criteria: { event: 'e', metric: 'sum', window: 'all_time', target: 3 } }],
      ['tiers that do not climb', { criteria: { event: 'e', metric: 'count', window: 'all_time', target: 5 }, tiers: [{ name: 'Low', target: 4 }] }],
      ['a nameless tier', { criteria: { event: 'e', metric: 'count', window: 'all_time', target: 5 }, tiers: [{ target: 9 }] }],
    ])('rejects %s', async (_label, extra) => {
      const { status } = await create({ key: `bad_${randomUUID().slice(0, 6)}`, name: 'Bad', ...extra });
      expect(status).toBe(400);
    });

    it('can add criteria later, and clear them again', async () => {
      const made = await create({ key: 'later', name: 'Later' });
      expect(made.body.criteria).toBeNull();

      const update = (payload: Record<string, unknown>) =>
        app.inject({ method: 'PATCH', url: `${base}/achievements/${made.body.id}`, headers: { cookie }, payload });

      const added = await update({ criteria: { event: 'x', metric: 'count', window: 'last_7d', target: 2 } });
      expect(JSON.parse(added.payload).criteria).toMatchObject({ target: 2 });

      const badTier = await update({ tiers: [{ name: 'Too low', target: 1 }] });
      expect(badTier.statusCode).toBe(400);

      const cleared = await update({ criteria: null });
      expect(JSON.parse(cleared.payload)).toMatchObject({ criteria: null, tiers: null });
    });
  });

  describe('earning through events', () => {
    it('moves up through the tiers, rewarding each once', async () => {
      const userId = await makeUser('reader');
      const progress = async () =>
        (await loadAchievementProgress(projectId, userId, { includeHidden: true })).find((p) => p.key === 'bookworm')!;

      for (let i = 0; i < 2; i++) await processAchievementCriteriaForEvent(await record(userId, 'lesson_done'));
      expect(await progress()).toMatchObject({ tier: 0, value: 2, nextTarget: 3, earned: false });

      await processAchievementCriteriaForEvent(await record(userId, 'lesson_done'));
      expect(await progress()).toMatchObject({ tier: 1, earned: true, nextTarget: 5 });
      expect(await db.select().from(userAchievements).where(eq(userAchievements.userId, userId))).toHaveLength(1);

      for (let i = 0; i < 2; i++) await processAchievementCriteriaForEvent(await record(userId, 'lesson_done'));
      expect(await progress()).toMatchObject({ tier: 2, tierName: 'Silver', nextTarget: 8 });
      expect(await xp(userId)).toBe(100);

      for (let i = 0; i < 3; i++) await processAchievementCriteriaForEvent(await record(userId, 'lesson_done'));
      expect(await progress()).toMatchObject({ tier: 3, tierName: 'Gold', complete: true, fraction: 1 });
      expect(await xp(userId)).toBe(350);

      // Further activity and a repeated event change nothing.
      const extra = await record(userId, 'lesson_done');
      await processAchievementCriteriaForEvent(extra);
      await processAchievementCriteriaForEvent(extra);
      expect(await xp(userId)).toBe(350);

      const tierNotices = await db
        .select()
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.sourceType, 'achievement_tier')));
      expect(tierNotices).toHaveLength(2);
    }, 240_000);

    it('keeps secret achievements out of a player view until they are earned', async () => {
      const userId = await makeUser('secret');
      const keys = async (includeHidden: boolean) =>
        (await loadAchievementProgress(projectId, userId, { includeHidden })).map((entry) => entry.key);

      expect(await keys(false)).not.toContain('bookworm');
      expect(await keys(true)).toContain('bookworm');

      for (let i = 0; i < 3; i++) await processAchievementCriteriaForEvent(await record(userId, 'lesson_done'));
      expect(await keys(false)).toContain('bookworm');
    }, 120_000);

    it('ignores other event types', async () => {
      const userId = await makeUser('other');
      await processAchievementCriteriaForEvent(await record(userId, 'something_else'));
      const entry = (await loadAchievementProgress(projectId, userId, { includeHidden: true })).find((p) => p.key === 'bookworm');
      expect(entry).toMatchObject({ tier: 0, value: 0 });
    }, 60_000);

    it('follows a streak through its own event', async () => {
      const { status } = await create({
        key: 'week_streak',
        name: 'Week streak',
        criteria: { metric: 'streak', streak: 'daily_lesson', target: 7 },
        tiers: [{ name: 'Month', target: 30, xp: 500 }],
      });
      expect(status).toBe(201);

      const userId = await makeUser('streaker');
      const streakEvent = (longest: number, streak = 'daily_lesson') =>
        record(userId, 'streak_updated', { streak, current: longest, longest });

      await processAchievementCriteriaForEvent(await streakEvent(5));
      await processAchievementCriteriaForEvent(await streakEvent(9, 'another_streak'));
      let entry = (await loadAchievementProgress(projectId, userId, { includeHidden: true })).find((p) => p.key === 'week_streak')!;
      expect(entry).toMatchObject({ tier: 0, value: 5 });

      await processAchievementCriteriaForEvent(await streakEvent(7));
      await processAchievementCriteriaForEvent(await streakEvent(1)); // the streak broke, the best is kept
      entry = (await loadAchievementProgress(projectId, userId, { includeHidden: true })).find((p) => p.key === 'week_streak')!;
      expect(entry).toMatchObject({ tier: 1, value: 7, earned: true });

      await processAchievementCriteriaForEvent(await streakEvent(30));
      expect(await xp(userId)).toBe(500);
    }, 180_000);
  });

  describe('API', () => {
    it("lists a user's progress for staff, including secret achievements", async () => {
      const userId = await makeUser('api');
      await processAchievementCriteriaForEvent(await record(userId, 'lesson_done'));

      const res = await app.inject({
        method: 'GET',
        url: `${base}/users/${userId}/achievements/progress`,
        headers: { cookie },
      });
      expect(res.statusCode).toBe(200);
      const bookworm = JSON.parse(res.payload).data.find((entry: { key: string }) => entry.key === 'bookworm');
      expect(bookworm).toMatchObject({ hidden: true, tier: 0, value: 1, tierCount: 3, nextTarget: 3 });
    }, 60_000);
  });
});
