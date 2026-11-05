import {
  achievements,
  db,
  levels,
  ruleExecutions,
  rules,
  userAchievements,
  userXpBalances,
  xpLedger,
} from '@gami/database';
import { calculateLevel } from '@gami/progression';
import { and, count, eq, inArray } from 'drizzle-orm';

const POLL_INTERVAL_MS = 200;
export const MAX_REWARD_WAIT_MS = 5000;

export interface EventRewards {
  evaluated: boolean;
  xpAwarded: number;
  achievements: string[];
  totalXp: number | null;
  level: number | null;
}

interface EventIdentity {
  id: string;
  projectId: string;
  type: string;
  userId: string | null;
}

async function rulesFinished({ id, projectId, type }: EventIdentity): Promise<boolean> {
  const [[expected], [finished]] = await Promise.all([
    db
      .select({ total: count() })
      .from(rules)
      .where(and(eq(rules.projectId, projectId), eq(rules.enabled, true), eq(rules.trigger, type))),
    db
      .select({ total: count() })
      .from(ruleExecutions)
      .where(
        and(
          eq(ruleExecutions.eventId, id),
          inArray(ruleExecutions.status, ['completed', 'skipped', 'failed'])
        )
      ),
  ]);
  return (finished?.total ?? 0) >= (expected?.total ?? 0);
}

/**
 * Waits for the worker to finish an event's rules and reports what they awarded. The worker does
 * the work either way, so a timeout only means the rewards arrive later.
 */
export async function waitForEventRewards(
  event: EventIdentity,
  timeoutMs = MAX_REWARD_WAIT_MS
): Promise<EventRewards> {
  const deadline = Date.now() + timeoutMs;
  let evaluated = await rulesFinished(event);
  while (!evaluated && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    evaluated = await rulesFinished(event);
  }

  const [ledger, badges, [balance], projectLevels] = await Promise.all([
    db.select({ amount: xpLedger.amount }).from(xpLedger).where(eq(xpLedger.eventId, event.id)),
    db
      .select({ key: achievements.key })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(eq(userAchievements.eventId, event.id)),
    event.userId
      ? db
          .select({ totalXp: userXpBalances.totalXp })
          .from(userXpBalances)
          .where(eq(userXpBalances.userId, event.userId))
      : Promise.resolve([]),
    db
      .select()
      .from(levels)
      .where(and(eq(levels.projectId, event.projectId), eq(levels.enabled, true))),
  ]);

  const totalXp = event.userId ? (balance?.totalXp ?? 0) : null;
  return {
    evaluated,
    xpAwarded: ledger.reduce((sum, row) => sum + row.amount, 0),
    achievements: badges.map((badge) => badge.key),
    totalXp,
    level:
      totalXp !== null && projectLevels.length > 0
        ? calculateLevel(totalXp, projectLevels).level
        : null,
  };
}
