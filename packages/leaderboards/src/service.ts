import { db, endUsers, levels, userXpBalances, xpLedger } from '@gami/database';
import { calculateLevel } from '@gami/progression';
import { and, eq, sql } from 'drizzle-orm';
import { groupValueOf } from './segments.js';
import {
  GroupLeaderboardOptions,
  GroupLeaderboardResponse,
  LeaderboardEntry,
  LeaderboardOptions,
  LeaderboardPeriod,
  LeaderboardResponse,
  UserRankResult,
} from './types.js';

interface RawRow {
  rank: number;
  userId: string;
  externalId: string;
  name: string | null;
  avatarUrl: string | null;
  xp: number;
  totalXp: number;
  totalCount?: number;
  totalUsers?: number;
  [key: string]: unknown;
}

function rowsOf(res: unknown): RawRow[] {
  return (Array.isArray(res) ? res : (res as { rows?: RawRow[] }).rows || []) as RawRow[];
}

/**
 * All-time ranking reads the balance index directly, so a page costs the same however many users
 * a project has. Deactivated users are rare, so they are subtracted from counts instead of every
 * row being joined and ranked.
 */
async function countRankedUsers(projectId: string): Promise<number> {
  const rows = rowsOf(
    await db.execute<RawRow>(sql`
      SELECT (
        (SELECT COUNT(*) FROM ${userXpBalances} WHERE project_id = ${projectId} AND total_xp > 0)
        - (SELECT COUNT(*) FROM ${endUsers} eu
             JOIN ${userXpBalances} b ON b.project_id = eu.project_id AND b.user_id = eu.id
            WHERE eu.project_id = ${projectId} AND (eu.active = false OR eu.ranking_hidden = true) AND b.total_xp > 0)
      )::int AS "total"
    `)
  );
  return Number((rows[0] as { total?: number } | undefined)?.total ?? 0);
}

async function allTimePage(projectId: string, limit: number, offset: number): Promise<RawRow[]> {
  const rows = rowsOf(
    await db.execute<RawRow>(sql`
      SELECT
        b.user_id AS "userId",
        eu.external_id AS "externalId",
        eu.name AS "name",
        eu.avatar_url AS "avatarUrl",
        b.total_xp::bigint AS "xp",
        b.total_xp::bigint AS "totalXp"
      FROM ${userXpBalances} b
      JOIN ${endUsers} eu ON eu.project_id = b.project_id AND eu.id = b.user_id
      WHERE b.project_id = ${projectId} AND eu.active = true AND eu.ranking_hidden = false AND b.total_xp > 0
      ORDER BY b.total_xp DESC, b.user_id ASC
      LIMIT ${limit} OFFSET ${offset}
    `)
  );
  // Rank follows from the position, because inactive users never reach this list.
  return rows.map((row, index) => ({ ...row, rank: offset + index + 1 }));
}

async function allTimeUser(projectId: string, userId: string): Promise<RawRow | null> {
  const [me] = rowsOf(
    await db.execute<RawRow>(sql`
      SELECT
        eu.id AS "userId",
        eu.external_id AS "externalId",
        eu.name AS "name",
        eu.avatar_url AS "avatarUrl",
        b.total_xp::bigint AS "xp",
        b.total_xp::bigint AS "totalXp"
      FROM ${endUsers} eu
      JOIN ${userXpBalances} b ON b.project_id = eu.project_id AND b.user_id = eu.id
      WHERE eu.project_id = ${projectId} AND eu.active = true AND eu.ranking_hidden = false AND b.total_xp > 0
        AND (eu.id = ${userId} OR eu.external_id = ${userId})
      LIMIT 1
    `)
  );
  if (!me) return null;

  const [counts] = rowsOf(
    await db.execute<RawRow>(sql`
      SELECT (
        (SELECT COUNT(*) FROM ${userXpBalances}
          WHERE project_id = ${projectId} AND total_xp > 0
            AND (total_xp > ${me.totalXp} OR (total_xp = ${me.totalXp} AND user_id < ${me.userId})))
        - (SELECT COUNT(*) FROM ${endUsers} eu
             JOIN ${userXpBalances} b ON b.project_id = eu.project_id AND b.user_id = eu.id
            WHERE eu.project_id = ${projectId} AND (eu.active = false OR eu.ranking_hidden = true) AND b.total_xp > 0
              AND (b.total_xp > ${me.totalXp} OR (b.total_xp = ${me.totalXp} AND b.user_id < ${me.userId})))
      )::int AS "ahead"
    `)
  );
  const ahead = Number((counts as { ahead?: number } | undefined)?.ahead ?? 0);
  return { ...me, rank: ahead + 1 };
}

