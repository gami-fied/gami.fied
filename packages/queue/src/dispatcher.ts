import { db, eventOutbox } from '@gami/database';
import { eq, and, lte } from 'drizzle-orm';
import { getEventQueue, getQueueConfig } from './index.js';

export async function dispatchPendingOutboxEvents(limit = 50, forceNow?: Date): Promise<number> {
  const queue = getEventQueue();
  const cfg = getQueueConfig();
  // Buffer to account for DB timestamp clock precision and retries
  const now = forceNow || new Date(Date.now() + 60000);

  return await db.transaction(async (tx) => {
    // Row-level locking with FOR UPDATE SKIP LOCKED ensures multi-instance concurrency safety
    const pendingRecords = await tx
      .select()
      .from(eventOutbox)
      .where(and(eq(eventOutbox.status, 'pending'), lte(eventOutbox.availableAt, now)))
      .limit(limit)
      .for('update', { skipLocked: true });

    let publishedCount = 0;

    for (const record of pendingRecords) {
      try {
        // Deterministic jobId = record.eventId to prevent duplicate queue jobs
        await queue.add(
          'process-event',
          { eventId: record.eventId },
          {
            jobId: record.eventId,
            attempts: cfg.attempts,
            backoff: {
              type: 'exponential',
              delay: cfg.backoffDelay,
            },
            removeOnComplete: cfg.removeOnComplete,
            removeOnFail: cfg.removeOnFail,
          }
        );

        await tx
          .update(eventOutbox)
          .set({
            status: 'published',
            publishedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(eventOutbox.id, record.id));

        publishedCount++;
      } catch (err: unknown) {
        const errorMsg = (err as Error).message || 'Failed to dispatch to Redis queue';
        const nextAttempts = record.attempts + 1;
        const backoffMs = Math.min(60000, 1000 * Math.pow(2, nextAttempts));
        const nextAvailable = new Date(Date.now() + backoffMs);

        await tx
          .update(eventOutbox)
          .set({
            attempts: nextAttempts,
            lastError: errorMsg,
            availableAt: nextAvailable,
            updatedAt: new Date(),
          })
          .where(eq(eventOutbox.id, record.id));
      }
    }

    return publishedCount;
  });
}
