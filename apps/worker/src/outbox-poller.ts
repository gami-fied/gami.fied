import {
  challengeRewardOutbox,
  db,
  eventOutbox,
  notificationOutbox,
  webhookOutbox,
} from '@gami/database';
import { dispatchPendingOutboxEvents, getQueueConfig } from '@gami/queue';
import { and, eq, lte } from 'drizzle-orm';
import { dispatchPendingChallengeRewards } from './challenge-processor.js';
import { dispatchPendingNotifications } from './notification-dispatcher.js';
import { dispatchPendingWebhooks } from './webhook-dispatcher.js';

let pollerTimer: NodeJS.Timeout | null = null;
let isPolling = false;

/**
 * Reclaims records stuck in 'processing' status > 5 minutes back to 'pending'
 * across all 4 outbox tables (event_outbox, challenge_reward_outbox, notification_outbox, webhook_outbox).
 */
export async function reclaimStaleOutboxRecords(staleThresholdMs = 5 * 60 * 1000): Promise<{
  staleEventsCount: number;
  staleChallengeRewardsCount: number;
  staleNotificationsCount: number;
  staleWebhooksCount: number;
}> {
  const cutoff = new Date(Date.now() - staleThresholdMs);

  let staleEventsCount = 0;
  let staleChallengeRewardsCount = 0;
  let staleNotificationsCount = 0;
  let staleWebhooksCount = 0;

  try {
    const resEvents = await db
      .update(eventOutbox)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(and(eq(eventOutbox.status, 'processing'), lte(eventOutbox.updatedAt, cutoff)))
      .returning({ id: eventOutbox.id });
    staleEventsCount = resEvents.length;

    const resCro = await db
      .update(challengeRewardOutbox)
      .set({ status: 'pending', updatedAt: new Date() })
      .where(and(eq(challengeRewardOutbox.status, 'processing'), lte(challengeRewardOutbox.updatedAt, cutoff)))
      .returning({ id: challengeRewardOutbox.id });
    staleChallengeRewardsCount = resCro.length;

    const resNotif = await db
      .update(notificationOutbox)
      .set({ status: 'pending', processingAt: null, updatedAt: new Date() })
      .where(and(eq(notificationOutbox.status, 'processing'), lte(notificationOutbox.processingAt, cutoff)))
      .returning({ id: notificationOutbox.id });
    staleNotificationsCount = resNotif.length;

    const resWh = await db
      .update(webhookOutbox)
      .set({ status: 'pending', processingAt: null, updatedAt: new Date() })
      .where(and(eq(webhookOutbox.status, 'processing'), lte(webhookOutbox.processingAt, cutoff)))
      .returning({ id: webhookOutbox.id });
    staleWebhooksCount = resWh.length;
  } catch (err: unknown) {
    console.error('[OutboxPoller] Error reclaiming stale outbox records:', (err as Error).message || err);
  }

  return {
    staleEventsCount,
    staleChallengeRewardsCount,
    staleNotificationsCount,
    staleWebhooksCount,
  };
}

/**
 * Performs a single non-overlapping iteration of pending outboxes dispatch.
 */
export async function pollOutboxIteration(batchLimit = 50): Promise<{
  publishedEventsCount: number;
  completedChallengeRewardsCount: number;
  completedNotificationsCount: number;
  deliveredWebhooksCount: number;
}> {
  if (isPolling) {
    return {
      publishedEventsCount: 0,
      completedChallengeRewardsCount: 0,
      completedNotificationsCount: 0,
      deliveredWebhooksCount: 0,
    };
  }
  isPolling = true;

  let publishedEventsCount = 0;
  let completedChallengeRewardsCount = 0;
  let completedNotificationsCount = 0;
  let deliveredWebhooksCount = 0;

  try {
    // 0. Periodically reclaim stale processing records
    await reclaimStaleOutboxRecords();

    // 1. Dispatch pending outbox events to BullMQ
    publishedEventsCount = await dispatchPendingOutboxEvents(batchLimit);
    if (publishedEventsCount > 0) {
      console.log(
        `[OutboxPoller] Successfully dispatched ${publishedEventsCount} pending outbox event(s) to BullMQ.`
      );
    }
  } catch (err: unknown) {
    console.error(
      '[OutboxPoller] Error during event outbox dispatch iteration:',
      (err as Error).message || err
    );
  }

  try {
    // 2. Dispatch pending challenge rewards
    const croStats = await dispatchPendingChallengeRewards(batchLimit);
    completedChallengeRewardsCount = croStats.completedCount;
    if (croStats.completedCount > 0) {
      console.log(
        `[OutboxPoller] Successfully completed ${croStats.completedCount} challenge reward outbox record(s).`
      );
    }
  } catch (err: unknown) {
    console.error(
      '[OutboxPoller] Error during challenge reward outbox dispatch iteration:',
      (err as Error).message || err
    );
  }

  try {
    // 3. Dispatch pending in-app notifications
    const stats = await dispatchPendingNotifications(batchLimit);
    completedNotificationsCount = stats.completedCount;
    if (stats.completedCount > 0) {
      console.log(
        `[OutboxPoller] Successfully dispatched ${stats.completedCount} in-app notification(s).`
      );
    }
  } catch (err: unknown) {
    console.error(
      '[OutboxPoller] Error during notification outbox dispatch iteration:',
      (err as Error).message || err
    );
  }

  try {
    // 4. Dispatch pending external webhooks
    const whStats = await dispatchPendingWebhooks(batchLimit);
    deliveredWebhooksCount = whStats.deliveredCount;
    if (whStats.deliveredCount > 0) {
      console.log(
        `[OutboxPoller] Successfully delivered ${whStats.deliveredCount} webhook(s).`
      );
    }
  } catch (err: unknown) {
    console.error(
      '[OutboxPoller] Error during webhook outbox dispatch iteration:',
      (err as Error).message || err
    );
  } finally {
    isPolling = false;
  }

  return {
    publishedEventsCount,
    completedChallengeRewardsCount,
    completedNotificationsCount,
    deliveredWebhooksCount,
  };
}

/**
 * Starts the background outbox polling loop automatically when worker starts.
 */
export function startOutboxPoller(intervalMs?: number, batchLimit = 50): void {
  if (pollerTimer) {
    return;
  }

  const cfg = getQueueConfig();
  const pollInterval = intervalMs ?? cfg.outboxPollIntervalMs ?? 1000;

  console.log(
    `🚀 [OutboxPoller] Starting background outbox dispatcher poller (interval: ${pollInterval}ms, batchSize: ${batchLimit})...`
  );

  // Immediate first tick
  pollOutboxIteration(batchLimit).catch((err) => {
    console.error('[OutboxPoller] Error in initial outbox dispatch tick:', err);
  });

  // Recurring polling interval
  pollerTimer = setInterval(() => {
    pollOutboxIteration(batchLimit).catch((err) => {
      console.error('[OutboxPoller] Error in recurring outbox dispatch tick:', err);
    });
  }, pollInterval);
}

/**
 * Gracefully stops the background outbox polling loop during worker shutdown.
 */
export function stopOutboxPoller(): void {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    console.log('[OutboxPoller] Background outbox poller stopped.');
  }
}
