import { db, eventOutbox } from '@gami/database';
import { asc, eq, and, lte, sql } from 'drizzle-orm';
import { getEventQueue, getQueueConfig } from './index.js';

export const MAX_EVENT_OUTBOX_ATTEMPTS = 10;

export async function dispatchPendingOutboxEvents(limit = 50, forceNow?: Date): Promise<number> {
  const queue = getEventQueue();
  const cfg = getQueueConfig();
  // available_at defaults to the database clock, so compare against that clock too.
  const now = forceNow ?? sql`now()`;

  return await db.transaction(async (tx) => {
    // Row-level locking with FOR UPDATE SKIP LOCKED ensures multi-instance concurrency safety
    const pendingRecords = await tx
      .select()
      .from(eventOutbox)
      .where(and(eq(eventOutbox.status, 'pending'), lte(eventOutbox.availableAt, now)))
      .orderBy(asc(eventOutbox.availableAt), asc(eventOutbox.id))
      .limit(limit)
      .for('update', { skipLocked: true });

    let publishedCount = 0;

    for (const record of pendingRecords) {
      try {
        // A deterministic jobId prevents duplicate jobs. A replay needs its own, or BullMQ drops it.
        await queue.add(
          'process-event',
          { eventId: record.eventId, replay: record.replayId !== null },
          {
            jobId: record.replayId ? `${record.eventId}-${record.replayId}` : record.eventId,
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
            status: nextAttempts >= MAX_EVENT_OUTBOX_ATTEMPTS ? 'failed' : 'pending',
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
