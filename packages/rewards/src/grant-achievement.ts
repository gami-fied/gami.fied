import { randomUUID } from 'crypto';
import { achievements, userAchievements, type Achievement } from '@gami/database';
import { createNotificationIntent } from '@gami/notifications';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, eq } from 'drizzle-orm';
import type { RewardTransaction } from './award-xp.js';

export interface GrantAchievementInput {
  projectId: string;
  userId: string;
  achievementKey: string;
  metadata?: Record<string, unknown>;
  eventId?: string | null;
  ruleExecutionId?: string | null;
}

export type GrantAchievementResult =
  | { duplicate: true; achievement: Achievement }
  | { duplicate: false; achievement: Achievement; userAchievementId: string };

/**
 * Grants an achievement once per user, with its notification and webhook in the same transaction.
 * Throws when the key is missing or disabled, so nothing is reported as granted when it was not.
 */
export async function grantAchievement(
  tx: RewardTransaction,
  input: GrantAchievementInput
): Promise<GrantAchievementResult> {
  const { projectId, userId, achievementKey } = input;

  const [achievement] = await tx
    .select()
    .from(achievements)
    .where(and(eq(achievements.projectId, projectId), eq(achievements.key, achievementKey)));

  if (!achievement) {
    throw new Error(`Achievement key "${achievementKey}" not found in project ${projectId}`);
  }
  if (!achievement.enabled) {
    throw new Error(`Achievement "${achievementKey}" is currently disabled in project ${projectId}`);
  }

  const [granted] = await tx
    .insert(userAchievements)
    .values({
      id: `uach_${randomUUID()}`,
      projectId,
      userId,
      achievementId: achievement.id,
      eventId: input.eventId ?? null,
      ruleExecutionId: input.ruleExecutionId ?? null,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing()
    .returning({ id: userAchievements.id });

  if (!granted) return { duplicate: true, achievement };

  const data = {
    achievementId: achievement.id,
    achievementKey: achievement.key,
    achievementName: achievement.name,
    iconUrl: achievement.iconUrl,
  };

  await createNotificationIntent(tx, {
    projectId,
    userId,
    type: 'achievement_unlocked',
    data,
    sourceType: 'achievement_unlocked',
    sourceId: granted.id,
  });

  await createWebhookDelivery(tx, {
    projectId,
    eventId: granted.id,
    eventType: 'achievement.unlocked',
    userId,
    data,
  });

  return { duplicate: false, achievement, userAchievementId: granted.id };
}
