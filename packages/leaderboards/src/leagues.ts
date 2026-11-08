import crypto from 'crypto';
import { db, endUsers, leagueMembers, leagues, leagueSeasons, xpLedger, type League, type LeagueSeason } from '@gami/database';
import { and, desc, eq, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { getUtcPeriodBoundaries } from './service.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Exec = typeof db | Tx;

export type LeagueZone = 'promotion' | 'relegation' | 'safe';

export interface LeagueStanding {
  rank: number;
  userId: string;
  externalId: string;
  name: string | null;
  avatarUrl: string | null;
  xp: number;
  zone: LeagueZone;
}

function rowsOf<T>(res: unknown): T[] {
  return (Array.isArray(res) ? res : ((res as { rows?: T[] }).rows ?? [])) as T[];
}

/** The season that contains `now`: today in UTC for a daily league, Monday to Monday for a weekly one. */
export function seasonWindow(cadence: 'daily' | 'weekly', now: Date = new Date()) {
  const { periodStart, nextPeriodStart } = getUtcPeriodBoundaries(cadence, now);
  return { startsAt: periodStart, endsAt: nextPeriodStart };
}

/** How many move up and down in a group of `size`, so the two zones never overlap. */
export function zoneSizes(league: Pick<League, 'promote' | 'relegate'>, size: number, tier: number, tierCount: number) {
  const up = tier < tierCount - 1 ? Math.min(league.promote, Math.floor(size / 2)) : 0;
  const down = tier > 0 ? Math.min(league.relegate, Math.max(0, size - up - 1)) : 0;
  return { up, down };
}

export async function ensureSeason(league: League, now: Date = new Date(), exec: Exec = db): Promise<LeagueSeason> {
  const { startsAt, endsAt } = seasonWindow(league.cadence, now);
  await exec
    .insert(leagueSeasons)
    .values({ id: `lsn_${crypto.randomUUID()}`, leagueId: league.id, projectId: league.projectId, startsAt, endsAt })
    .onConflictDoNothing();
  const [season] = await exec.select().from(leagueSeasons).where(and(eq(leagueSeasons.leagueId, league.id), eq(leagueSeasons.startsAt, startsAt)));
  return season!;
}

/** The tier a player starts this season in: where their last finished season sent them, or the bottom. */
async function startingTier(exec: Exec, league: League, userId: string): Promise<number> {
  const [last] = await exec
    .select({ tier: leagueMembers.tier, outcome: leagueMembers.outcome })
    .from(leagueMembers)
    .innerJoin(leagueSeasons, eq(leagueSeasons.id, leagueMembers.seasonId))
    .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, userId), isNotNull(leagueSeasons.closedAt)))
    .orderBy(desc(leagueSeasons.startsAt))
    .limit(1);
  if (!last) return 0;
  const moved = last.tier + (last.outcome === 'promoted' ? 1 : last.outcome === 'relegated' ? -1 : 0);
  return Math.min(Math.max(moved, 0), league.tiers.length - 1);
}

/**
 * Puts a player into a group in their tier for the current season, filling groups in order. Does
 * nothing if they already have a place. Groups are filled one at a time under a lock, so two
 * players joining at once never overfill a group.
 */
