import { db, notificationOutbox, notifications } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { claimDueRows, exponentialBackoffMs, reclaimStaleRows } from './outbox.js';

export const MAX_NOTIFICATION_OUTBOX_ATTEMPTS = 10;
export const STALE_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export interface DispatcherStats {
  processedCount: number;
  completedCount: number;
  failedCount: number;
  recoveredCount: number;
}

/**
 * Dispatches pending and stale notification outbox records.
 * Uses SELECT ... FOR UPDATE SKIP LOCKED for concurrent-safe multi-worker execution.
 * Explicitly supports crash recovery via processingAt and bounded retries (max 10 attempts).
 */
export async function dispatchPendingNotifications(
  limit = 50,
  forceNow?: Date
): Promise<DispatcherStats> {
  const now = forceNow || new Date();

  // 1. Reclaim stale processing records (crash recovery)
  const recoveredCount = await reclaimStaleRows(
    notificationOutbox,
    STALE_PROCESSING_THRESHOLD_MS,
    now
  );

  // 2. Claim due records
  const candidateRecords = await claimDueRows(notificationOutbox, limit, forceNow);

  let completedCount = 0;
  let failedCount = 0;

  for (const record of candidateRecords) {
    try {
      // In-app delivery verification: verify notification exists in database
      const [targetNotification] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.id, record.notificationId),
            eq(notifications.projectId, record.projectId)
          )
        );

      if (!targetNotification) {
        throw new Error(
          `Notification ${record.notificationId} not found for project ${record.projectId}`
        );
      }

      // Complete outbox entry atomically
      await db
        .update(notificationOutbox)
        .set({
          status: 'completed',
          processingAt: null,
          updatedAt: now,
        })
        .where(eq(notificationOutbox.id, record.id));

      completedCount++;
    } catch (err: unknown) {
      failedCount++;
      const errorMsg = (err as Error).message || 'Failed to dispatch notification';
      const nextAttempts = record.attempts + 1;

      if (nextAttempts >= MAX_NOTIFICATION_OUTBOX_ATTEMPTS) {
        // Bounded retry exceeded -> mark failed
        await db
          .update(notificationOutbox)
          .set({
            status: 'failed',
            attempts: nextAttempts,
            processingAt: null,
            lastError: `Max retries (${MAX_NOTIFICATION_OUTBOX_ATTEMPTS}) exceeded: ${errorMsg}`,
            updatedAt: now,
          })
          .where(eq(notificationOutbox.id, record.id));
      } else {
        const nextAvailable = new Date(now.getTime() + exponentialBackoffMs(nextAttempts));

        await db
          .update(notificationOutbox)
          .set({
            status: 'pending',
            attempts: nextAttempts,
            processingAt: null,
            availableAt: nextAvailable,
            lastError: errorMsg,
            updatedAt: now,
          })
          .where(eq(notificationOutbox.id, record.id));
      }
    }
  }

  return {
    processedCount: candidateRecords.length,
    completedCount,
    failedCount,
    recoveredCount,
  };
}
