import crypto from 'crypto';
import { createLogger } from '@gami/config';
import {
  achievements,
  db,
  measureAggregate,
  userAchievementProgress,
  type Achievement,
} from '@gami/database';
import { createNotificationIntent } from '@gami/notifications';
import { awardXp, grantAchievement } from '@gami/rewards';
import {
  aggregateWindowStart,
  criteriaTrigger,
  isStreakCriteria,
  tierReached,
  validateAchievementCriteria,
  type AchievementCriteria,
  type AchievementTier,
  type EventData,
} from '@gami/rules';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, eq, sql } from 'drizzle-orm';

const log = createLogger('AchievementProgress');

function parse(row: Achievement): { criteria: AchievementCriteria; tiers: AchievementTier[] } | null {
  try {
    return validateAchievementCriteria(row.criteria, row.tiers ?? []);
  } catch {
    // Saved criteria were validated on the way in, so this means the row was edited by hand.
    log.warn('Ignoring achievement with invalid criteria', { achievement: row.key });
    return null;
  }
}

async function measureFor(criteria: AchievementCriteria, event: EventData): Promise<number> {
  if (isStreakCriteria(criteria)) {
    // The streak event carries the user's best run, which only ever grows.
    return Number(event.payload?.['longest'] ?? event.payload?.['current'] ?? 0);
  }
  const end = new Date(event.occurredAt);
  return measureAggregate({
    projectId: event.projectId,
    userId: event.userId as string,
    metric: criteria.metric,
    eventType: criteria.event,
    field: criteria.field,
    start: aggregateWindowStart(criteria.window, end),
    end,
  });
}

/**
 * Moves every achievement whose criteria this event can change, and grants the ones that reach
 * a new tier. Tiers only go up, so running an event again never gives anything twice.
 */
export async function processAchievementCriteriaForEvent(event: EventData): Promise<number> {
  if (!event.userId) return 0;
  const userId = event.userId;

  const candidates = await db
    .select()
    .from(achievements)
    .where(
      and(
        eq(achievements.projectId, event.projectId),
        eq(achievements.enabled, true),
        sql`${achievements.criteria} IS NOT NULL`
      )
    );

  let granted = 0;

  for (const achievement of candidates) {
    const parsed = parse(achievement);
    if (!parsed) continue;
    const { criteria, tiers } = parsed;

    if (criteriaTrigger(criteria) !== event.type) continue;
    if (isStreakCriteria(criteria) && event.payload?.['streak'] !== criteria.streak) continue;

    const value = await measureFor(criteria, event);

    await db.transaction(async (tx) => {
      await tx
        .insert(userAchievementProgress)
        .values({
          id: `uap_${crypto.randomUUID()}`,
          projectId: event.projectId,
          userId,
          achievementId: achievement.id,
        })
        .onConflictDoNothing();

      const [row] = await tx
        .select()
        .from(userAchievementProgress)
        .where(
          and(
            eq(userAchievementProgress.projectId, event.projectId),
            eq(userAchievementProgress.userId, userId),
            eq(userAchievementProgress.achievementId, achievement.id)
          )
        )
        .for('update');
      if (!row) return;

      // Rolling windows can fall again, so keep the best reading rather than the latest.
      const best = Math.max(row.value, value);
      const reached = Math.max(row.tier, tierReached(best, criteria, tiers));

      for (let tier = row.tier + 1; tier <= reached; tier++) {
        if (tier === 1) {
          await grantAchievement(tx, {
            projectId: event.projectId,
            userId,
            achievementKey: achievement.key,
            eventId: event.id,
            metadata: { tier: 1, value: best },
          });
        } else {
          const level = tiers[tier - 2] as AchievementTier;
          const data = {
            achievementId: achievement.id,
            achievementKey: achievement.key,
            achievementName: `${achievement.name} · ${level.name}`,
            iconUrl: achievement.iconUrl,
          };
          await createNotificationIntent(tx, {
            projectId: event.projectId,
            userId,
            type: 'achievement_unlocked',
            data,
            sourceType: 'achievement_tier',
            sourceId: `${achievement.id}:${userId}:${tier}`,
          });
          await createWebhookDelivery(tx, {
            projectId: event.projectId,
            eventId: `${achievement.id}:${userId}:${tier}`,
            eventType: 'achievement.unlocked',
            userId,
            data: { ...data, tier, tierName: level.name },
          });
          if (level.xp) {
            await awardXp(tx, {
              projectId: event.projectId,
              userId,
              amount: level.xp,
              reason: `${achievement.name}: ${level.name}`,
              eventId: event.id,
              idempotencyKey: `ach-tier:${achievement.id}:${tier}`,
              metadata: { achievementKey: achievement.key, tier },
            });
          }
        }
        granted++;
        log.info('Achievement tier reached', {
          eventId: event.id,
          projectId: event.projectId,
          achievement: achievement.key,
          tier,
        });
      }

      if (best !== row.value || reached !== row.tier) {
        await tx
          .update(userAchievementProgress)
          .set({ value: best, tier: reached, updatedAt: new Date() })
          .where(eq(userAchievementProgress.id, row.id));
      }
    });
  }

  return granted;
}