export async function placeInLeague(league: League, userId: string, now: Date = new Date()) {
  return db.transaction(async (tx) => {
    const season = await ensureSeason(league, now, tx);
    const [existing] = await tx.select().from(leagueMembers).where(and(eq(leagueMembers.seasonId, season.id), eq(leagueMembers.userId, userId)));
    if (existing) return existing;

    const tier = await startingTier(tx, league, userId);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`league:${season.id}:${tier}`}))`);

    const [open] = rowsOf<{ groupNo: number }>(
      await tx.execute(sql`
        SELECT group_no AS "groupNo" FROM ${leagueMembers}
        WHERE season_id = ${season.id} AND tier = ${tier}
        GROUP BY group_no HAVING COUNT(*) < ${league.groupSize}
        ORDER BY group_no ASC LIMIT 1
      `)
    );
    let groupNo = open?.groupNo;
    if (groupNo === undefined) {
      const [top] = rowsOf<{ max: number | null }>(await tx.execute(sql`SELECT MAX(group_no) AS "max" FROM ${leagueMembers} WHERE season_id = ${season.id} AND tier = ${tier}`));
      groupNo = (top?.max ?? 0) + 1;
    }

    const [created] = await tx
      .insert(leagueMembers)
      .values({ id: `lmb_${crypto.randomUUID()}`, seasonId: season.id, leagueId: league.id, projectId: league.projectId, userId, tier, groupNo })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [winner] = await tx.select().from(leagueMembers).where(and(eq(leagueMembers.seasonId, season.id), eq(leagueMembers.userId, userId)));
    return winner!;
  });
}

/**
 * Called after an event: a player who has earned XP this season joins each enabled league.
 * Cheap when they are already in: one lookup per league.
 */
export async function joinLeaguesForUser(projectId: string, userId: string, now: Date = new Date()): Promise<number> {
  const list = await db.select().from(leagues).where(and(eq(leagues.projectId, projectId), eq(leagues.enabled, true)));
  let joined = 0;
  for (const league of list) {
    const { startsAt, endsAt } = seasonWindow(league.cadence, now);
    const [already] = rowsOf<{ one: number }>(
      await db.execute(sql`
        SELECT 1 AS "one" FROM ${leagueMembers} m JOIN ${leagueSeasons} s ON s.id = m.season_id
        WHERE m.league_id = ${league.id} AND m.user_id = ${userId} AND s.starts_at = ${startsAt.toISOString()}::timestamptz LIMIT 1
      `)
    );
    if (already) continue;
    const [earned] = rowsOf<{ xp: number }>(
      await db.execute(sql`
        SELECT COALESCE(SUM(amount), 0)::int AS "xp" FROM ${xpLedger}
        WHERE project_id = ${projectId} AND user_id = ${userId}
          AND created_at >= ${startsAt.toISOString()}::timestamptz AND created_at < ${endsAt.toISOString()}::timestamptz
      `)
    );
    if ((earned?.xp ?? 0) <= 0) continue;
    await placeInLeague(league, userId, now);
    joined += 1;
  }
  return joined;
}

/** A group's table for a season, best first, with who is moving up or down. */
export async function groupStandings(league: League, season: LeagueSeason, tier: number, groupNo: number): Promise<LeagueStanding[]> {
  const rows = rowsOf<Omit<LeagueStanding, 'zone' | 'rank'>>(
    await db.execute(sql`
      SELECT eu.id AS "userId", eu.external_id AS "externalId", eu.name AS "name", eu.avatar_url AS "avatarUrl",
        COALESCE((SELECT SUM(xl.amount) FROM ${xpLedger} xl
          WHERE xl.project_id = m.project_id AND xl.user_id = m.user_id
            AND xl.created_at >= ${season.startsAt.toISOString()}::timestamptz AND xl.created_at < ${season.endsAt.toISOString()}::timestamptz), 0)::int AS "xp"
      FROM ${leagueMembers} m
      JOIN ${endUsers} eu ON eu.id = m.user_id
      WHERE m.season_id = ${season.id} AND m.tier = ${tier} AND m.group_no = ${groupNo}
        AND eu.active = true AND eu.ranking_hidden = false
      ORDER BY "xp" DESC, m.created_at ASC, eu.id ASC
    `)
  );
  const { up, down } = zoneSizes(league, rows.length, tier, league.tiers.length);
  return rows.map((row, index) => ({
    ...row,
    xp: Number(row.xp),
    rank: index + 1,
    zone: index < up ? 'promotion' : index >= rows.length - down ? 'relegation' : 'safe',
  }));
}

/**
 * Ends a season: records each player's final place, and whether they move up, down or stay. Safe
 * to run twice, because a closed season is left alone. People hidden from rankings stay put.
 */
export async function closeSeason(league: League, season: LeagueSeason): Promise<{ promoted: number; relegated: number }> {
  if (season.closedAt) return { promoted: 0, relegated: 0 };
  const groups = await db
    .selectDistinct({ tier: leagueMembers.tier, groupNo: leagueMembers.groupNo })
    .from(leagueMembers)
    .where(eq(leagueMembers.seasonId, season.id));

  let promoted = 0;
  let relegated = 0;
  await db.transaction(async (tx) => {
    const [locked] = await tx.select().from(leagueSeasons).where(eq(leagueSeasons.id, season.id)).for('update');
    if (!locked || locked.closedAt) return;
    for (const group of groups) {
      const standings = await groupStandings(league, season, group.tier, group.groupNo);
      for (const row of standings) {
        // Nobody moves up for a week with no XP.
        const outcome = row.zone === 'promotion' && row.xp > 0 ? 'promoted' : row.zone === 'relegation' ? 'relegated' : 'stayed';
        if (outcome === 'promoted') promoted += 1;
        if (outcome === 'relegated') relegated += 1;
        await tx
          .update(leagueMembers)
          .set({ finalRank: row.rank, finalXp: row.xp, outcome })
          .where(and(eq(leagueMembers.seasonId, season.id), eq(leagueMembers.userId, row.userId)));
      }
    }
    await tx.update(leagueMembers).set({ outcome: 'stayed' }).where(and(eq(leagueMembers.seasonId, season.id), isNull(leagueMembers.outcome)));
    await tx.update(leagueSeasons).set({ closedAt: new Date() }).where(eq(leagueSeasons.id, season.id));
  });
  return { promoted, relegated };
}

/** Closes every season that has ended. The worker runs this on its regular pass. */
export async function closeEndedSeasons(now: Date = new Date()): Promise<number> {
  const due = await db
    .select({ season: leagueSeasons, league: leagues })
    .from(leagueSeasons)
    .innerJoin(leagues, eq(leagues.id, leagueSeasons.leagueId))
    .where(and(isNull(leagueSeasons.closedAt), lte(leagueSeasons.endsAt, now)));
  for (const { season, league } of due) await closeSeason(league, season);
  return due.length;
}

/** Where a player stands in a league this season, or null if they have not joined yet. */
export async function playerLeague(league: League, userId: string, now: Date = new Date()) {
  const { startsAt } = seasonWindow(league.cadence, now);
  const [row] = await db
    .select({ member: leagueMembers, season: leagueSeasons })
    .from(leagueMembers)
    .innerJoin(leagueSeasons, eq(leagueSeasons.id, leagueMembers.seasonId))
    .where(and(eq(leagueMembers.leagueId, league.id), eq(leagueMembers.userId, userId), eq(leagueSeasons.startsAt, startsAt)));
  if (!row) return null;
  const standings = await groupStandings(league, row.season, row.member.tier, row.member.groupNo);
  return {
    league: { key: league.key, name: league.name },
    tier: row.member.tier,
    tierName: league.tiers[row.member.tier] ?? `Tier ${row.member.tier + 1}`,
    groupNo: row.member.groupNo,
    seasonEndsAt: row.season.endsAt.toISOString(),
    standings,
  };
}
