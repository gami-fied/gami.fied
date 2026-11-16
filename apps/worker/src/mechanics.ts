import { randomUUID } from 'crypto';
import { createLogger } from '@gami/config';
import {
  db,
  isFeatureEnabledForProject,
  leaderboardPayouts,
  leaderboardPrizes,
  sharedGoalContributions,
  sharedGoalEvents,
  sharedGoalProgress,
  sharedGoals,
  teamMembers,
  type LeaderboardPrize,
} from '@gami/database';
import { getLeaderboard, getUtcPeriodBoundaries, type LeaderboardPeriod } from '@gami/leaderboards';
import { createNotificationIntent } from '@gami/notifications';
import { describePrizes, grantPrizes, type Prize } from '@gami/rewards';
import { evaluateConditionTree, type Condition, type EventData } from '@gami/rules';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, eq, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';

const log = createLogger('Mechanics');

/** The number at a path such as `payload.distance`, rounded down, or 0 when it is not a positive number. */
function amountAt(eventData: EventData, path: string): number {
  const value = path.split('.').reduce<unknown>((current, part) => (current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined), eventData);
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

/**
 * Counts an event towards the shared goals it matches. A community goal has one total. A team goal
 * has one per team, and an event from a player in no team counts for nothing. An event is counted
 * once per goal however often it is retried.
 */
export async function processSharedGoalsForEvent(eventData: EventData, now: Date = new Date()): Promise<{ counted: number; completed: number }> {
  if (!eventData.userId) return { counted: 0, completed: 0 };
  const { projectId, userId } = eventData;

  const goals = (
    await db
      .select()
      .from(sharedGoals)
      .where(and(eq(sharedGoals.projectId, projectId), eq(sharedGoals.enabled, true), eq(sharedGoals.trigger, eventData.type)))
  ).filter((goal) => !(goal.startAt && goal.startAt > now) && !(goal.endAt && goal.endAt <= now));
  if (goals.length === 0) return { counted: 0, completed: 0 };

  let teamId: string | null | undefined;
  let counted = 0;
  let completed = 0;

  for (const goal of goals) {
    try {
      const filters = (goal.filters ?? []) as Condition[];
      if (filters.length > 0 && !evaluateConditionTree({ all: filters }, eventData)) continue;
      const amount = goal.amountField ? amountAt(eventData, goal.amountField) : 1;
      if (amount <= 0) continue;

      let scopeKey = 'all';
      if (goal.scope === 'team') {
        if (teamId === undefined) {
          const [member] = await db
            .select({ teamId: teamMembers.teamId })
            .from(teamMembers)
            .where(and(eq(teamMembers.projectId, projectId), eq(teamMembers.userId, userId)));
          teamId = member?.teamId ?? null;
        }
        if (!teamId) continue;
        scopeKey = teamId;
      }

      await db.transaction(async (tx) => {
        const [fresh] = await tx
          .insert(sharedGoalEvents)
          .values({ id: `sge_${randomUUID()}`, projectId, goalId: goal.id, eventId: eventData.id })
          .onConflictDoNothing()
          .returning({ id: sharedGoalEvents.id });
        if (!fresh) return;

        await tx
          .insert(sharedGoalProgress)
          .values({ id: `sgp_${randomUUID()}`, projectId, goalId: goal.id, scopeKey })
          .onConflictDoNothing();
        // Only an unfinished total moves, so nothing is added after the target is reached.
        const [moved] = await tx
          .update(sharedGoalProgress)
          .set({ progress: sql`${sharedGoalProgress.progress} + ${amount}`, updatedAt: now })
          .where(and(eq(sharedGoalProgress.goalId, goal.id), eq(sharedGoalProgress.scopeKey, scopeKey), isNull(sharedGoalProgress.completedAt)))
          .returning();
        if (!moved) return;

        await tx
          .insert(sharedGoalContributions)
          .values({ id: `sgc_${randomUUID()}`, projectId, goalId: goal.id, scopeKey, userId, amount })
          .onConflictDoUpdate({
            target: [sharedGoalContributions.goalId, sharedGoalContributions.userId],
            set: { amount: sql`${sharedGoalContributions.amount} + ${amount}`, updatedAt: now },
          });
        counted++;

        if (moved.progress >= goal.target) {
          await tx.update(sharedGoalProgress).set({ completedAt: now }).where(eq(sharedGoalProgress.id, moved.id));
          await createWebhookDelivery(tx, {
            projectId,
            eventId: `goal:${goal.id}:${scopeKey}`,
            eventType: 'goal.completed',
            data: { goalId: goal.id, goalKey: goal.key, goalName: goal.name, scope: goal.scope, teamId: scopeKey === 'all' ? null : scopeKey, target: goal.target, prizes: goal.rewards },
          });
          completed++;
        }
      });
    } catch (err) {
      log.error(`Shared goal ${goal.id} failed for event ${eventData.id}:`, err);
    }
  }
  return { counted, completed };
}

/**
 * Pays the prizes of finished goals to everyone who contributed, a batch at a time, each player in
 * their own transaction. A player whose prize cannot be paid, for example because its currency
 * was removed, is left for the next pass.
 */
export async function payGoalPrizes(limit = 200): Promise<number> {
  let paid = 0;
  const tried: string[] = [];

  for (let i = 0; i < limit; i++) {
    let rowId: string | undefined;
    try {
      const done = await db.transaction(async (tx) => {
        const [due] = await tx
          .select({ contribution: sharedGoalContributions, goal: sharedGoals })
          .from(sharedGoalContributions)
          .innerJoin(sharedGoals, eq(sharedGoals.id, sharedGoalContributions.goalId))
          .innerJoin(sharedGoalProgress, and(eq(sharedGoalProgress.goalId, sharedGoalContributions.goalId), eq(sharedGoalProgress.scopeKey, sharedGoalContributions.scopeKey)))
          .where(and(isNull(sharedGoalContributions.paidAt), isNotNull(sharedGoalProgress.completedAt), tried.length > 0 ? notInArray(sharedGoalContributions.id, tried) : undefined))
          .limit(1)
          .for('update', { of: sharedGoalContributions, skipLocked: true });
        if (!due) return false;
        const { contribution, goal } = due;
        rowId = contribution.id;
        tried.push(contribution.id);

        const prizes = (goal.rewards ?? []) as Prize[];
        const source = `goal:${goal.id}:${contribution.scopeKey}:${contribution.userId}`;
        await grantPrizes(tx, { projectId: goal.projectId, userId: contribution.userId, prizes, reason: `Goal reached: ${goal.name}`, source, metadata: { goalId: goal.id } });
        if (prizes.length > 0) {
          await createNotificationIntent(tx, {
            projectId: goal.projectId,
            userId: contribution.userId,
            type: 'prize_won',
            data: { title: `Goal reached: ${goal.name}`, prizes: describePrizes(prizes) },
            sourceType: 'goal_completed',
            sourceId: source,
          });
        }
        await tx.update(sharedGoalContributions).set({ paidAt: new Date() }).where(eq(sharedGoalContributions.id, contribution.id));
        return true;
      });
      if (!done) break;
      paid++;
    } catch (err) {
      if (!rowId) throw err;
      log.warn(`Could not pay a goal prize (${rowId}); it will be tried again:`, (err as Error).message);
    }
  }
  return paid;
}

const PRIZE_PERIODS: LeaderboardPeriod[] = ['daily', 'weekly', 'monthly'];

/** The period that most recently ended, named by its first day. */
export function closedPeriod(period: LeaderboardPeriod, now: Date) {
  const current = getUtcPeriodBoundaries(period, now);
  const inside = new Date(current.periodStart.getTime() - 1);
  const previous = getUtcPeriodBoundaries(period, inside);
  return { key: previous.periodStart.toISOString().slice(0, 10), inside, endedAt: current.periodStart };
}

async function payPrizeRule(rule: LeaderboardPrize, now: Date): Promise<number> {
  const period = rule.period as LeaderboardPeriod;
  const closed = closedPeriod(period, now);
  if (rule.lastPaidPeriod === closed.key) return 0;

  const markPaid = () => db.update(leaderboardPrizes).set({ lastPaidPeriod: closed.key }).where(eq(leaderboardPrizes.id, rule.id));
  // A prize made after a period ended does not reach back into it.
  if (rule.createdAt >= closed.endedAt) {
    await markPaid();
    return 0;
  }

  const board = await getLeaderboard(rule.projectId, { period, now: closed.inside, page: 1, limit: Math.min(100, rule.toRank) });
  const winners = board.entries.filter((entry) => entry.rank >= rule.fromRank && entry.rank <= rule.toRank && entry.xp > 0);
  const prizes = (rule.rewards ?? []) as Prize[];
  let paid = 0;
  let failed = false;

  for (const winner of winners) {
    try {
      await db.transaction(async (tx) => {
        const [first] = await tx
          .insert(leaderboardPayouts)
          .values({ id: `lpo_${randomUUID()}`, projectId: rule.projectId, userId: winner.userId, prizeId: rule.id, period, periodKey: closed.key, rank: winner.rank, xp: winner.xp, rewards: prizes })
          .onConflictDoNothing()
          .returning({ id: leaderboardPayouts.id });
        if (!first) return;
        const source = `lbp:${rule.id}:${closed.key}:${winner.userId}`;
        const title = `${rule.name}: place ${winner.rank}`;
        await grantPrizes(tx, { projectId: rule.projectId, userId: winner.userId, prizes, reason: title, source, metadata: { prizeId: rule.id, period, periodStart: closed.key, rank: winner.rank } });
        await createNotificationIntent(tx, { projectId: rule.projectId, userId: winner.userId, type: 'prize_won', data: { title, prizes: describePrizes(prizes) }, sourceType: 'leaderboard_prize', sourceId: source });
        await createWebhookDelivery(tx, {
          projectId: rule.projectId,
          eventId: source,
          eventType: 'leaderboard.prize_paid',
          userId: winner.userId,
          externalUserId: winner.externalId,
          data: { prizeId: rule.id, prizeName: rule.name, period, periodStart: closed.key, rank: winner.rank, xp: winner.xp, prizes },
        });
        paid++;
      });
    } catch (err) {
      failed = true;
      log.warn(`Could not pay leaderboard prize ${rule.id} to ${winner.userId}; it will be tried again:`, (err as Error).message);
    }
  }
  // The period is closed for this prize only once everyone was paid, so a failure is retried.
  if (!failed) await markPaid();
  return paid;
}

/** Pays the top places of every board period that has ended since the last pass. Safe to run as often as you like. */
export async function payLeaderboardPrizes(now: Date = new Date()): Promise<number> {
  const rules = await db.select().from(leaderboardPrizes).where(eq(leaderboardPrizes.enabled, true));
  let paid = 0;
  const enabledFor = new Map<string, boolean>();
  for (const rule of rules) {
    if (!PRIZE_PERIODS.includes(rule.period as LeaderboardPeriod)) continue;
    try {
      if (!enabledFor.has(rule.projectId)) enabledFor.set(rule.projectId, await isFeatureEnabledForProject(rule.projectId, 'leaderboard_prizes'));
      if (!enabledFor.get(rule.projectId)) continue;
      paid += await payPrizeRule(rule, now);
    } catch (err) {
      log.error(`Leaderboard prize ${rule.id} failed:`, err);
    }
  }
  return paid;
}
