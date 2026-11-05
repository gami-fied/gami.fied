import { db, getPlatformSettings, platformBackups } from '@gami/database';
import { getRedisConnection } from '@gami/queue';
import { and, desc, eq } from 'drizzle-orm';
import { createPlatformBackup, deletePlatformBackup } from './backup-service.js';

const CHECK_INTERVAL_MS = 15 * 60 * 1000;
const SCHEDULER_ACTOR = 'backup-scheduler';

let timer: NodeJS.Timeout | null = null;

/** Takes a backup if one is due, and removes scheduled backups beyond the keep count. */
export async function runScheduledBackup(now: Date = new Date()): Promise<boolean> {
  const { backupIntervalHours, backupKeepCount } = await getPlatformSettings('retention');
  if (backupIntervalHours === 0) return false;

  const scheduled = await db
    .select({ id: platformBackups.id, createdAt: platformBackups.createdAt })
    .from(platformBackups)
    .where(and(eq(platformBackups.backupType, 'scheduled'), eq(platformBackups.status, 'available')))
    .orderBy(desc(platformBackups.createdAt));

  const intervalMs = backupIntervalHours * 60 * 60 * 1000;
  const latest = scheduled[0]?.createdAt.getTime() ?? 0;
  if (now.getTime() - latest < intervalMs) return false;

  // With several API instances, only the one holding this lock takes the backup.
  const acquired = await getRedisConnection().set('backup:scheduled:lock', '1', 'EX', 3600, 'NX');
  if (!acquired) return false;

  try {
    await createPlatformBackup({ actorId: SCHEDULER_ACTOR, backupType: 'scheduled' });

    for (const old of scheduled.slice(Math.max(0, backupKeepCount - 1))) {
      await deletePlatformBackup(old.id, SCHEDULER_ACTOR);
    }
    return true;
  } finally {
    await getRedisConnection().del('backup:scheduled:lock');
  }
}

export function startBackupScheduler(): void {
  if (timer) return;
  timer = setInterval(() => {
    runScheduledBackup().catch((err: unknown) => {
      console.error('[Backups] Scheduled backup failed:', (err as Error).message || err);
    });
  }, CHECK_INTERVAL_MS);
  timer.unref();
}
