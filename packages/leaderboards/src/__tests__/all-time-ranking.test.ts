import { randomUUID } from 'crypto';
import { db, endUsers, organizations, projects, userXpBalances } from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getLeaderboard, getUserRank } from '../service.js';

/**
 * The all-time board is read straight from the balance index and does not rank every user, so
 * this checks it against a ranking worked out here from the same data, including the awkward
 * cases: ties, users with no XP, and deactivated users, some of them at the very top.
 */
describe('all-time ranking', () => {
  const orgId = `org_rank_${randomUUID()}`;
  const projectId = `prj_rank_${randomUUID()}`;
  const emptyProjectId = `prj_rank_empty_${randomUUID()}`;
  const users = Array.from({ length: 60 }, (_, index) => ({
    id: `usr_${String(index).padStart(3, '0')}_${randomUUID()}`,
    externalId: `ext_${index}`,
    name: `Player ${index}`,
    // Plenty of ties, and some users with nothing.
    xp: index % 9 === 0 ? 0 : ((index * 37) % 11) * 50,
    // The first few users hold the highest XP, so deactivating them shifts every rank.
    active: ![3, 4, 17, 29, 41, 58].includes(index),
  }));

  const expected = users
    .filter((user) => user.active && user.xp > 0)
    .sort((a, b) => b.xp - a.xp || (a.id < b.id ? -1 : 1))
    .map((user, index) => ({ ...user, rank: index + 1 }));

  beforeAll(async () => {
    await db.insert(organizations).values({ id: orgId, name: 'Rank', slug: `rank-${randomUUID()}` });
    await db.insert(projects).values([
      { id: projectId, organizationId: orgId, name: 'Rank', slug: `rank-${randomUUID()}` },
      { id: emptyProjectId, organizationId: orgId, name: 'Empty', slug: `empty-${randomUUID()}` },
    ]);
    await db.insert(endUsers).values(
      users.map((user) => ({
        id: user.id,
        projectId,
        externalId: user.externalId,
        name: user.name,
        active: user.active,
      }))
    );
    await db.insert(userXpBalances).values(
      users.map((user) => ({
        id: `uxb_${randomUUID()}`,
        projectId,
        userId: user.id,
        totalXp: user.xp,
      }))
    );
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
  });

  it('has users that make the cases above real', () => {
    expect(expected.length).toBeGreaterThan(30);
    expect(new Set(expected.map((user) => user.xp)).size).toBeLessThan(expected.length);
    expect(users.some((user) => !user.active && user.xp > 0)).toBe(true);
  });

  it('returns every page in order, with ranks that follow the active users only', async () => {
    const seen: { userId: string; rank: number; xp: number }[] = [];

    for (let page = 1; page <= Math.ceil(expected.length / 7); page++) {
      const board = await getLeaderboard(projectId, { page, limit: 7 });
      expect(board.total).toBe(expected.length);
      seen.push(...board.entries);
    }

    expect(seen.map((entry) => entry.userId)).toEqual(expected.map((user) => user.id));
    expect(seen.map((entry) => entry.rank)).toEqual(expected.map((user) => user.rank));
    expect(seen.map((entry) => entry.xp)).toEqual(expected.map((user) => user.xp));
  });

  it('returns nothing past the last page, and still reports the real total', async () => {
    const board = await getLeaderboard(projectId, { page: 99, limit: 20 });
    expect(board.entries).toEqual([]);
    expect(board.total).toBe(expected.length);
  });

  it("gives every ranked user their position, matching the board's own ranks", async () => {
    const results = await Promise.all(expected.map((user) => getUserRank(projectId, user.id)));

    results.forEach((result, index) => {
      const user = expected[index]!;
      expect(result.rank, user.id).toBe(user.rank);
      expect(result.totalUsers).toBe(expected.length);
      expect(result.entry?.xp).toBe(user.xp);
    });
  }, 60_000);

  it('finds a user by their own ID as well', async () => {
    const user = expected[10]!;
    const result = await getUserRank(projectId, user.externalId);
    expect(result.rank).toBe(user.rank);
    expect(result.entry?.userId).toBe(user.id);
  });

  it('does not rank deactivated users or users with no XP', async () => {
    const unranked = users.filter((user) => !user.active || user.xp === 0);
    expect(unranked.length).toBeGreaterThan(5);

    const results = await Promise.all(unranked.map((user) => getUserRank(projectId, user.id)));

    results.forEach((result, index) => {
      expect(result.rank, unranked[index]!.id).toBeNull();
      expect(result.entry).toBeNull();
    });
  }, 60_000);

  it('keeps global ranks when searching, since search takes another path', async () => {
    const target = expected[20]!;
    const board = await getLeaderboard(projectId, { search: target.externalId });
    const found = board.entries.find((entry) => entry.userId === target.id);
    expect(found?.rank).toBe(target.rank);
  });

  it('handles a project with nobody ranked', async () => {
    const board = await getLeaderboard(emptyProjectId, {});
    expect(board).toMatchObject({ total: 0, entries: [] });
    expect((await getUserRank(emptyProjectId, 'nobody')).rank).toBeNull();
  });
});
