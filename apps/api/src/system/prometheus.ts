import { timingSafeEqual } from 'crypto';
import { product } from '@gami/config';
import { checkDatabaseHealth, db } from '@gami/database';
import { checkRedisHealth, getBullMQQueueMetrics, getWorkerHeartbeatStatus } from '@gami/queue';
import { sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { requirePlatformAdmin } from '../authorization/index.js';
import { processMetrics } from './metrics-collector.js';

/** Tables that hold work waiting to be delivered, and the name each one gets in metrics. */
const QUEUES = [
  ['event', 'event_outbox'],
  ['challenge_reward', 'challenge_reward_outbox'],
  ['notification', 'notification_outbox'],
  ['email', 'email_notification_outbox'],
  ['webhook', 'webhook_outbox'],
  ['integration', 'integration_deliveries'],
] as const;

const CACHE_MS = 5_000;
const PROBE_TIMEOUT_MS = 3_000;

/** A slow dependency counts as down for this scrape instead of holding up the response. */
async function within<T>(work: Promise<T>, fallback: T): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
let cached: { at: number; text: string } | null = null;

interface Sample {
  name: string;
  labels?: Record<string, string>;
  value: number;
}

const escapeLabel = (value: string) =>
  value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"');

function format(samples: Sample[], help: Record<string, [type: string, text: string]>): string {
  const lines: string[] = [];
  const described = new Set<string>();

  for (const sample of samples) {
    if (!described.has(sample.name)) {
      described.add(sample.name);
      const [type, text] = help[sample.name] ?? ['gauge', sample.name];
      lines.push(`# HELP ${sample.name} ${text}`, `# TYPE ${sample.name} ${type}`);
    }
    const labels = sample.labels
      ? `{${Object.entries(sample.labels)
          .map(([key, value]) => `${key}="${escapeLabel(value)}"`)
          .join(',')}}`
      : '';
    lines.push(`${sample.name}${labels} ${Number.isFinite(sample.value) ? sample.value : 0}`);
  }
  return `${lines.join('\n')}\n`;
}

type QueueRow = {
  queue: string;
  status: string;
  total: number;
  oldestSeconds: number | null;
};

/** One query per scrape. Only the states someone has to act on are counted, so it stays cheap. */
async function readQueues(): Promise<QueueRow[]> {
  const parts = QUEUES.map(
    ([name, table]) => sql`
      SELECT ${name}::text AS queue, status, COUNT(*)::int AS total,
             EXTRACT(EPOCH FROM now() - MIN(available_at))::float AS "oldestSeconds"
      FROM ${sql.raw(table)}
      WHERE status IN ('pending', 'processing', 'failed')
      GROUP BY status`
  );
  const result = await db.execute<QueueRow>(sql.join(parts, sql` UNION ALL `));
  return (Array.isArray(result) ? result : ((result as unknown as { rows: QueueRow[] }).rows ?? [])) as QueueRow[];
}

const HELP: Record<string, [string, string]> = {
  gami_info: ['gauge', 'Version of this server. Always 1.'],
  gami_database_up: ['gauge', '1 if PostgreSQL answers, otherwise 0.'],
  gami_redis_up: ['gauge', '1 if Redis answers, otherwise 0.'],
  gami_worker_up: ['gauge', '1 if a worker has sent a recent heartbeat, otherwise 0.'],
  gami_worker_heartbeat_age_seconds: ['gauge', 'Seconds since the last worker heartbeat.'],
  gami_outbox_rows: ['gauge', 'Rows waiting or failed in each delivery queue.'],
  gami_outbox_oldest_pending_seconds: ['gauge', 'How long the oldest pending row has been waiting, per queue.'],
  gami_bullmq_jobs: ['gauge', 'Event jobs in each BullMQ state.'],
  gami_http_requests_total: ['counter', 'HTTP requests handled since this API process started.'],
  gami_http_request_errors_total: ['counter', 'HTTP responses with a status of 400 or more.'],
  gami_http_request_duration_seconds_sum: ['counter', 'Total time spent handling requests.'],
  gami_http_request_duration_seconds_count: ['counter', 'Number of requests timed.'],
  gami_process_uptime_seconds: ['gauge', 'Seconds since this API process started.'],
  gami_process_resident_memory_bytes: ['gauge', 'Memory used by this API process.'],
  gami_process_heap_used_bytes: ['gauge', 'JavaScript heap used by this API process.'],
};

export async function renderPrometheusMetrics(): Promise<string> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.text;

  const [dbUp, redisUp, worker, queue, queueRows] = await Promise.all([
    within(checkDatabaseHealth(), false),
    within(checkRedisHealth(), false),
    within(getWorkerHeartbeatStatus(), { alive: false, heartbeat: null } as Awaited<ReturnType<typeof getWorkerHeartbeatStatus>>),
    within(getBullMQQueueMetrics(), {} as Awaited<ReturnType<typeof getBullMQQueueMetrics>>),
    within(readQueues(), [] as QueueRow[]),
  ]);

  const samples: Sample[] = [
    { name: 'gami_info', labels: { version: product.version }, value: 1 },
    { name: 'gami_database_up', value: dbUp ? 1 : 0 },
    { name: 'gami_redis_up', value: redisUp ? 1 : 0 },
    { name: 'gami_worker_up', value: worker.alive ? 1 : 0 },
  ];

  if (worker.heartbeat) {
    samples.push({
      name: 'gami_worker_heartbeat_age_seconds',
      value: (Date.now() - new Date(worker.heartbeat.timestamp).getTime()) / 1000,
    });
  }

  // Zero rows still need a sample, or an alert on "pending > 0" has nothing to compare.
  for (const [name] of QUEUES) {
    for (const status of ['pending', 'processing', 'failed']) {
      const row = queueRows.find((item) => item.queue === name && item.status === status);
      samples.push({ name: 'gami_outbox_rows', labels: { queue: name, status }, value: row?.total ?? 0 });
    }
  }
  for (const [name] of QUEUES) {
    const row = queueRows.find((item) => item.queue === name && item.status === 'pending');
    samples.push({
      name: 'gami_outbox_oldest_pending_seconds',
      labels: { queue: name },
      value: Math.max(0, row?.oldestSeconds ?? 0),
    });
  }

  for (const [state, value] of Object.entries(queue)) {
    samples.push({ name: 'gami_bullmq_jobs', labels: { state }, value });
  }

  const http = processMetrics.getSnapshot().httpRouteStats;
  for (const [key, stat] of Object.entries(http)) {
    const [method = '', ...route] = key.split(' ');
    const labels = { method, route: route.join(' ') };
    samples.push(
      { name: 'gami_http_requests_total', labels, value: stat.requests },
      { name: 'gami_http_request_errors_total', labels, value: stat.errors },
      { name: 'gami_http_request_duration_seconds_sum', labels, value: stat.totalDurationMs / 1000 },
      { name: 'gami_http_request_duration_seconds_count', labels, value: stat.requests }
    );
  }

  const memory = process.memoryUsage();
  samples.push(
    { name: 'gami_process_uptime_seconds', value: process.uptime() },
    { name: 'gami_process_resident_memory_bytes', value: memory.rss },
    { name: 'gami_process_heap_used_bytes', value: memory.heapUsed }
  );

  const text = format(samples, HELP);
  cached = { at: Date.now(), text };
  return text;
}

/** Whether the request carries the configured metrics token. */
export function hasMetricsToken(request: FastifyRequest): boolean {
  const configured = process.env['METRICS_BEARER_TOKEN'];
  const header = request.headers.authorization;
  if (!configured || !header?.startsWith('Bearer ')) return false;

  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(configured);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** `GET /metrics` for Prometheus. Needs `METRICS_BEARER_TOKEN`, or a platform admin session. */
export async function metricsRoutes(fastify: FastifyInstance) {
  fastify.get('/metrics', async (request, reply) => {
    if (!hasMetricsToken(request)) {
      const admin = await requirePlatformAdmin(request, reply);
      if (!admin) return;
    }
    return reply.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8').send(await renderPrometheusMetrics());
  });
}

/** For tests, so a fresh scrape is not served from the short cache. */
export function clearMetricsCache(): void {
  cached = null;
}
