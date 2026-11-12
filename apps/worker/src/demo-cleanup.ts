/**
 * Deletes live demos once they expire, with everything in them and the visitors' accounts. Runs
 * only on a demo instance (`GAMI_DEMO_MODE=true`). Each pass also catches anything a stopped
 * worker left behind, so leftovers never outlive a day.
 */
import { createLogger, demoSettings } from '@gami/config';
import { deleteExpiredDemos } from '@gami/database';
import { getRedisConnection } from '@gami/queue';

const log = createLogger('DemoCleanup');

const INTERVAL_MS = 10 * 60 * 1000;
const LOCK_KEY = 'demo:cleanup:lock';

let timer: NodeJS.Timeout | null = null;
let running: Promise<void> | null = null;

/** One pass: deletes expired demos in batches until none are left. */
export async function cleanUpExpiredDemos(now: Date = new Date()): Promise<number> {
  let total = 0;
  for (let removed = await deleteExpiredDemos(now); removed > 0; removed = await deleteExpiredDemos(now)) total += removed;
  return total;
}

async function runOnce(): Promise<void> {
  try {
    // With several workers, only the one holding the lock deletes.
    const acquired = await getRedisConnection().set(LOCK_KEY, '1', 'EX', Math.floor(INTERVAL_MS / 1000) - 30, 'NX');
    if (!acquired) return;
    const removed = await cleanUpExpiredDemos();
    if (removed) log.info('Deleted expired demos', { removed });
  } catch (err) {
    log.error('Demo cleanup failed', { message: (err as Error).message });
  }
}

export function startDemoCleanup(): boolean {
  if (timer || !demoSettings().enabled) return false;
  const tick = () => {
    if (running) return;
    running = runOnce().finally(() => {
      running = null;
    });
  };
  tick();
  timer = setInterval(tick, INTERVAL_MS);
  return true;
}

export async function stopDemoCleanup(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = null;
  await running;
}