export function getUtcPeriodBoundaries(
  period: LeaderboardPeriod,
  now: Date = new Date()
): { periodStart: Date; nextPeriodStart: Date } {
  const d = new Date(now.getTime());

  if (period === 'daily') {
    const periodStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    const nextPeriodStart = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
    );
    return { periodStart, nextPeriodStart };
  }

  if (period === 'weekly') {
    const day = d.getUTCDay();
    // UTC Monday as start of week (0 = Sun, 1 = Mon...)
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const periodStart = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diffToMonday)
    );
    const nextPeriodStart = new Date(
      Date.UTC(
        periodStart.getUTCFullYear(),
        periodStart.getUTCMonth(),
        periodStart.getUTCDate() + 7
      )
    );
    return { periodStart, nextPeriodStart };
  }

  if (period === 'monthly') {
    const periodStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
    const nextPeriodStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
    return { periodStart, nextPeriodStart };
  }

  return { periodStart: new Date(0), nextPeriodStart: new Date(8640000000000000) };
}

export async function getLeaderboard(
  projectId: string,
  options: LeaderboardOptions = {}
): Promise<LeaderboardResponse> {
  const period = options.period || 'all_time';
  const page = Math.max(1, options.page || 1);
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const offset = (page - 1) * limit;
  const search = options.search?.trim();
  const now = options.now || new Date();
  const extra = options.filter ? sql`AND ${options.filter}` : sql``;

  let rawEntries: RawRow[];
  let fastTotal: number | null = null;

  if (period === 'all_time' && !search && !options.filter) {
    [rawEntries, fastTotal] = await Promise.all([
      allTimePage(projectId, limit, offset),
      countRankedUsers(projectId),
    ]);
  } else if (period === 'all_time') {
    const query = sql`
      WITH global_ranks AS (
        SELECT 
          eu.id AS "userId",
          eu.external_id AS "externalId",
          eu.name AS "name",
          eu.avatar_url AS "avatarUrl",
          COALESCE(uxb.total_xp, 0)::bigint AS "xp",
          COALESCE(uxb.total_xp, 0)::bigint AS "totalXp",
          ROW_NUMBER() OVER (ORDER BY COALESCE(uxb.total_xp, 0) DESC, eu.id ASC)::int AS "rank"
        FROM ${endUsers} eu
        LEFT JOIN ${userXpBalances} uxb ON eu.id = uxb.user_id AND uxb.project_id = ${projectId}
        WHERE eu.project_id = ${projectId}
          AND eu.active = true AND eu.ranking_hidden = false
          AND COALESCE(uxb.total_xp, 0) > 0
          ${extra}
      )
      SELECT 
        "userId", "externalId", "name", "avatarUrl", "xp", "totalXp", "rank",
        COUNT(*) OVER()::int AS "totalCount"
      FROM global_ranks
      ${
        search
          ? sql`WHERE ("externalId" ILIKE ${`%${search}%`} OR "name" ILIKE ${`%${search}%`})`
          : sql``
      }
      ORDER BY "rank" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const res = await db.execute<RawRow>(query);
    rawEntries = (
      Array.isArray(res) ? res : (res as unknown as { rows: RawRow[] }).rows || []
    ) as RawRow[];
  } else {
    const { periodStart, nextPeriodStart } = getUtcPeriodBoundaries(period, now);
    const startStr = periodStart.toISOString();
    const endStr = nextPeriodStart.toISOString();

    const query = sql`
      WITH user_period_xp AS (
        SELECT 
          eu.id AS "userId",
          eu.external_id AS "externalId",
          eu.name AS "name",
          eu.avatar_url AS "avatarUrl",
          COALESCE(SUM(xl.amount), 0)::bigint AS "xp",
          COALESCE(uxb.total_xp, 0)::bigint AS "totalXp"
        FROM ${endUsers} eu
        LEFT JOIN ${xpLedger} xl ON eu.id = xl.user_id 
          AND xl.project_id = ${projectId}
          AND xl.created_at >= ${startStr}::timestamptz 
          AND xl.created_at < ${endStr}::timestamptz
        LEFT JOIN ${userXpBalances} uxb ON eu.id = uxb.user_id AND uxb.project_id = ${projectId}
        WHERE eu.project_id = ${projectId}
          AND eu.active = true AND eu.ranking_hidden = false
          ${extra}
        GROUP BY eu.id, eu.external_id, eu.name, eu.avatar_url, uxb.total_xp
        HAVING COALESCE(SUM(xl.amount), 0) > 0
      ),
      global_ranks AS (
        SELECT
          "userId", "externalId", "name", "avatarUrl", "xp", "totalXp",
          ROW_NUMBER() OVER (ORDER BY "xp" DESC, "userId" ASC)::int AS "rank"
        FROM user_period_xp
      )
      SELECT 
        "userId", "externalId", "name", "avatarUrl", "xp", "totalXp", "rank",
        COUNT(*) OVER()::int AS "totalCount"
      FROM global_ranks
      ${
        search
          ? sql`WHERE ("externalId" ILIKE ${`%${search}%`} OR "name" ILIKE ${`%${search}%`})`
          : sql``
      }
      ORDER BY "rank" ASC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const res = await db.execute<RawRow>(query);
    rawEntries = (
      Array.isArray(res) ? res : (res as unknown as { rows: RawRow[] }).rows || []
    ) as RawRow[];
  }

  const firstRow = rawEntries[0];
  const total =
    fastTotal ?? (firstRow && firstRow.totalCount !== undefined ? Number(firstRow.totalCount) : 0);

  // Page-scoped Level Calculation using @gami/progression
  const projectLevels = await db
    .select()
    .from(levels)
    .where(and(eq(levels.projectId, projectId), eq(levels.enabled, true)))
    .orderBy(levels.level);

  const formattedEntries: LeaderboardEntry[] = rawEntries.map((row) => {
    const entry: LeaderboardEntry = {
      rank: Number(row.rank),
      userId: String(row.userId),
      externalId: String(row.externalId),
      name: row.name ? String(row.name) : null,
      avatarUrl: row.avatarUrl ? String(row.avatarUrl) : null,
      xp: Number(row.xp),
    };

    if (projectLevels.length > 0) {
      const lvlResult = calculateLevel(Number(row.totalXp), projectLevels);
      entry.level = lvlResult.level;
      entry.levelName = lvlResult.name || `Level ${lvlResult.level}`;
    }

    return entry;
  });

  return {
    period,
    page,
    limit,
    total,
    entries: formattedEntries,
  };
}

