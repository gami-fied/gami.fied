import { db } from '@gami/database';
import { and, asc, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

/** The columns shared by outboxes whose work happens outside the claiming transaction. */
type ClaimableOutbox = PgTable & {
  id: PgColumn;
  status: PgColumn;
  availableAt: PgColumn;
  processingAt: PgColumn;
  updatedAt: PgColumn;
};

/**
 * Claims due rows by moving them to `processing` before the transaction commits. Other workers
 * skip locked rows and then see the new status, so a row can only be claimed once. `available_at`
 * defaults to the database clock, so it is compared against that clock too.
 */
export async function claimDueRows<T extends ClaimableOutbox>(
  table: T,
  limit: number,
  forceNow?: Date
): Promise<T['$inferSelect'][]> {
  const claimedAt = forceNow ?? new Date();

  return await db.transaction(async (tx) => {
    const due = (await tx
      .select()
      .from(table as PgTable)
      .where(and(eq(table.status, 'pending'), lte(table.availableAt, forceNow ?? sql`now()`)))
      .orderBy(asc(table.availableAt), asc(table.id))
      .limit(limit)
      .for('update', { skipLocked: true })) as T['$inferSelect'][];

    if (due.length > 0) {
      const ids = due.map((row) => (row as { id: string }).id);
      await tx
        .update(table as PgTable)
        .set({ status: 'processing', processingAt: claimedAt, updatedAt: claimedAt } as never)
        .where(inArray(table.id, ids));
    }

    return due;
  });
}

/** Returns rows left in `processing` by a crashed worker. Attempts are unchanged. */
export async function reclaimStaleRows<T extends ClaimableOutbox>(
  table: T,
  staleAfterMs: number,
  now: Date = new Date()
): Promise<number> {
  const recovered = await db
    .update(table as PgTable)
    .set({ status: 'pending', processingAt: null, updatedAt: now } as never)
    .where(
      and(
        eq(table.status, 'processing'),
        lt(table.processingAt, new Date(now.getTime() - staleAfterMs))
      )
    )
    .returning({ id: table.id });
  return recovered.length;
}

/** min(cap, 2^attempts seconds) */
export function exponentialBackoffMs(attempts: number, capMs = 5 * 60 * 1000): number {
  return Math.min(capMs, 1000 * Math.pow(2, attempts));
}
