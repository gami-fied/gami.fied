import crypto from 'crypto';
import { db, xpBoosts, xpLimitHits, xpLimits } from '@gami/database';
import {
  applyLimits,
  boostedAmount,
  limitPeriodStart,
  strongestBoost,
  type BoostSettings,
  type LimitSettings,
  type LimitUsage,
} from '@gami/progression';
import { and, eq, sql } from 'drizzle-orm';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface XpPolicyInput {
  projectId: string;
  userId: string;
  eventType: string;
  ruleId: string;
  eventId: string;
  amount: number;
  occurredAt: Date;
}

export interface XpPolicyResult {
  /** What to give after boosts and limits. 0 means nothing. */
  amount: number;
  /** What it would have been with only the boost. */
  wanted: number;
  boost: { id: string; name: string; multiplier: number } | null;
  /** Limits that held XP back, to record once the award is made. */
  hits: { limitId: string; limitName: string; given: number }[];
}

const asList = <T>(value: unknown): T[] | null => (Array.isArray(value) && value.length > 0 ? (value as T[]) : null);

/**
 * Works out what a rule's XP is worth: first any promotion's multiplier, using the time of the
 * event so a replay agrees with the original, then the project's limits, using the time of
 * processing. A lock on the user keeps two events at once from both slipping under a cap.
 */
export async function applyXpPolicy(tx: Tx, input: XpPolicyInput): Promise<XpPolicyResult> {
  const { projectId, userId, eventType, ruleId } = input;

  const [boostRows, limitRows] = await Promise.all([
    tx.select().from(xpBoosts).where(and(eq(xpBoosts.projectId, projectId), eq(xpBoosts.enabled, true))),
    tx.select().from(xpLimits).where(and(eq(xpLimits.projectId, projectId), eq(xpLimits.enabled, true))),
  ]);

  const boosts: BoostSettings[] = boostRows.map((row) => ({
    id: row.id,
    name: row.name,
    multiplier: row.multiplier,
    enabled: row.enabled,
    startAt: row.startAt,
    endAt: row.endAt,
    daysOfWeek: asList<number>(row.daysOfWeek),
    fromHour: row.fromHour,
    toHour: row.toHour,
    timeZone: row.timeZone,
    eventTypes: asList<string>(row.eventTypes),
  }));
  const boost = strongestBoost(boosts, input.occurredAt, eventType);
  const wanted = boost ? boostedAmount(input.amount, boost.multiplier) : input.amount;

  const applicable = limitRows.filter(
    (limit) => (!limit.ruleId || limit.ruleId === ruleId) && (!limit.eventType || limit.eventType === eventType)
  );
  if (applicable.length === 0) {
    return { amount: wanted, wanted, boost: boost && { id: boost.id, name: boost.name, multiplier: boost.multiplier }, hits: [] };
  }

  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`xp:${projectId}:${userId}`}))`);

  const now = new Date();
  const checks: { limit: LimitSettings; usage: LimitUsage }[] = [];
  for (const row of applicable) {
    const limit: LimitSettings = {
      id: row.id,
      name: row.name,
      kind: row.kind as LimitSettings['kind'],
      period: row.period as LimitSettings['period'],
      amount: row.amount,
    };
    const since = limit.period ? limitPeriodStart(limit.period, now) : new Date(0);
    const scope = [
      row.ruleId ? sql`AND l.rule_id = ${row.ruleId}` : sql``,
      row.eventType ? sql`AND EXISTS (SELECT 1 FROM rules r WHERE r.id = l.rule_id AND r.trigger = ${row.eventType})` : sql``,
    ];
    const rows = (await tx.execute(sql`
      SELECT COALESCE(SUM(l.amount), 0)::int AS xp, COUNT(*)::int AS awards, MAX(l.created_at) AS "lastAt"
      FROM xp_ledger l
      WHERE l.project_id = ${projectId} AND l.user_id = ${userId}
        AND l.rule_id IS NOT NULL AND l.amount > 0
        AND l.created_at >= ${since.toISOString()}::timestamptz
        ${scope[0]} ${scope[1]}
    `)) as unknown as { xp: number; awards: number; lastAt: string | Date | null }[];
    const found = rows[0];
    checks.push({
      limit,
      usage: { xp: found?.xp ?? 0, awards: found?.awards ?? 0, lastAwardAt: found?.lastAt ? new Date(found.lastAt) : null },
    });
  }

  const outcome = applyLimits(wanted, checks, now);
  return {
    amount: outcome.allowed,
    wanted,
    boost: boost && { id: boost.id, name: boost.name, multiplier: boost.multiplier },
    hits: outcome.hits.map((hit) => ({ limitId: hit.limit.id, limitName: hit.limit.name, given: hit.allowed })),
  };
}

/** Records the limits that held XP back, for the dashboard. */
export async function recordLimitHits(tx: Tx, input: XpPolicyInput, wanted: number, hits: XpPolicyResult['hits']): Promise<void> {
  for (const hit of hits) {
    await tx.insert(xpLimitHits).values({
      id: `xlh_${crypto.randomUUID()}`,
      projectId: input.projectId,
      userId: input.userId,
      limitId: hit.limitId,
      limitName: hit.limitName,
      ruleId: input.ruleId,
      eventId: input.eventId,
      wanted,
      given: hit.given,
    });
  }
}
