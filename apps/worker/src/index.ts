import { validateProductionConfig } from '@gami/config';
import {
  getQueueConfig,
  getRedisConnection,
  recordWorkerActivity,
  startWorkerHeartbeat,
  stopWorkerHeartbeat,
} from '@gami/queue';
import { Worker } from 'bullmq';
import { startMaintenance, stopMaintenance } from './maintenance.js';
import { startOutboxPoller, stopOutboxPoller } from './outbox-poller.js';
import { processEventJob } from './processor.js';

validateProductionConfig(process.env, { service: 'worker' });

const cfg = getQueueConfig();
const connection = getRedisConnection();

// Start background outbox dispatcher poller automatically on worker startup
startOutboxPoller();
startWorkerHeartbeat();
startMaintenance();

export const worker = new Worker<{ eventId: string; replay?: boolean }>(
  cfg.queueName,
  async (job) => {
    const { eventId, replay } = job.data;
    console.log(`[Worker] Processing BullMQ job ${job.id} for event ${eventId}`);
    const result = await processEventJob(eventId, { replay });
    recordWorkerActivity();
    console.log(`[Worker] Finished processing event ${eventId}:`, result);
    return result;
  },
  { connection }
);

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed with error:`, err);
});

console.log(`🚀 [Worker] Event Worker listening on queue: ${cfg.queueName}`);

const handleShutdown = async (signal: string) => {
  console.log(`[Worker] Gracefully closing worker on ${signal}...`);
  stopOutboxPoller();
  stopWorkerHeartbeat();
  stopMaintenance();
  await worker.close();
  await connection.quit();
  process.exit(0);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));
