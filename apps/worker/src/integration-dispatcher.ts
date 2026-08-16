import {
  db,
  integrationDeliveries,
  integrations,
  notifications,
  endUsers,
  serverConfigs,
  userXpBalances,
  levels,
} from '@gami/database';
import { registry } from '@gami/integrations';
import { and, eq, lte, sql } from 'drizzle-orm';

export interface DispatchIntegrationsResult {
  dispatched: number;
  completed: number;
  failed: number;
  retried: number;
}

/**
 * Checks platform-level global integration configuration in server_configs.
 */
export async function getGlobalIntegrationsConfig(): Promise<{
  enabled: boolean;
  discordEnabled: boolean;
}> {
  try {
    const [row] = await db
      .select()
      .from(serverConfigs)
      .where(eq(serverConfigs.key, 'integrations_config'));

    if (row && row.value) {
      const cfg = row.value as Record<string, unknown>;
      return {
        enabled: cfg.enabled !== false,
        discordEnabled: cfg.allowDiscordIntegration !== false,
      };
    }
  } catch {}

  return { enabled: true, discordEnabled: true };
}

/**
 * Dispatches pending external integration delivery intents (e.g. Discord).
 * Uses FOR UPDATE SKIP LOCKED for concurrent-worker safety.
 */
export async function dispatchPendingIntegrations(
  batchSize = 10
): Promise<DispatchIntegrationsResult> {
  const result: DispatchIntegrationsResult = {
    dispatched: 0,
    completed: 0,
    failed: 0,
    retried: 0,
  };

  // 1. Check Platform Admin Global Override
  const globalConfig = await getGlobalIntegrationsConfig();
  if (!globalConfig.enabled) {
    return result;
  }

  // 2. Fetch pending deliveries with row locking
  const now = new Date();
  const pendingDeliveries = await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(integrationDeliveries)
      .where(
        and(
          eq(integrationDeliveries.status, 'pending'),
          lte(integrationDeliveries.availableAt, now)
        )
      )
      .limit(batchSize)
      .for('update', { skipLocked: true });

    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    await tx
      .update(integrationDeliveries)
      .set({
        status: 'processing',
        processingAt: now,
        updatedAt: now,
      })
      .where(sql`${integrationDeliveries.id} IN ${ids}`);

    return rows;
  });

  if (pendingDeliveries.length === 0) {
    return result;
  }

  result.dispatched = pendingDeliveries.length;

  // 3. Process each delivery intent independently
  for (const delivery of pendingDeliveries) {
    try {
      // A. Fetch parent integration record
      const [intg] = await db
        .select()
        .from(integrations)
        .where(eq(integrations.id, delivery.integrationId));

      if (!intg || !intg.enabled || intg.status !== 'active') {
        await db
          .update(integrationDeliveries)
          .set({
            status: 'failed',
            lastError: 'Parent integration is disabled, non-active, or missing',
            updatedAt: new Date(),
          })
          .where(eq(integrationDeliveries.id, delivery.id));
        result.failed++;
        continue;
      }

      // Check global provider override (e.g. discord)
      if (intg.provider === 'discord' && !globalConfig.discordEnabled) {
        await db
          .update(integrationDeliveries)
          .set({
            status: 'pending',
            lastError: 'Discord provider is globally disabled by platform administrator',
            availableAt: new Date(Date.now() + 60000), // Retry in 1 min
            updatedAt: new Date(),
          })
          .where(eq(integrationDeliveries.id, delivery.id));
        result.retried++;
        continue;
      }

      // B. Fetch provider implementation from registry
      const provider = registry.get(intg.provider);
      if (!provider) {
        await db
          .update(integrationDeliveries)
          .set({
            status: 'failed',
            lastError: `Provider "${intg.provider}" is not registered on this server`,
            updatedAt: new Date(),
          })
          .where(eq(integrationDeliveries.id, delivery.id));
        result.failed++;
        continue;
      }

      // C. Fetch notification and user details
      let userName = 'User';
      let externalId = '';
      let targetUserId = delivery.projectId;
      let title = 'Gamification Event';
      let body = '';
      let metadata: Record<string, unknown> = {};

      if (delivery.notificationId) {
        const [notif] = await db
          .select()
          .from(notifications)
          .where(eq(notifications.id, delivery.notificationId));

        if (notif) {
          targetUserId = notif.userId;
          title = notif.title;
          body = notif.message;
          metadata = { ...((notif.data as Record<string, unknown>) || {}) };

          // Fetch end user details (name & externalId)
          const [u] = await db
            .select({ name: endUsers.name, externalId: endUsers.externalId })
            .from(endUsers)
            .where(
              and(
                eq(endUsers.projectId, delivery.projectId),
                eq(endUsers.id, notif.userId)
              )
            );

          if (u) {
            if (u.name) userName = u.name;
            if (u.externalId) externalId = u.externalId;
          }

          // Calculate current XP, current level, and level progress if missing
          try {
            const [xpBalance] = await db
              .select({ totalXp: userXpBalances.totalXp })
              .from(userXpBalances)
              .where(
                and(
                  eq(userXpBalances.projectId, delivery.projectId),
                  eq(userXpBalances.userId, notif.userId)
                )
              );

            const currentXp = xpBalance ? xpBalance.totalXp : 0;
            if (metadata.currentXp === undefined) metadata.currentXp = currentXp;

            const projectLevels = await db
              .select()
              .from(levels)
              .where(eq(levels.projectId, delivery.projectId));

            if (projectLevels.length > 0) {
              const activeLevels = projectLevels
                .filter((l) => l.enabled !== false)
                .sort((a, b) => a.level - b.level);

              let currLevel = activeLevels[0];
              let nextLevel = activeLevels[1];

              for (let i = 0; i < activeLevels.length; i++) {
                const lvl = activeLevels[i];
                if (lvl && currentXp >= lvl.requiredXp) {
                  currLevel = lvl;
                  nextLevel = activeLevels[i + 1];
                }
              }

              if (currLevel) {
                if (metadata.currentLevel === undefined) metadata.currentLevel = currLevel.level;
                if (!metadata.levelName) metadata.levelName = currLevel.name;
                if (nextLevel) {
                  const xpToNext = Math.max(0, nextLevel.requiredXp - currentXp);
                  const range = Math.max(1, nextLevel.requiredXp - currLevel.requiredXp);
                  const inRange = currentXp - currLevel.requiredXp;
                  const pct = Math.min(100, Math.max(0, Math.floor((inRange / range) * 100)));
                  if (metadata.xpToNextLevel === undefined) metadata.xpToNextLevel = xpToNext;
                  if (!metadata.progressPercent) metadata.progressPercent = `${pct}%`;
                } else {
                  if (metadata.xpToNextLevel === undefined) metadata.xpToNextLevel = 0;
                  if (!metadata.progressPercent) metadata.progressPercent = '100%';
                }
              }
            }
          } catch (err) {}
        }
      }

      // D. Send notification to external provider
      const deliveryResult = await provider.sendNotification(
        intg.config as Record<string, unknown>,
        {
          notificationId: delivery.notificationId || undefined,
          eventId: delivery.eventId || undefined,
          eventType: delivery.eventType,
          userId: targetUserId,
          userName,
          title,
          body,
          metadata: {
            ...metadata,
            externalId,
          },
          createdAt: delivery.createdAt ? delivery.createdAt.toISOString() : new Date().toISOString(),
        }
      );

      if (deliveryResult.success) {
        // Success: update status and last tested timestamp
        await db
          .update(integrationDeliveries)
          .set({
            status: 'completed',
            completedAt: new Date(),
            externalMessageId: deliveryResult.externalMessageId || null,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(integrationDeliveries.id, delivery.id));

        await db
          .update(integrations)
          .set({ lastTestedAt: new Date(), updatedAt: new Date() })
          .where(eq(integrations.id, intg.id));

        result.completed++;
      } else if (deliveryResult.retryable && delivery.attempts < 5) {
        // Retryable failure (e.g. rate limit, 5xx server error) -> exponential backoff
        const nextAttempts = delivery.attempts + 1;
        const delaySeconds = Math.pow(2, nextAttempts) * 10; // 20s, 40s, 80s...
        const availableAt = new Date(Date.now() + delaySeconds * 1000);

        await db
          .update(integrationDeliveries)
          .set({
            status: 'pending',
            attempts: nextAttempts,
            availableAt,
            lastError: deliveryResult.error || 'Delivery failed, retry queued',
            updatedAt: new Date(),
          })
          .where(eq(integrationDeliveries.id, delivery.id));

        result.retried++;
      } else {
        // Terminal failure
        await db
          .update(integrationDeliveries)
          .set({
            status: 'failed',
            lastError: deliveryResult.error || 'Terminal delivery failure',
            updatedAt: new Date(),
          })
          .where(eq(integrationDeliveries.id, delivery.id));

        await db
          .update(integrations)
          .set({
            lastError: deliveryResult.error || 'Last delivery attempt failed',
            updatedAt: new Date(),
          })
          .where(eq(integrations.id, intg.id));

        result.failed++;
      }
    } catch (err: unknown) {
      // System error processing delivery row
      const errorMsg = (err as Error).message;
      await db
        .update(integrationDeliveries)
        .set({
          status: 'failed',
          lastError: `Unexpected worker exception: ${errorMsg}`,
          updatedAt: new Date(),
        })
        .where(eq(integrationDeliveries.id, delivery.id));

      result.failed++;
    }
  }

  return result;
}
