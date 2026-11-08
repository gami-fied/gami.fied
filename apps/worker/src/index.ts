import { validateProductionConfig, createLogger } from '@gami/config';
import {
  getQueueConfig,
  getRedisConnection,
  recordWorkerActivity,
  startWorkerHeartbeat,
  stopWorkerHeartbeat,
} from '@gami/queue';
import { Worker } from 'bullmq';
import { registerPushProviders } from '@gami/integrations';
import { startLifecycle, stopLifecycle } from './lifecycle.js';
import { startMaintenance, stopMaintenance } from './maintenance.js';
import { startOutboxPoller, stopOutboxPoller } from './outbox-poller.js';
import { processEventJob } from './processor.js';
import { listPlugins, loadPlugins } from '@gami/rules';

const log = createLogger('Worker');

validateProductionConfig(process.env, { service: 'worker' });

// Plugins add rule actions. A plugin that cannot load stops start-up, so rules never fail quietly.
await loadPlugins();
if (listPlugins().plugins.length > 0) log.info('Loaded plugins', { plugins: listPlugins().plugins.map((plugin) => plugin.name) });

const cfg = getQueueConfig();
const connection = getRedisConnection();

// Start background outbox dispatcher poller automatically on worker startup
startOutboxPoller();
startWorkerHeartbeat();
registerPushProviders();
startMaintenance();
startLifecycle();

/** Jobs processed at once. Each holds a database connection while it works. */
const concurrency = Math.min(50, Math.max(1, Number(process.env['WORKER_CONCURRENCY']) || 4));

export const worker = new Worker<{ eventId: string; replay?: boolean }>(
  cfg.queueName,
  async (job) => {
    const { eventId, replay } = job.data;
    const jobLog = log.child({ jobId: job.id, eventId });
    jobLog.info('Job started', { replay: Boolean(replay), attempt: job.attemptsMade + 1 });
    const started = Date.now();
    const result = await processEventJob(eventId, { replay });
    recordWorkerActivity();
    jobLog.info('Job finished', { ...result, ms: Date.now() - started });
    return result;
  },
  { connection, concurrency }
);

worker.on('failed', (job, err) => {
  log.error('Job failed', { jobId: job?.id, eventId: job?.data?.eventId, attempt: job?.attemptsMade }, err);
});

log.info('Worker listening', { queue: cfg.queueName, concurrency });

/** Longest a shutdown waits for running work before giving up, so a stuck job can't block it. */
const SHUTDOWN_GRACE_MS = 30_000;

let shuttingDown = false;

const handleShutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info('Shutting down', { signal });

  const finish = (async () => {
    // Stop taking new work first, then let what is running finish.
    stopWorkerHeartbeat();
    await Promise.all([worker.close(), stopOutboxPoller(), stopMaintenance(), stopLifecycle()]);
    await connection.quit();
  })();
  const timeout = new Promise<'timeout'>((resolve) =>
    setTimeout(() => resolve('timeout'), SHUTDOWN_GRACE_MS).unref()
  );

  const outcome = await Promise.race([finish.then(() => 'done' as const), timeout]);
  if (outcome === 'timeout') {
    log.error('Work still running after the grace period, exiting anyway', {
      graceSeconds: SHUTDOWN_GRACE_MS / 1000,
    });
  }
  process.exit(outcome === 'done' ? 0 : 1);
};

process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
process.on('SIGINT', () => void handleShutdown('SIGINT'));
