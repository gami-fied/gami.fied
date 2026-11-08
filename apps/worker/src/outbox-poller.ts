import {
  challengeRewardOutbox,
  db,
  emailNotificationOutbox,
  eventOutbox,
  integrationDeliveries,
  notificationOutbox,
  webhookOutbox,
} from '@gami/database';
import { dispatchPendingOutboxEvents, getQueueConfig } from '@gami/queue';
import { and, eq, lte } from 'drizzle-orm';
import { dispatchPendingChallengeRewards } from './challenge-processor.js';
import { dispatchPendingEmailNotifications } from './email-notification-dispatcher.js';
import { dispatchPendingIntegrations } from './integration-dispatcher.js';
import { dispatchPendingNotifications } from './notification-dispatcher.js';
import { dispatchPendingWebhooks } from './webhook-dispatcher.js';
import { createLogger } from '@gami/config';

const log = createLogger('OutboxPoller');

/** Longest one delivery step may take, so a hung channel can't hold up the rest or shutdown. */
const stepTimeoutMs = () => Number(process.env['OUTBOX_STEP_TIMEOUT_MS']) || 60_000;

async function withStepTimeout<T>(name: string, run: () => Promise<T>): Promise<T> {
  const limit = stepTimeoutMs();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${name} took longer than ${limit}ms`)), limit);
  });
  try {
    return await Promise.race([run(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

let pollerTimer: NodeJS.Timeout | null = null;
let isPolling = false;
let inFlight: Promise<unknown> | null = null;

/** Whether an iteration is running right now. */
export function isOutboxPolling(): boolean {
  return isPolling;
}

/**
 * Reclaims records stuck in 'processing' status > 5 minutes back to 'pending'
 * across all outbox tables including integration_deliveries.
 */
export async function reclaimStaleOutboxRecords(staleThresholdMs = 5 * 60 * 1000): Promise<{
  staleEventsCount: number;
  staleChallengeRewardsCount: number;
  staleNotificationsCount: number;
  staleEmailNotificationsCount: number;
  staleWebhooksCount: number;
  staleIntegrationsCount: number;
}> {
  const cutoff = new Date(Date.now() - staleThresholdMs);

  let staleEventsCount = 0;
  let staleChallengeRewardsCount = 0;
  let staleNotificationsCount = 0;
  let staleEmailNotificationsCount = 0;
  let staleWebhooksCount = 0;
  let staleIntegrationsCount = 0;

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

    const resEmail = await db
      .update(emailNotificationOutbox)
      .set({ status: 'pending', processingAt: null, updatedAt: new Date() })
      .where(and(eq(emailNotificationOutbox.status, 'processing'), lte(emailNotificationOutbox.processingAt, cutoff)))
      .returning({ id: emailNotificationOutbox.id });
    staleEmailNotificationsCount = resEmail.length;

    const resWh = await db
      .update(webhookOutbox)
      .set({ status: 'pending', processingAt: null, updatedAt: new Date() })
      .where(and(eq(webhookOutbox.status, 'processing'), lte(webhookOutbox.processingAt, cutoff)))
      .returning({ id: webhookOutbox.id });
    staleWebhooksCount = resWh.length;

    const resIntg = await db
      .update(integrationDeliveries)
      .set({ status: 'pending', processingAt: null, updatedAt: new Date() })
      .where(and(eq(integrationDeliveries.status, 'processing'), lte(integrationDeliveries.processingAt, cutoff)))
      .returning({ id: integrationDeliveries.id });
    staleIntegrationsCount = resIntg.length;
  } catch (err: unknown) {
    log.error('Error reclaiming stale outbox records:', (err as Error).message || err);
  }

  return {
    staleEventsCount,
    staleChallengeRewardsCount,
    staleNotificationsCount,
    staleEmailNotificationsCount,
    staleWebhooksCount,
    staleIntegrationsCount,
  };
}

/**
 * Performs a single non-overlapping iteration of pending outboxes dispatch.
 */
export async function pollOutboxIteration(batchLimit = 50): Promise<{
  publishedEventsCount: number;
  completedChallengeRewardsCount: number;
  completedNotificationsCount: number;
  completedEmailNotificationsCount: number;
  deliveredWebhooksCount: number;
  completedIntegrationsCount: number;
}> {
  if (isPolling) {
    return {
      publishedEventsCount: 0,
      completedChallengeRewardsCount: 0,
      completedNotificationsCount: 0,
      completedEmailNotificationsCount: 0,
      deliveredWebhooksCount: 0,
      completedIntegrationsCount: 0,
    };
  }
  isPolling = true;

  let publishedEventsCount = 0;
  let completedChallengeRewardsCount = 0;
  let completedNotificationsCount = 0;
  let completedEmailNotificationsCount = 0;
  let deliveredWebhooksCount = 0;
  let completedIntegrationsCount = 0;

  try {
    // 0. Periodically reclaim stale processing records
    await reclaimStaleOutboxRecords();

    // 1. Dispatch pending outbox events to BullMQ
    publishedEventsCount = await withStepTimeout('event publishing', () =>
      dispatchPendingOutboxEvents(batchLimit)
    );
    if (publishedEventsCount > 0) {
      log.info(`Successfully dispatched ${publishedEventsCount} pending outbox event(s) to BullMQ.`
      );
    }
  } catch (err: unknown) {
    log.error('Error during event outbox dispatch iteration:',
      (err as Error).message || err
    );
  }

  try {
    // 2. Dispatch pending challenge rewards
    const croStats = await withStepTimeout('challenge rewards', () =>
      dispatchPendingChallengeRewards(batchLimit)
    );
    completedChallengeRewardsCount = croStats.completedCount;
    if (croStats.completedCount > 0) {
      log.info(`Successfully completed ${croStats.completedCount} challenge reward outbox record(s).`
      );
    }
  } catch (err: unknown) {
    log.error('Error during challenge reward outbox dispatch iteration:',
      (err as Error).message || err
    );
  }

  try {
    // 3. Dispatch pending in-app notifications
    const stats = await withStepTimeout('notifications', () =>
      dispatchPendingNotifications(batchLimit)
    );
    completedNotificationsCount = stats.completedCount;
    if (stats.completedCount > 0) {
      log.info(`Successfully dispatched ${stats.completedCount} in-app notification(s).`
      );
    }
  } catch (err: unknown) {
    log.error('Error during notification outbox dispatch iteration:',
      (err as Error).message || err
    );
  }

  try {
    // 4. Dispatch pending email notifications
    const emailStats = await withStepTimeout('email', () =>
      dispatchPendingEmailNotifications(batchLimit)
    );
    completedEmailNotificationsCount = emailStats.completedCount;
    if (emailStats.completedCount > 0) {
      log.info(`Successfully dispatched ${emailStats.completedCount} email notification(s).`
      );
    }
  } catch (err: unknown) {
    log.error('Error during email notification outbox dispatch iteration:',
      (err as Error).message || err
    );
  }

  try {
    // 5. Dispatch pending external webhooks
    const whStats = await withStepTimeout('webhooks', () =>
      dispatchPendingWebhooks(batchLimit)
    );
    deliveredWebhooksCount = whStats.deliveredCount;
    if (whStats.deliveredCount > 0) {
      log.info(`Successfully delivered ${whStats.deliveredCount} webhook(s).`
      );
    }
  } catch (err: unknown) {
    log.error('Error during webhook outbox dispatch iteration:',
      (err as Error).message || err
    );
  }

  try {
    // 6. Dispatch pending external integration deliveries (e.g. Discord)
    const intgStats = await withStepTimeout('integrations', () =>
      dispatchPendingIntegrations(batchLimit)
    );
    completedIntegrationsCount = intgStats.completed;
    if (intgStats.completed > 0) {
      log.info(`Successfully completed ${intgStats.completed} integration delivery(ies).`
      );
    }
  } catch (err: unknown) {
    log.error('Error during integration delivery dispatch iteration:',
      (err as Error).message || err
    );
  } finally {
    isPolling = false;
  }

  return {
    publishedEventsCount,
    completedChallengeRewardsCount,
    completedNotificationsCount,
    completedEmailNotificationsCount,
    deliveredWebhooksCount,
    completedIntegrationsCount,
  };
}

/**
 * Starts the background outbox polling loop automatically when worker starts.
 */
export function startOutboxPoller(intervalMs?: number, batchLimit = 50): void {
  if (pollerTimer) {
    return;
  }

  const queueConfig = getQueueConfig() as unknown as Record<string, unknown>;
  const effectiveInterval = intervalMs || (queueConfig.pollIntervalMs as number) || 2000;

  pollerTimer = setInterval(() => {
    // A tick that finds a poll still running must not replace the one shutdown has to wait for.
    if (isPolling) return;
    const run = pollOutboxIteration(batchLimit).finally(() => {
      if (inFlight === run) inFlight = null;
    });
    inFlight = run;
  }, effectiveInterval);

  log.info(`Outbox polling started (interval: ${effectiveInterval}ms).`);
}

/**
 * Stops the polling loop, then waits for an iteration that is already running, so shutdown
 * doesn't cut a batch of deliveries in half.
 */
export async function stopOutboxPoller(): Promise<void> {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
    log.info('Outbox polling stopped.');
  }
  await inFlight?.catch(() => undefined);
}
