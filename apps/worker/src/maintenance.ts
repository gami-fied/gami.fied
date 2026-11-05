import {
  challengeRewardOutbox,
  db,
  emailNotificationOutbox,
  eventOutbox,
  events,
  getPlatformSettings,
  integrationDeliveries,
  notificationOutbox,
  notifications,
  ruleExecutions,
  webhookOutbox,
} from '@gami/database';
import { getRedisConnection } from '@gami/queue';
import { and, inArray, lt, notInArray, type SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAINTENANCE_LOCK_KEY = 'maintenance:retention:lock';
const DELETE_BATCH_SIZE = 5000;
const OPEN_STATUSES = ['pending', 'processing'];
const DAY_MS = 24 * 60 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

/** Deletes in small batches, so a large backlog never holds long locks. */
async function deleteInBatches(
  table: PgTable & { id: PgColumn },
  condition: SQL | undefined
): Promise<number> {
  let total = 0;
  for (;;) {
    const ids = (await db
      .select({ id: table.id })
      .from(table as PgTable)
      .where(condition)
      .limit(DELETE_BATCH_SIZE)) as { id: string }[];
    if (ids.length === 0) return total;

    await db.delete(table as PgTable).where(
      inArray(
        table.id,
        ids.map((row) => row.id)
      )
    );
    total += ids.length;
    if (ids.length < DELETE_BATCH_SIZE) return total;
  }
}

/** Removes data past its retention period. Anything still in progress is never touched. */
export async function pruneExpiredData(now: Date = new Date()): Promise<Record<string, number>> {
  const { outboxDays, ruleExecutionDays, notificationDays, eventDays } =
    await getPlatformSettings('retention');
  const before = (days: number) => new Date(now.getTime() - days * DAY_MS);
  const deleted: Record<string, number> = {};

  const outboxes = {
    webhookOutbox,
    integrationDeliveries,
    emailNotificationOutbox,
    notificationOutbox,
    eventOutbox,
    challengeRewardOutbox,
  };
  for (const [name, table] of Object.entries(outboxes)) {
    deleted[name] = await deleteInBatches(
      table,
      and(notInArray(table.status, OPEN_STATUSES), lt(table.updatedAt, before(outboxDays)))
    );
  }

  if (ruleExecutionDays > 0) {
    deleted.ruleExecutions = await deleteInBatches(
      ruleExecutions,
      lt(ruleExecutions.createdAt, before(ruleExecutionDays))
    );
  }
  if (notificationDays > 0) {
    deleted.notifications = await deleteInBatches(
      notifications,
      lt(notifications.createdAt, before(notificationDays))
    );
  }
  if (eventDays > 0) {
    deleted.events = await deleteInBatches(events, lt(events.createdAt, before(eventDays)));
  }

  return deleted;
}

async function runMaintenance(): Promise<void> {
  try {
    // With several workers, only the one holding this lock does the pruning.
    const lockSeconds = Math.floor(MAINTENANCE_INTERVAL_MS / 1000) - 60;
    const acquired = await getRedisConnection().set(
      MAINTENANCE_LOCK_KEY,
      '1',
      'EX',
      lockSeconds,
      'NX'
    );
    if (!acquired) return;

    const deleted = await pruneExpiredData();
    console.log('[Maintenance] Retention pass complete:', deleted);
  } catch (err: unknown) {
    console.error('[Maintenance] Retention pass failed:', (err as Error).message || err);
  }
}

export function startMaintenance(): void {
  if (timer) return;
  void runMaintenance();
  timer = setInterval(() => void runMaintenance(), MAINTENANCE_INTERVAL_MS);
}

export function stopMaintenance(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
