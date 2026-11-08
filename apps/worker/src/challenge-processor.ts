import { randomUUID } from 'crypto';
import {
  challengeEventProgress,
  challengeRewardOutbox,
  challenges,
  db,
  userChallengeProgress,
} from '@gami/database';
import {
  challengeEvents,
  eventAdvances,
  periodKey,
  type ChallengeFilter,
  type ChallengeRecurrence,
  type ChallengeReward,
  type ChallengeStep,
} from '@gami/challenges';
import {
  createNotificationIntent,
  generateChallengeCompletionSourceId,
} from '@gami/notifications';
import { awardXp, grantAchievement, type RewardTransaction } from '@gami/rewards';
import { createWebhookDelivery } from '@gami/webhooks';
import { evaluateConditionTree, type Condition, type EventData } from '@gami/rules';
import { and, asc, eq, lte, notInArray, sql } from 'drizzle-orm';
import { exponentialBackoffMs } from './outbox.js';
import { createLogger } from '@gami/config';

const log = createLogger('ChallengeProcessor');

type ChallengeRewardOutbox = typeof challengeRewardOutbox.$inferSelect;

export const MAX_CHALLENGE_REWARD_ATTEMPTS = 10;

async function grantChallengeReward(
  tx: RewardTransaction,
  record: ChallengeRewardOutbox
): Promise<void> {
  const payload = record.rewardPayload as ChallengeReward;
  const { projectId, userId, eventId, challengeId } = record;
  const metadata = { challengeId, outboxId: record.id };

  if (record.rewardType === 'xp') {
    await awardXp(tx, {
      projectId,
      userId,
      amount: (payload as { amount: number }).amount,
      reason: `Challenge reward: ${challengeId}`,
      metadata,
      eventId,
      idempotencyKey: record.id,
      webhookData: { challengeId },
    });
  } else if (record.rewardType === 'achievement') {
    await grantAchievement(tx, {
      projectId,
      userId,
      achievementKey: (payload as { achievementKey: string }).achievementKey,
      metadata,
      eventId,
    });
  } else {
    throw new Error(`Unsupported reward type: ${record.rewardType}`);
  }
}

async function recordRewardFailure(
  record: ChallengeRewardOutbox,
  err: unknown,
  forceNow?: Date
): Promise<void> {
  const attempts = record.attempts + 1;
  const backoffMs = exponentialBackoffMs(attempts);

  await db
    .update(challengeRewardOutbox)
    .set({
      status: attempts >= MAX_CHALLENGE_REWARD_ATTEMPTS ? 'failed' : 'pending',
      attempts,
      availableAt: forceNow
        ? new Date(forceNow.getTime() + backoffMs)
        : sql`now() + ${backoffMs} * interval '1 millisecond'`,
      lastError: (err as Error).message || 'Failed to dispatch reward',
      updatedAt: new Date(),
    })
    .where(eq(challengeRewardOutbox.id, record.id));
}

/**
 * Dispatches pending challenge rewards from challenge_reward_outbox, each in its own transaction,
 * so one bad reward cannot roll back the others. SKIP LOCKED keeps multiple workers apart, and
 * outbox.id is the idempotency key that makes each reward take effect exactly once.
 */
export async function dispatchPendingChallengeRewards(
  limit = 50,
  forceNow?: Date
): Promise<{ processedCount: number; completedCount: number }> {
  const now = forceNow ?? sql`now()`;
  let processedCount = 0;
  let completedCount = 0;
  // A short backoff can pass during a slow batch, and one run should only try each reward once.
  const attemptedIds: string[] = [];

  for (let i = 0; i < limit; i++) {
    let record: ChallengeRewardOutbox | undefined;

    try {
      await db.transaction(async (tx) => {
        [record] = await tx
          .select()
          .from(challengeRewardOutbox)
          .where(
            and(
              eq(challengeRewardOutbox.status, 'pending'),
              lte(challengeRewardOutbox.availableAt, now),
              notInArray(challengeRewardOutbox.id, attemptedIds)
            )
          )
          .orderBy(asc(challengeRewardOutbox.availableAt), asc(challengeRewardOutbox.id))
          .limit(1)
          .for('update', { skipLocked: true });

        if (!record) return;
        attemptedIds.push(record.id);

        await grantChallengeReward(tx, record);
        await tx
          .update(challengeRewardOutbox)
          .set({ status: 'completed', publishedAt: new Date(), updatedAt: new Date() })
          .where(eq(challengeRewardOutbox.id, record.id));
      });

      if (!record) break;
      processedCount++;
      completedCount++;
    } catch (err: unknown) {
      if (!record) throw err;
      processedCount++;
      await recordRewardFailure(record, err, forceNow);
    }
  }

  return { processedCount, completedCount };
}

/**
 * Main worker entrypoint for processing challenges on incoming events.
 * Performs idempotent event progress evaluation, updates progress records,
 * and enqueues challenge completion rewards into challenge_reward_outbox.
 *
 * A counter takes any matching event. A steps challenge takes only the event for its next step,
 * so steps must happen in order. Daily and weekly challenges keep one progress row per period.
 */
