import { randomUUID } from 'crypto';
import {
  checkDatabaseHealth,
  db,
  endUsers,
  levels,
  organizations,
  projects,
  userXpBalances,
  xpLedger,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getLeaderboard, getUserRank } from '../service.js';

describe('@gami/leaderboards - Service & Window Function Test Suite', () => {
  let orgId: string;
  let projA: string;
  let projB: string;

  let user1: string; // 500 XP
  let user2: string; // 300 XP
  let user3: string; // 300 XP (Tie breaker user2 vs user3 by ID)
  let user4: string; // 0 XP
  let userProjB: string; // Project B user

  const mockNow = new Date('2026-08-14T12:00:00.000Z');

  beforeAll(async () => {
    const isHealthy = await checkDatabaseHealth();
    expect(isHealthy).toBe(true);

    orgId = `org_lb_${randomUUID()}`;
    projA = `prj_lba_${randomUUID()}`;
    projB = `prj_lbb_${randomUUID()}`;

    await db.insert(organizations).values({
      id: orgId,
      name: 'Leaderboard Test Org',
      slug: `lb-org-${randomUUID()}`,
    });

    await db.insert(projects).values({
      id: projA,
      organizationId: orgId,
      name: 'Project A',
      slug: `prj-a-${randomUUID()}`,
    });

    await db.insert(projects).values({
      id: projB,
      organizationId: orgId,
      name: 'Project B',
      slug: `prj-b-${randomUUID()}`,
    });

    // Create Level definitions for Project A
    await db.insert(levels).values([
      { id: `lvl_1_${randomUUID()}`, projectId: projA, level: 1, name: 'Rookie', requiredXp: 0 },
      { id: `lvl_2_${randomUUID()}`, projectId: projA, level: 2, name: 'Pro', requiredXp: 200 },
      { id: `lvl_3_${randomUUID()}`, projectId: projA, level: 3, name: 'Master', requiredXp: 400 },
    ]);

    // Create End Users
    user1 = `usr_1_${randomUUID()}`;
    user2 = `usr_2_${randomUUID()}`;
    user3 = `usr_3_${randomUUID()}`;
    user4 = `usr_4_${randomUUID()}`;
    userProjB = `usr_b_${randomUUID()}`;

    // Ensure user2 < user3 alphabetically for deterministic tie check
    if (user2 > user3) {
      const temp = user2;
      user2 = user3;
      user3 = temp;
    }

    await db.insert(endUsers).values([
      { id: user1, projectId: projA, externalId: 'ext_alice', name: 'Alice Smith' },
      { id: user2, projectId: projA, externalId: 'ext_bob', name: 'Bob Jones' },
      { id: user3, projectId: projA, externalId: 'ext_charlie', name: 'Charlie Brown' },
      { id: user4, projectId: projA, externalId: 'ext_dave', name: 'Dave Miller' },
      { id: userProjB, projectId: projB, externalId: 'ext_eve', name: 'Eve Online' },
    ]);

    // User XP Balances (all_time)
    await db.insert(userXpBalances).values([
      { id: `uxb_1_${randomUUID()}`, projectId: projA, userId: user1, totalXp: 500 },
      { id: `uxb_2_${randomUUID()}`, projectId: projA, userId: user2, totalXp: 300 },
      { id: `uxb_3_${randomUUID()}`, projectId: projA, userId: user3, totalXp: 300 },
      { id: `uxb_4_${randomUUID()}`, projectId: projA, userId: user4, totalXp: 0 },
      { id: `uxb_b_${randomUUID()}`, projectId: projB, userId: userProjB, totalXp: 999 },
    ]);

    // XP Ledger Entries (Today = 2026-08-14, Old = 2026-07-01)
    const today = new Date('2026-08-14T10:00:00.000Z');
    const oldDate = new Date('2026-07-01T10:00:00.000Z');

    await db.insert(xpLedger).values([
      // User 1 today: +400 XP
      {
        id: `xl_1_${randomUUID()}`,
        projectId: projA,
        userId: user1,
        amount: 400,
        reason: 'Daily award',
        createdAt: today,
      },
      // User 1 old: +100 XP
      {
        id: `xl_2_${randomUUID()}`,
        projectId: projA,
        userId: user1,
        amount: 100,
        reason: 'Old award',
        createdAt: oldDate,
      },
      // User 2 today: +400 XP, -100 XP negative adjustment = 300 XP
      {
        id: `xl_3_${randomUUID()}`,
        projectId: projA,
        userId: user2,
        amount: 400,
        reason: 'Today award',
        createdAt: today,
      },
      {
        id: `xl_4_${randomUUID()}`,
        projectId: projA,
        userId: user2,
        amount: -100,
        reason: 'Deduction',
        createdAt: today,
      },
      // User 3 today: +300 XP
      {
        id: `xl_5_${randomUUID()}`,
        projectId: projA,
        userId: user3,
        amount: 300,
        reason: 'Today award',
        createdAt: today,
      },
    ]);
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('1. All-time ranking: orders by total_xp DESC with deterministic user_id ASC tie breaking', async () => {
    const res = await getLeaderboard(projA, { period: 'all_time', now: mockNow });

    expect(res.total).toBe(4);
    expect(res.entries.length).toBe(4);

    // User 1 has 500 XP -> Rank 1
    expect(res.entries[0].userId).toBe(user1);
    expect(res.entries[0].rank).toBe(1);
    expect(res.entries[0].xp).toBe(500);
    expect(res.entries[0].level).toBe(3); // Master

    // Tied 300 XP: user2 < user3 alphabetically -> user2 rank 2, user3 rank 3
    expect(res.entries[1].userId).toBe(user2);
    expect(res.entries[1].rank).toBe(2);
    expect(res.entries[1].xp).toBe(300);

    expect(res.entries[2].userId).toBe(user3);
    expect(res.entries[2].rank).toBe(3);
    expect(res.entries[2].xp).toBe(300);

    // User 4 has 0 XP -> Rank 4
    expect(res.entries[3].userId).toBe(user4);
    expect(res.entries[3].rank).toBe(4);
    expect(res.entries[3].xp).toBe(0);
    expect(res.entries[3].level).toBe(1); // Rookie
  });

  it('2. Daily ranking: includes negative XP, half-open UTC boundaries, excludes old XP', async () => {
    const res = await getLeaderboard(projA, { period: 'daily', now: mockNow });

    expect(res.total).toBe(4);

    // User 1 today: +400 XP -> Rank 1 today
    expect(res.entries[0].userId).toBe(user1);
    expect(res.entries[0].rank).toBe(1);
    expect(res.entries[0].xp).toBe(400);

    // User 2 today: +400 - 100 = 300 XP. User 3 today: +300 XP.
    // Tied 300 XP today: user2 < user3 -> user2 rank 2, user3 rank 3
    expect(res.entries[1].userId).toBe(user2);
    expect(res.entries[1].rank).toBe(2);
    expect(res.entries[1].xp).toBe(300);

    expect(res.entries[2].userId).toBe(user3);
    expect(res.entries[2].rank).toBe(3);
    expect(res.entries[2].xp).toBe(300);

    // User 4: 0 XP today -> Rank 4
    expect(res.entries[3].userId).toBe(user4);
    expect(res.entries[3].rank).toBe(4);
    expect(res.entries[3].xp).toBe(0);
  });

  it('3. Search by external_id / name: DOES NOT renumber global ranks (Dave rank 4 remains rank 4)', async () => {
    const res = await getLeaderboard(projA, { period: 'all_time', search: 'Dave', now: mockNow });

    expect(res.total).toBe(1);
    expect(res.entries.length).toBe(1);
    expect(res.entries[0].userId).toBe(user4);
    expect(res.entries[0].externalId).toBe('ext_dave');
    // Global rank must be preserved as 4, NOT renumbered to 1!
    expect(res.entries[0].rank).toBe(4);
  });

  it('4. Tenant isolation: Project A query does NOT expose Project B user Eve', async () => {
    const resA = await getLeaderboard(projA, { period: 'all_time', now: mockNow });
    const userIdsA = resA.entries.map((e) => e.userId);

    expect(userIdsA).not.toContain(userProjB);

    const resB = await getLeaderboard(projB, { period: 'all_time', now: mockNow });
    expect(resB.total).toBe(1);
    expect(resB.entries[0].userId).toBe(userProjB);
    expect(resB.entries[0].xp).toBe(999);
  });

  it('5. User rank lookup (getUserRank)', async () => {
    const rank2 = await getUserRank(projA, user2, { period: 'all_time', now: mockNow });
    expect(rank2.rank).toBe(2);
    expect(rank2.totalUsers).toBe(4);
    expect(rank2.entry?.userId).toBe(user2);

    const rank4 = await getUserRank(projA, 'ext_dave', { period: 'all_time', now: mockNow });
    expect(rank4.rank).toBe(4);
    expect(rank4.entry?.userId).toBe(user4);
  });
});
