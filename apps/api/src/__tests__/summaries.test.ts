import { randomUUID } from 'crypto';
import {
  challenges,
  db,
  endUsers,
  levels,
  member,
  organizations,
  projects,
  runMigrations,
  userChallengeProgress,
  userXpBalances,
} from '@gami/database';
import { calculateLevel } from '@gami/progression';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

/**
 * The summaries are counted in the database. These check them against the same figures worked
 * out here with the existing level calculator, so the two can't drift apart.
 */
describe('Project summaries', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_sum_${suffix}`;
  const projectId = `prj_sum_${suffix}`;

  const ladder = [
    { level: 1, name: 'Beginner', requiredXp: 100, enabled: true },
    { level: 2, name: 'Explorer', requiredXp: 500, enabled: true },
    { level: 3, name: 'Disabled', requiredXp: 800, enabled: false },
    { level: 5, name: 'Veteran', requiredXp: 2000, enabled: true },
  ];

  // Below the first level, on every boundary, past the top, with no balance, and deactivated.
  const holders = [
    { xp: 0 },
    { xp: 99 },
    { xp: 100 },
    { xp: 499 },
    { xp: 500 },
    { xp: 799 },
    { xp: 800 },
    { xp: 1999 },
    { xp: 2000 },
    { xp: 2001 },
    { xp: 50_000 },
    { xp: null },
    { xp: 600, active: false },
  ].map((holder, index) => ({ ...holder, id: `usr_sum_${index}_${suffix}` }));

  const get = (url: string) => app.inject({ method: 'GET', url, headers: { cookie } });

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    await db.insert(organizations).values({ id: orgId, name: 'Summary', slug: `sum-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'Summary', slug: 'sum' });

    const signUp = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: { email: `sum_${suffix}@example.com`, password: 'Password123!', name: 'Owner' },
    });
    cookie = signUp.headers['set-cookie'] as string;
    const ownerId = JSON.parse(signUp.payload).user.id as string;
    await db.insert(member).values({
      id: `mem_sum_${suffix}`,
      organizationId: orgId,
      userId: ownerId,
      role: 'owner',
      createdAt: new Date(),
    });

    await db.insert(levels).values(
      ladder.map((item) => ({ id: `lvl_sum_${item.level}_${suffix}`, projectId, ...item }))
    );
    await db.insert(endUsers).values(
      holders.map((holder) => ({
        id: holder.id,
        projectId,
        externalId: holder.id,
        active: holder.active ?? true,
      }))
    );
    await db.insert(userXpBalances).values(
      holders
        .filter((holder) => holder.xp !== null)
        .map((holder) => ({
          id: `uxb_${holder.id}`,
          projectId,
          userId: holder.id,
          totalXp: holder.xp as number,
        }))
    );
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('counts users on each level exactly as the level calculator places them', async () => {
    const expected = new Map<number, number>();
    for (const holder of holders) {
      const level = calculateLevel(holder.xp ?? 0, ladder).level;
      expected.set(level, (expected.get(level) ?? 0) + 1);
    }

    const res = await get(`/api/projects/${projectId}/progression/summary`);
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.distribution.map((row: { level: number }) => row.level)).toEqual([1, 2, 5]);
    for (const row of body.distribution as { level: number; userCount: number }[]) {
      expect(row.userCount, `level ${row.level}`).toBe(expected.get(row.level) ?? 0);
    }
    expect(body.usersAtMaxLevel).toBe(expected.get(5));
    expect(body.usersWithXp).toBe(holders.filter((holder) => (holder.xp ?? 0) > 0).length);
    expect(body.maxConfiguredLevel).toBe(5);
  });

  it('returns an empty distribution when a project has no levels', async () => {
    await db.delete(levels).where(eq(levels.projectId, projectId));
    const body = JSON.parse((await get(`/api/projects/${projectId}/progression/summary`)).payload);

    expect(body.distribution).toEqual([]);
    expect(body.usersAtMaxLevel).toBe(0);
  });

  it('summarises challenge progress', async () => {
    const [first, second, third] = ['a', 'b', 'c'].map((key) => ({
      id: `chl_sum_${key}_${suffix}`,
      projectId,
      key,
      name: `Challenge ${key}`,
      trigger: 'event',
      target: 5,
    }));
    await db.insert(challenges).values([first!, second!, third!]);

    const progress = (challenge: typeof first, user: string, completed: boolean) => ({
      id: `ucp_${challenge!.key}_${user}`,
      projectId,
      challengeId: challenge!.id,
      userId: user,
      progress: completed ? 5 : 2,
      completed,
    });
    await db.insert(userChallengeProgress).values([
      progress(first, holders[0]!.id, true),
      progress(first, holders[1]!.id, true),
      progress(first, holders[2]!.id, false),
      progress(second, holders[0]!.id, true),
      progress(second, holders[3]!.id, false),
    ]);

    const res = await get(`/api/projects/${projectId}/challenges/summary`);
    const body = JSON.parse(res.payload);

    expect(res.statusCode).toBe(200);
    expect(body.totalChallenges).toBe(3);
    expect(body.totalCompletedInstances).toBe(3);
    expect(body.uniqueParticipatingUsers).toBe(4);
    expect(body.completionRate).toBe(60);
    expect(body.mostCompletedChallenges.map((row: { key: string }) => row.key).slice(0, 2)).toEqual(['a', 'b']);
    expect(body.mostCompletedChallenges[0].completedCount).toBe(2);
    expect(body.mostCompletedChallenges[2].completedCount).toBe(0);
  });

  it('handles a project with no challenge progress', async () => {
    await db.delete(userChallengeProgress).where(eq(userChallengeProgress.projectId, projectId));
    const body = JSON.parse((await get(`/api/projects/${projectId}/challenges/summary`)).payload);

    expect(body).toMatchObject({
      totalCompletedInstances: 0,
      uniqueParticipatingUsers: 0,
      completionRate: 0,
    });
  });
});
