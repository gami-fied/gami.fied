import { randomUUID } from 'crypto';
import {
  challengeEventProgress,
  challengeRewardOutbox,
  challenges,
  db,
  userChallengeProgress,
} from '@gami/database';
import { ChallengeReward } from '@gami/challenges';
import {
  createNotificationIntent,
  generateChallengeCompletionSourceId,
} from '@gami/notifications';
import { awardXp, grantAchievement, type RewardTransaction } from '@gami/rewards';
import { createWebhookDelivery } from '@gami/webhooks';
import { EventData } from '@gami/rules';
import { and, asc, eq, lte, notInArray, sql } from 'drizzle-orm';

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
  const backoffMs = Math.min(300000, 1000 * Math.pow(2, attempts));

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

  // 1. Query all active challenges in project matching eventType
  const matchingChallenges = await db
    .select()
    .from(challenges)
    .where(
      and(
        eq(challenges.projectId, projectId),
        eq(challenges.trigger, eventType),
        eq(challenges.enabled, true)
      )
    );

  if (matchingChallenges.length === 0) {
    return { processedChallengesCount: 0, completedChallengesCount: 0 };
  }

  let processedCount = 0;
  let newlyCompletedCount = 0;

  for (const challenge of matchingChallenges) {
    // Check challenge timeline (startAt / endAt)
    if (challenge.startAt && challenge.startAt > now) continue;
    if (challenge.endAt && challenge.endAt < now) continue;

    try {
      let newlyCompleted = false;

      await db.transaction(async (tx) => {
        // Step a: Idempotent event deduplication via challenge_event_progress
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

        // If row was NOT inserted (returned undefined), this event was already counted for this challenge!
        if (!dedupRecord) {
          return;
        }

        // Step b: Lock user_challenge_progress row with FOR UPDATE
        const [existingProgress] = await tx
          .select()
          .from(userChallengeProgress)
          .where(
            and(
              eq(userChallengeProgress.projectId, projectId),
              eq(userChallengeProgress.userId, userId),
              eq(userChallengeProgress.challengeId, challenge.id)
            )
          )
          .for('update');

        const currentProgress = existingProgress ? existingProgress.progress : 0;
        const isAlreadyCompleted = existingProgress ? existingProgress.completed : false;

        if (isAlreadyCompleted) {
          // Challenge already completed previously -> skip further increments
          return;
        }

        const newProgress = currentProgress + 1;
        const isNowCompleted = newProgress >= challenge.target;
        const progressRecordId = existingProgress ? existingProgress.id : `ucp_${randomUUID()}`;

        await tx
          .insert(userChallengeProgress)
          .values({
            id: progressRecordId,
            projectId,
            userId,
            challengeId: challenge.id,
            progress: newProgress,
            completed: isNowCompleted,
            completedAt: isNowCompleted ? now : null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [
              userChallengeProgress.projectId,
              userChallengeProgress.userId,
              userChallengeProgress.challengeId,
            ],
            set: {
              progress: newProgress,
              completed: isNowCompleted,
              completedAt: isNowCompleted ? now : null,
              updatedAt: now,
            },
          });

        // Step c: If newly completed, enqueue reward outbox & notification intent
        if (isNowCompleted && !isAlreadyCompleted) {
          newlyCompleted = true;

          // Deterministic source ID for challenge completion notification
          const sourceId = generateChallengeCompletionSourceId(projectId, userId, challenge.id);

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
          for (let idx = 0; idx < rewards.length; idx++) {
            const reward = rewards[idx];
            if (!reward) continue;

            const outboxId = `cro_${randomUUID()}`;
            await tx.insert(challengeRewardOutbox).values({
              id: outboxId,
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

      // Step d: Immediate post-commit dispatching unless skipped (e.g. for crash simulation tests)
      if (!options?.skipImmediateRewardDispatch) {
        await dispatchPendingChallengeRewards(50);
      }
    } catch (chErr) {
      console.error(
        `[ChallengeProcessor] Error evaluating challenge ${challenge.id} for event ${eventData.id}:`,
        chErr
      );
    }
  }

  return {
    processedChallengesCount: processedCount,
    completedChallengesCount: newlyCompletedCount,
  };
}
