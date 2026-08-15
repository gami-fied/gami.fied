import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { getQueueConfig } from './config.js';

let redisClient: Redis | null = null;
let eventQueue: Queue | null = null;

export function getRedisConnection(): Redis {
  if (!redisClient) {
    const cfg = getQueueConfig();
    redisClient = new Redis({
      host: cfg.redisHost,
      port: cfg.redisPort,
      password: cfg.redisPassword,
      maxRetriesPerRequest: null,
      enableOfflineQueue: false, // Fail fast if Redis is down for fail-open rate limiting
    });
  }
  return redisClient;
}

export function getEventQueue(): Queue {
  if (!eventQueue) {
    const cfg = getQueueConfig();
    const connection = getRedisConnection();
    eventQueue = new Queue(cfg.queueName, { connection });
  }
  return eventQueue;
}

export async function checkRedisHealth(): Promise<boolean> {
  try {
    const client = getRedisConnection();
    const result = await client.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

export async function getBullMQQueueMetrics(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  try {
    const queue = getEventQueue();
    const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
    return {
      waiting: counts.waiting || 0,
      active: counts.active || 0,
      completed: counts.completed || 0,
      failed: counts.failed || 0,
      delayed: counts.delayed || 0,
    };
  } catch {
    return { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 };
  }
}

export async function clearQueue(): Promise<void> {
  const queue = getEventQueue();
  await queue.obliterate({ force: true });
}

export async function closeQueueConnections(): Promise<void> {
  if (eventQueue) {
    await eventQueue.close();
    eventQueue = null;
  }
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