export async function getUserRank(
  projectId: string,
  userId: string,
  options: LeaderboardOptions = {}
): Promise<UserRankResult> {
  const period = options.period || 'all_time';
  const now = options.now || new Date();

  let rawRow: RawRow | null = null;
  const extra = options.filter ? sql`AND ${options.filter}` : sql``;

  if (period === 'all_time' && !options.filter) {
    const [found, totalUsers] = await Promise.all([
      allTimeUser(projectId, userId),
      countRankedUsers(projectId),
    ]);
    if (found) rawRow = { ...found, totalUsers };
  } else {
    const { periodStart, nextPeriodStart } = getUtcPeriodBoundaries(period, now);
    const startStr = periodStart.toISOString();
    const endStr = nextPeriodStart.toISOString();
    // All time with a filter reads the balance; a period sums the ledger.
    const xpExpr = period === 'all_time' ? sql`COALESCE(uxb.total_xp, 0)` : sql`COALESCE(SUM(xl.amount), 0)`;

    const query = sql`
      WITH user_period_xp AS (
        SELECT
          eu.id AS "userId",
          eu.external_id AS "externalId",
          eu.name AS "name",
          eu.avatar_url AS "avatarUrl",
          ${xpExpr}::bigint AS "xp",
          COALESCE(uxb.total_xp, 0)::bigint AS "totalXp"
        FROM ${endUsers} eu
        ${
          // All time reads the balance, so the ledger is not joined (its end date is out of range for Postgres).
          period === 'all_time'
            ? sql``
            : sql`LEFT JOIN ${xpLedger} xl ON eu.id = xl.user_id
          AND xl.project_id = ${projectId}
          AND xl.created_at >= ${startStr}::timestamptz
          AND xl.created_at < ${endStr}::timestamptz`
        }
        LEFT JOIN ${userXpBalances} uxb ON eu.id = uxb.user_id AND uxb.project_id = ${projectId}
        WHERE eu.project_id = ${projectId}
          AND eu.active = true AND eu.ranking_hidden = false
          ${extra}
        GROUP BY eu.id, eu.external_id, eu.name, eu.avatar_url, uxb.total_xp
        HAVING ${xpExpr} > 0
      ),
      global_ranks AS (
        SELECT
          "userId", "externalId", "name", "avatarUrl", "xp", "totalXp",
          ROW_NUMBER() OVER (ORDER BY "xp" DESC, "userId" ASC)::int AS "rank",
          COUNT(*) OVER()::int AS "totalUsers"
        FROM user_period_xp
      )
      SELECT * FROM global_ranks WHERE "userId" = ${userId} OR "externalId" = ${userId}
    `;

    const res = await db.execute<RawRow>(query);
    const rows = (
      Array.isArray(res) ? res : (res as unknown as { rows: RawRow[] }).rows || []
    ) as RawRow[];
    if (rows.length > 0) rawRow = rows[0] || null;
  }

  if (!rawRow) {
    return {
      period,
      rank: null,
      totalUsers: 0,
      entry: null,
    };
  }

  const projectLevels = await db
    .select()
    .from(levels)
    .where(and(eq(levels.projectId, projectId), eq(levels.enabled, true)))
    .orderBy(levels.level);

  const entry: LeaderboardEntry = {
    rank: Number(rawRow.rank),
    userId: String(rawRow.userId),
    externalId: String(rawRow.externalId),
    name: rawRow.name ? String(rawRow.name) : null,
    avatarUrl: rawRow.avatarUrl ? String(rawRow.avatarUrl) : null,
    xp: Number(rawRow.xp),
  };

  if (projectLevels.length > 0) {
    const lvlResult = calculateLevel(Number(rawRow.totalXp), projectLevels);
    entry.level = lvlResult.level;
    entry.levelName = lvlResult.name || `Level ${lvlResult.level}`;
  }

  return {
    period,
    rank: Number(rawRow.rank),
    totalUsers: rawRow.totalUsers ? Number(rawRow.totalUsers) : 0,
    entry,
  };
}

