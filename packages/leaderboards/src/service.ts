import { db, endUsers, levels, userXpBalances, xpLedger } from '@gami/database';
import { calculateLevel } from '@gami/progression';
import { and, eq, sql } from 'drizzle-orm';
import {
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

  let rawEntries: RawRow[] = [];

  if (period === 'all_time') {
    const query = sql`
      WITH global_ranks AS (
        SELECT 
          eu.id AS "userId",
          eu.external_id AS "externalId",
          eu.name AS "name",
          eu.avatar_url AS "avatarUrl",
          COALESCE(uxb.total_xp, 0)::int AS "xp",
          COALESCE(uxb.total_xp, 0)::int AS "totalXp",
          ROW_NUMBER() OVER (ORDER BY COALESCE(uxb.total_xp, 0) DESC, eu.id ASC)::int AS "rank"
        FROM ${endUsers} eu
        LEFT JOIN ${userXpBalances} uxb ON eu.id = uxb.user_id AND uxb.project_id = ${projectId}
        WHERE eu.project_id = ${projectId}
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
          COALESCE(SUM(xl.amount), 0)::int AS "xp",
          COALESCE(uxb.total_xp, 0)::int AS "totalXp"
        FROM ${endUsers} eu
        LEFT JOIN ${xpLedger} xl ON eu.id = xl.user_id 
          AND xl.project_id = ${projectId}
          AND xl.created_at >= ${startStr}::timestamptz 
          AND xl.created_at < ${endStr}::timestamptz
        LEFT JOIN ${userXpBalances} uxb ON eu.id = uxb.user_id AND uxb.project_id = ${projectId}
        WHERE eu.project_id = ${projectId}
        GROUP BY eu.id, eu.external_id, eu.name, eu.avatar_url, uxb.total_xp
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
  const total = firstRow && firstRow.totalCount !== undefined ? Number(firstRow.totalCount) : 0;

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

  if (period === 'all_time') {
    const query = sql`
      WITH global_ranks AS (
        SELECT 
          eu.id AS "userId",
          eu.external_id AS "externalId",
          eu.name AS "name",
          eu.avatar_url AS "avatarUrl",
          COALESCE(uxb.total_xp, 0)::int AS "xp",
          COALESCE(uxb.total_xp, 0)::int AS "totalXp",
          ROW_NUMBER() OVER (ORDER BY COALESCE(uxb.total_xp, 0) DESC, eu.id ASC)::int AS "rank",
          COUNT(*) OVER()::int AS "totalUsers"
        FROM ${endUsers} eu
        LEFT JOIN ${userXpBalances} uxb ON eu.id = uxb.user_id AND uxb.project_id = ${projectId}
        WHERE eu.project_id = ${projectId}
      )
      SELECT * FROM global_ranks WHERE "userId" = ${userId} OR "externalId" = ${userId}
    `;

    const res = await db.execute<RawRow>(query);
    const rows = (
      Array.isArray(res) ? res : (res as unknown as { rows: RawRow[] }).rows || []
    ) as RawRow[];
    if (rows.length > 0) rawRow = rows[0] || null;
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
          COALESCE(SUM(xl.amount), 0)::int AS "xp",
          COALESCE(uxb.total_xp, 0)::int AS "totalXp"
        FROM ${endUsers} eu
        LEFT JOIN ${xpLedger} xl ON eu.id = xl.user_id 
          AND xl.project_id = ${projectId}
          AND xl.created_at >= ${startStr}::timestamptz 
          AND xl.created_at < ${endStr}::timestamptz
        LEFT JOIN ${userXpBalances} uxb ON eu.id = uxb.user_id AND uxb.project_id = ${projectId}
        WHERE eu.project_id = ${projectId}
        GROUP BY eu.id, eu.external_id, eu.name, eu.avatar_url, uxb.total_xp
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

export async function getLeaderboardAroundUser(
  projectId: string,
  userId: string,
  options: LeaderboardOptions = {}
): Promise<LeaderboardResponse> {
  const userRankInfo = await getUserRank(projectId, userId, options);
  if (!userRankInfo.rank) {
    return getLeaderboard(projectId, options);
  }

  const limit = Math.min(100, Math.max(1, options.limit || 20));
  const userRank = userRankInfo.rank;
  const startRank = Math.max(1, userRank - Math.floor(limit / 2));

  const page = Math.floor((startRank - 1) / limit) + 1;
  return getLeaderboard(projectId, { ...options, page, limit });
}
