export interface QueueConfig {
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  queueName: string;
  attempts: number;
  backoffDelay: number;
  removeOnComplete: number | boolean;
  removeOnFail: number | boolean;
  outboxPollIntervalMs: number;
}

export function getQueueConfig(): QueueConfig {
  const isTest = process.env['NODE_ENV'] === 'test' || Boolean(process.env['VITEST']);
  const defaultQueueName = isTest ? 'gami-events-test' : 'gami-events';

  let redisHost = process.env['REDIS_HOST'] || 'localhost';
  let redisPort = Number(process.env['REDIS_PORT']) || 6379;
  let redisPassword = process.env['REDIS_PASSWORD'] || undefined;

  if (process.env['REDIS_URL']) {
    try {
      const parsed = new URL(process.env['REDIS_URL']);
      redisHost = parsed.hostname || redisHost;
      if (parsed.port) redisPort = Number(parsed.port);
      if (parsed.password) redisPassword = decodeURIComponent(parsed.password);
    } catch {
      // Fallback to individual variables if URL parsing fails
    }
  }

  return {
    redisHost,
    redisPort,
    redisPassword,
    queueName: process.env['BULLMQ_QUEUE_NAME'] || defaultQueueName,
    attempts: Number(process.env['BULLMQ_ATTEMPTS']) || 3,
    backoffDelay: Number(process.env['BULLMQ_BACKOFF_DELAY']) || 1000,
    removeOnComplete: Number(process.env['BULLMQ_REMOVE_ON_COMPLETE']) || 1000,
    removeOnFail: Number(process.env['BULLMQ_REMOVE_ON_FAIL']) || 5000,
    outboxPollIntervalMs: Number(process.env['OUTBOX_POLL_INTERVAL_MS']) || 1000,
  };
}
