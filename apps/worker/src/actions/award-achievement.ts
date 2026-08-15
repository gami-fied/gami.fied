import crypto from 'crypto';
import { achievements, db, userAchievements } from '@gami/database';
import { createNotificationIntent } from '@gami/notifications';
import { ActionDefinition, defaultActionRegistry, EventData } from '@gami/rules';
import { createWebhookDelivery } from '@gami/webhooks';
import { eq, and } from 'drizzle-orm';

export interface AwardAchievementParams {
  achievementKey: string;
  metadata?: Record<string, unknown>;
}

export interface RuleExecutionContext {
  ruleId: string;
  ruleExecutionId: string;
}

export async function executeAwardAchievementAction(
  action: ActionDefinition,
  event: EventData,
  context?: RuleExecutionContext
): Promise<{ status: 'completed' | 'skipped' }> {
  const params = action.params as AwardAchievementParams | undefined;

  if (!params || typeof params.achievementKey !== 'string') {
    throw new Error('award_achievement action requires a valid string achievementKey parameter');
  }

  const { achievementKey } = params;
  if (!achievementKey || achievementKey.length > 64 || !/^[a-zA-Z0-9_-]+$/.test(achievementKey)) {
    throw new Error(
      'award_achievement achievementKey must be 1 to 64 alphanumeric characters, underscores, or dashes'
    );
  }

  if (!event.userId) {
    throw new Error('award_achievement action requires event to have a valid user_id context');
  }

  // 1. Resolve achievement definition within the SAME project
  const [achievement] = await db
    .select()
    .from(achievements)
    .where(and(eq(achievements.projectId, event.projectId), eq(achievements.key, achievementKey)));

  if (!achievement) {
    console.error(
      `[award_achievement] Achievement key "${achievementKey}" not found in project ${event.projectId}`
    );
    throw new Error(`Achievement key "${achievementKey}" not found in project ${event.projectId}`);
  }

  if (!achievement.enabled) {
    console.error(
      `[award_achievement] Achievement "${achievement.id}" (${achievementKey}) is disabled in project ${event.projectId}`
    );
    throw new Error(
      `Achievement "${achievementKey}" is currently disabled in project ${event.projectId}`
    );
  }

  const userAchievementId = `uach_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const metadata = params.metadata || {};

  console.log(
    `[award_achievement] Executing award: projectId=${event.projectId}, userId=${event.userId}, achievementId=${achievement.id}, eventId=${event.id}, ruleId=${context?.ruleId || 'N/A'}, ruleExecutionId=${context?.ruleExecutionId || 'N/A'}`
  );

  try {
    // 2. Independent Atomic Transaction for User Achievement Award
    await db.transaction(async (tx) => {
      await tx.insert(userAchievements).values({
        id: userAchievementId,
        projectId: event.projectId,
        userId: event.userId!,
        achievementId: achievement.id,
        eventId: event.id,
        ruleExecutionId: context?.ruleExecutionId || null,
        metadata,
      });

      await createNotificationIntent(tx, {
        projectId: event.projectId,
        userId: event.userId!,
        type: 'achievement_unlocked',
        data: {
          achievementId: achievement.id,
          achievementKey: achievement.key,
          achievementName: achievement.name,
          iconUrl: achievement.iconUrl,
        },
        sourceType: 'achievement_unlocked',
        sourceId: userAchievementId,
      });

      await createWebhookDelivery(tx, {
        projectId: event.projectId,
        eventId: userAchievementId,
        eventType: 'achievement.unlocked',
        userId: event.userId!,
        data: {
          achievementId: achievement.id,
          achievementKey: achievement.key,
          achievementName: achievement.name,
          iconUrl: achievement.iconUrl,
        },
      });
    });

    console.log(
      `[award_achievement] Successfully awarded achievement ${achievement.key} (${userAchievementId}) to user ${event.userId} in project ${event.projectId}`
    );
    return { status: 'completed' };
  } catch (err: unknown) {
    const error = err as { code?: string };
    // Handle duplicate award constraint (23505) explicitly as idempotent success
    if (error.code === '23505') {
      console.log(
        `[award_achievement] Duplicate award skipped (already_awarded): userId=${event.userId}, achievementId=${achievement.id}, ruleExecutionId=${context?.ruleExecutionId || 'N/A'}`
      );
      return { status: 'skipped' };
    }
    throw err;
  }
}

export function registerAchievementActions(): void {
  defaultActionRegistry.register('award_achievement', async (action, event) => {
    await executeAwardAchievementAction(action, event);
  });
}