export async function processChallengesForEvent(
  eventData: EventData,
  options?: { skipImmediateRewardDispatch?: boolean }
): Promise<{ processedChallengesCount: number; completedChallengesCount: number }> {
  if (!eventData.userId) {
    return { processedChallengesCount: 0, completedChallengesCount: 0 };
  }

  const { projectId, userId, type: eventType } = eventData;
  const now = new Date();
  const occurredAt = new Date(eventData.occurredAt);

  // 1. Active challenges in the project that this event type could move. A project has few, so
  // they are filtered here, because a steps challenge listens for several events.
  const activeChallenges = await db
    .select()
    .from(challenges)
    .where(and(eq(challenges.projectId, projectId), eq(challenges.enabled, true)));

  const matchingChallenges = activeChallenges.filter((challenge) =>
    challengeEvents({
      trigger: challenge.trigger,
      type: challenge.type,
      steps: challenge.steps as ChallengeStep[] | null,
    }).includes(eventType)
  );

  if (matchingChallenges.length === 0) {
    return { processedChallengesCount: 0, completedChallengesCount: 0 };
  }

  const passes = (filters: ChallengeFilter[]) =>
    evaluateConditionTree({ all: filters as Condition[] }, eventData);

  let processedCount = 0;
  let newlyCompletedCount = 0;

  for (const challenge of matchingChallenges) {
    // Check challenge timeline (startAt / endAt)
    if (challenge.startAt && challenge.startAt > now) continue;
    if (challenge.endAt && challenge.endAt < now) continue;

    const period = periodKey(challenge.recurrence as ChallengeRecurrence | null, occurredAt);
    const progressRow = and(
      eq(userChallengeProgress.projectId, projectId),
      eq(userChallengeProgress.userId, userId),
      eq(userChallengeProgress.challengeId, challenge.id),
      eq(userChallengeProgress.periodKey, period)
    );
    const definition = {
      trigger: challenge.trigger,
      type: challenge.type,
      filters: challenge.filters as ChallengeFilter[] | null,
      steps: challenge.steps as ChallengeStep[] | null,
    };

    try {
      // A cheap look first, so events that cannot move this challenge write nothing.
      const [seen] = await db.select().from(userChallengeProgress).where(progressRow);
      if (seen?.completed) continue;
      if (!eventAdvances(definition, seen?.progress ?? 0, eventType, passes)) continue;

      let newlyCompleted = false;

      await db.transaction(async (tx) => {
        // Step a: make sure the progress row exists, then lock it
        await tx
          .insert(userChallengeProgress)
          .values({
            id: `ucp_${randomUUID()}`,
            projectId,
            userId,
            challengeId: challenge.id,
            periodKey: period,
            progress: 0,
          })
          .onConflictDoNothing();

        const [existingProgress] = await tx
          .select()
          .from(userChallengeProgress)
          .where(progressRow)
          .for('update');
        if (!existingProgress || existingProgress.completed) return;

        // Step b: look again now that the row is locked, since another event may have moved it
        if (!eventAdvances(definition, existingProgress.progress, eventType, passes)) return;

        // Step c: Idempotent event deduplication via challenge_event_progress
        const [dedupRecord] = await tx
          .insert(challengeEventProgress)
          .values({
            id: `cep_${randomUUID()}`,
            projectId,
            challengeId: challenge.id,
            userId,
            eventId: eventData.id,
          })
          .onConflictDoNothing({
            target: [
              challengeEventProgress.projectId,
              challengeEventProgress.challengeId,
              challengeEventProgress.eventId,
            ],
          })
          .returning({ id: challengeEventProgress.id });

        // If the row was NOT inserted, this event was already counted for this challenge
        if (!dedupRecord) return;

        const newProgress = existingProgress.progress + 1;
        const isNowCompleted = newProgress >= challenge.target;

        await tx
          .update(userChallengeProgress)
          .set({
            progress: newProgress,
            completed: isNowCompleted,
            completedAt: isNowCompleted ? now : null,
            updatedAt: now,
          })
          .where(eq(userChallengeProgress.id, existingProgress.id));

        // Step d: If newly completed, enqueue reward outbox & notification intent
        if (isNowCompleted) {
          newlyCompleted = true;

          // Deterministic source ID for the notification. A repeating challenge completes once per period.
          const sourceId = generateChallengeCompletionSourceId(
            projectId,
            userId,
            period ? `${challenge.id}:${period}` : challenge.id
          );

          await createNotificationIntent(tx, {
            projectId,
            userId,
            type: 'challenge_completed',
            data: {
              challengeId: challenge.id,
              challengeKey: challenge.key,
              challengeName: challenge.name,
            },
            sourceType: 'challenge_completed',
            sourceId,
          });

          await createWebhookDelivery(tx, {
            projectId,
            eventId: sourceId,
            eventType: 'challenge.completed',
            userId,
            data: {
              challengeId: challenge.id,
              challengeKey: challenge.key,
              challengeName: challenge.name,
            },
          });

          const rewards = (challenge.rewards || []) as ChallengeReward[];
          for (const reward of rewards) {
            if (!reward) continue;

            await tx.insert(challengeRewardOutbox).values({
              id: `cro_${randomUUID()}`,
              projectId: eventData.projectId,
              challengeId: challenge.id,
              userId,
              eventId: eventData.id,
              rewardType: reward.type,
              rewardPayload: reward,
              status: 'pending',
            });
          }
        }

        processedCount++;
      });

      if (newlyCompleted) {
        newlyCompletedCount++;
      }

      // Step e: Immediate post-commit dispatching unless skipped (e.g. for crash simulation tests)
      if (!options?.skipImmediateRewardDispatch) {
        await dispatchPendingChallengeRewards(50);
      }
    } catch (chErr) {
      log.error(`Error evaluating challenge ${challenge.id} for event ${eventData.id}:`, chErr);
    }
  }

  return {
    processedChallengesCount: processedCount,
    completedChallengesCount: newlyCompletedCount,
  };
}
