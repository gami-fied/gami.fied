import { randomUUID } from 'crypto';
import {
  achievements,
  challengeEventProgress,
  challengeRewardOutbox,
  challenges,
  db,
  levels,
  userAchievements,
  userChallengeProgress,
  userXpBalances,
  xpLedger,
} from '@gami/database';
import { ChallengeReward } from '@gami/challenges';
import {
  createNotificationIntent,
  generateChallengeCompletionSourceId,
  generateLevelUpSourceId,
} from '@gami/notifications';
import { getLevelsCrossed } from '@gami/progression';
import { createWebhookDelivery } from '@gami/webhooks';
import { EventData } from '@gami/rules';
import { and, eq, lte, sql } from 'drizzle-orm';

/**
 * Dispatches pending challenge completion rewards from challenge_reward_outbox.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED to allow safe concurrent multi-worker processing.
 * Executes reward side-effects and marks outbox status = 'completed' atomically.
 * Uses outbox.id as the deterministic idempotency key to guarantee exactly-once effects.
 */
export async function dispatchPendingChallengeRewards(
  limit = 50,
  forceNow?: Date
): Promise<{ processedCount: number; completedCount: number }> {
  const now = forceNow || new Date(Date.now() + 10000);

  return await db.transaction(async (tx) => {
    // 1. Select pending outbox records using FOR UPDATE SKIP LOCKED
    const pendingRecords = await tx
      .select()
      .from(challengeRewardOutbox)
      .where(
        and(
          eq(challengeRewardOutbox.status, 'pending'),
          lte(challengeRewardOutbox.availableAt, now)
        )
      )
      .limit(limit)
      .for('update', { skipLocked: true });

    let completedCount = 0;

    for (const record of pendingRecords) {
      try {
        const payload = record.rewardPayload as ChallengeReward;

        if (record.rewardType === 'xp') {
          const xpAmount = (payload as { amount: number }).amount;
          const ledgerId = `xpl_cro_${randomUUID()}`;
          const balanceId = `uxb_cro_${randomUUID()}`;

          // Insert into xp_ledger using record.id as the idempotency key
          await tx
            .insert(xpLedger)
            .values({
              id: ledgerId,
              projectId: record.projectId,
              userId: record.userId,
              eventId: record.eventId,
              ruleId: null,
              ruleExecutionId: null,
              idempotencyKey: record.id,
              amount: xpAmount,
              reason: `Challenge reward execution: ${record.challengeId}`,
              metadata: { challengeId: record.challengeId, outboxId: record.id },
            })
            .onConflictDoNothing({
              target: [xpLedger.projectId, xpLedger.idempotencyKey],
            });

          // Upsert user_xp_balances atomically with returning()
          const [upsertedBalance] = await tx
            .insert(userXpBalances)
            .values({
              id: balanceId,
              projectId: record.projectId,
              userId: record.userId,
              totalXp: xpAmount,
            })
            .onConflictDoUpdate({
              target: [userXpBalances.projectId, userXpBalances.userId],
              set: {
                totalXp: sql`user_xp_balances.total_xp + ${xpAmount}`,
                updatedAt: new Date(),
              },
            })
            .returning();

          const newXp = upsertedBalance ? upsertedBalance.totalXp : xpAmount;
          const previousXp = Math.max(0, newXp - xpAmount);

          // Create xp_awarded notification intent
          await createNotificationIntent(tx, {
            projectId: record.projectId,
            userId: record.userId,
            type: 'xp_awarded',
            data: { amount: xpAmount, reason: `Challenge reward: ${record.challengeId}` },
            sourceType: 'xp_awarded',
            sourceId: ledgerId,
          });

          // Calculate and create level_up notification intents
          const projectLevels = await tx
            .select()
            .from(levels)
            .where(eq(levels.projectId, record.projectId));

          if (projectLevels.length > 0) {
            const crossed = getLevelsCrossed(previousXp, newXp, projectLevels);
            const activeLevelsSorted = projectLevels
              .filter((l) => l.enabled !== false)
              .sort((a, b) => a.level - b.level);

            for (const lvlNumber of crossed) {
              const lvlDef = activeLevelsSorted.find((l) => l.level === lvlNumber);
              const levelName = lvlDef ? lvlDef.name : `Level ${lvlNumber}`;
              const sourceId = generateLevelUpSourceId(record.projectId, record.userId, lvlNumber);

              await createNotificationIntent(tx, {
                projectId: record.projectId,
                userId: record.userId,
                type: 'level_up',
                data: {
                  previousLevel: lvlNumber - 1,
                  newLevel: lvlNumber,
                  levelName,
                },
                sourceType: 'level_up',
                sourceId,
              });
            }
          }
        } else if (record.rewardType === 'achievement') {
          const achievementKey = (payload as { achievementKey: string }).achievementKey;

          // Resolve achievement definition within same project
          const [achievementDef] = await tx
            .select()
            .from(achievements)
            .where(
              and(
                eq(achievements.projectId, record.projectId),
                eq(achievements.key, achievementKey)
              )
            );

          if (achievementDef && achievementDef.enabled) {
            const userAchId = `uach_cro_${randomUUID()}`;
            const [insertedAch] = await tx
              .insert(userAchievements)
              .values({
                id: userAchId,
                projectId: record.projectId,
                userId: record.userId,
                achievementId: achievementDef.id,
                eventId: record.eventId,
                ruleExecutionId: null,
                metadata: { challengeId: record.challengeId, outboxId: record.id },
              })
              .onConflictDoNothing({
                target: [
                  userAchievements.projectId,
                  userAchievements.userId,
                  userAchievements.achievementId,
                ],
              })
              .returning();

            if (insertedAch) {
              await createNotificationIntent(tx, {
                projectId: record.projectId,
                userId: record.userId,
                type: 'achievement_unlocked',
                data: {
                  achievementId: achievementDef.id,
                  achievementKey: achievementDef.key,
                  achievementName: achievementDef.name,
                  iconUrl: achievementDef.iconUrl,
                },
                sourceType: 'achievement_unlocked',
                sourceId: insertedAch.id,
              });
            }
          }
        } else {
          throw new Error(`Unsupported reward type: ${record.rewardType}`);
        }

        // Atomically mark outbox record completed inside same transaction
        await tx
          .update(challengeRewardOutbox)
          .set({
            status: 'completed',
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(challengeRewardOutbox.id, record.id));

        completedCount++;
      } catch (err: unknown) {
        const errorMsg = (err as Error).message || 'Failed to dispatch reward';
        const nextAttempts = record.attempts + 1;
        const backoffMs = Math.min(300000, 1000 * Math.pow(2, nextAttempts));
        const nextAvailable = new Date(now.getTime() + backoffMs);

        await tx
          .update(challengeRewardOutbox)
          .set({
            attempts: nextAttempts,
            availableAt: nextAvailable,
            lastError: errorMsg,
            updatedAt: new Date(),
          })
          .where(eq(challengeRewardOutbox.id, record.id));
      }
    }

    return {
      processedCount: pendingRecords.length,
      completedCount,
    };
  });
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
              availableAt: new Date(now.getTime() - 1000), // Guaranteed available for immediate dispatch
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