/**
 * Teams, countries or any other attribute ranked against each other. Each person's XP counts toward
 * the group named by their own value of `groupBy`. People without a value are left out.
 */
export async function getGroupLeaderboard(projectId: string, options: GroupLeaderboardOptions): Promise<GroupLeaderboardResponse> {
  const period = options.period || 'all_time';
  const score = options.score === 'average' ? 'average' : 'total';
  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const group = groupValueOf(options.groupBy);
  const extra = options.filter ? sql`AND ${options.filter}` : sql``;
  const { periodStart, nextPeriodStart } = getUtcPeriodBoundaries(period, options.now || new Date());

  const personXp =
    period === 'all_time'
      ? sql`COALESCE((SELECT b.total_xp FROM ${userXpBalances} b WHERE b.project_id = eu.project_id AND b.user_id = eu.id), 0)`
      : sql`COALESCE((SELECT SUM(xl.amount) FROM ${xpLedger} xl WHERE xl.project_id = eu.project_id AND xl.user_id = eu.id
          AND xl.created_at >= ${periodStart.toISOString()}::timestamptz AND xl.created_at < ${nextPeriodStart.toISOString()}::timestamptz), 0)`;

  const rows = rowsOf(
    await db.execute<RawRow>(sql`
      WITH people AS (
        SELECT ${group} AS "group", ${personXp}::bigint AS "xp"
        FROM ${endUsers} eu
        WHERE eu.project_id = ${projectId} AND eu.active = true AND eu.ranking_hidden = false
          AND ${group} IS NOT NULL AND ${group} <> ''
          ${extra}
      ),
      groups AS (
        SELECT "group", COUNT(*)::int AS "members",
          ${score === 'average' ? sql`ROUND(AVG("xp"))` : sql`SUM("xp")`}::bigint AS "xp"
        FROM people GROUP BY "group"
      )
      SELECT "group", "members", "xp",
        ROW_NUMBER() OVER (ORDER BY "xp" DESC, "group" ASC)::int AS "rank",
        COUNT(*) OVER()::int AS "totalCount"
      FROM groups
      ORDER BY "rank" ASC
      LIMIT ${limit}
    `)
  );

  return {
    period,
    groupBy: options.groupBy,
    score,
    total: rows[0]?.totalCount !== undefined ? Number(rows[0].totalCount) : 0,
    entries: rows.map((row) => ({ rank: Number(row.rank), group: String(row['group']), xp: Number(row.xp), members: Number(row['members']) })),
  };
}
