import {
  db,
  webhookEndpoints,
  webhookOutbox,
  type WebhookEndpoint,
  type WebhookOutboxRecord,
} from '@gami/database';
import {
  calculateHmacSignature,
  decryptSecret,
  fetchWithSsrfProtection,
  resolveAndValidateTargetIp,
} from '@gami/webhooks';
import { and, asc, eq, inArray, lt, lte, sql } from 'drizzle-orm';

export const MAX_WEBHOOK_ATTEMPTS = 10;
export const STALE_WEBHOOK_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_WEBHOOK_TIMEOUT_MS = 10 * 1000; // 10 seconds
export const MAX_CONCURRENT_WEBHOOK_ENDPOINTS = 10;
/** Well under the stale threshold, so a record is never reclaimed while it is being sent. */
export const WEBHOOK_BATCH_BUDGET_MS = 60 * 1000;

export interface WebhookDispatcherStats {
  processedCount: number;
  deliveredCount: number;
  failedCount: number;
  recoveredCount: number;
  releasedCount: number;
}

type DeliveryOutcome =
  | { kind: 'delivered' }
  | { kind: 'retry'; error: string }
  | { kind: 'failed'; error: string };

export function calculateBackoffMs(attemptNumber: number): number {
  switch (attemptNumber) {
    case 1:
      return 5 * 1000; // 5s
    case 2:
      return 30 * 1000; // 30s
    case 3:
      return 2 * 60 * 1000; // 2 min
    case 4:
      return 10 * 60 * 1000; // 10 min
    default:
      return 60 * 60 * 1000; // 1 hour cap
  }
}

export function isRetryableHttpStatus(status: number): boolean {
  return [408, 429, 500, 502, 503, 504].includes(status);
}

/**
 * Sends due webhooks without holding a database transaction across HTTP calls.
 * Rows are claimed and committed first, so `processing` plus the stale reclaim covers a crash.
 * `failed` is final. A row waiting for a retry stays `pending` with a later `available_at`.
 */
export async function dispatchPendingWebhooks(
  limit = 50,
  forceNow?: Date
): Promise<WebhookDispatcherStats> {
  const now = forceNow ?? new Date();
  const { claimed, recoveredCount } = await claimDueRecords(limit, now, forceNow);

  const stats: WebhookDispatcherStats = {
    processedCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    recoveredCount,
    releasedCount: 0,
  };
  if (claimed.length === 0) return stats;

  const endpoints = await db
    .select()
    .from(webhookEndpoints)
    .where(inArray(webhookEndpoints.id, [...new Set(claimed.map((record) => record.endpointId))]));

  const deadline = Date.now() + WEBHOOK_BATCH_BUDGET_MS;
  const groups = new Map<string, WebhookOutboxRecord[]>();
  for (const record of claimed) {
    groups.set(record.endpointId, [...(groups.get(record.endpointId) ?? []), record]);
  }

  await forEachConcurrently(
    [...groups.entries()],
    MAX_CONCURRENT_WEBHOOK_ENDPOINTS,
    async ([endpointId, records]) => {
      const endpoint = endpoints.find((candidate) => candidate.id === endpointId);
      await sendToEndpoint(endpoint, records, { now, deadline, stats });
    }
  );

  return stats;
}

async function claimDueRecords(limit: number, now: Date, forceNow?: Date) {
  const staleThreshold = new Date(now.getTime() - STALE_WEBHOOK_PROCESSING_THRESHOLD_MS);

  return await db.transaction(async (tx) => {
    const recovered = await tx
      .update(webhookOutbox)
      .set({ status: 'pending', processingAt: null, updatedAt: now })
      .where(
        and(eq(webhookOutbox.status, 'processing'), lt(webhookOutbox.processingAt, staleThreshold))
      )
      .returning({ id: webhookOutbox.id });

    const due = await tx
      .select()
      .from(webhookOutbox)
      .where(
        and(
          eq(webhookOutbox.status, 'pending'),
          lte(webhookOutbox.availableAt, forceNow ?? sql`now()`)
        )
      )
      .orderBy(asc(webhookOutbox.availableAt), asc(webhookOutbox.id))
      .limit(limit)
      .for('update', { skipLocked: true });

    if (due.length > 0) {
      await tx
        .update(webhookOutbox)
        .set({ status: 'processing', processingAt: now, updatedAt: now })
        .where(
          inArray(
            webhookOutbox.id,
            due.map((record) => record.id)
          )
        );
    }

    return { claimed: due, recoveredCount: recovered.length };
  });
}

/**
 * Sends one endpoint's records in order. Anything worth retrying stops the rest of the batch for
 * that endpoint, so one slow or rate-limiting endpoint costs a single timeout rather than fifty.
 */
async function sendToEndpoint(
  endpoint: WebhookEndpoint | undefined,
  records: WebhookOutboxRecord[],
  context: { now: Date; deadline: number; stats: WebhookDispatcherStats }
): Promise<void> {
  const { now, deadline, stats } = context;

  try {
    for (const [index, record] of records.entries()) {
      if (Date.now() >= deadline) {
        stats.releasedCount += await releaseRecords(records.slice(index), now);
        return;
      }

      const outcome = await attemptDelivery(record, endpoint);
      await saveOutcome(record, endpoint, outcome, now);
      stats.processedCount++;
      if (outcome.kind === 'delivered') stats.deliveredCount++;
      else stats.failedCount++;

      if (outcome.kind === 'retry') {
        const later = new Date(now.getTime() + calculateBackoffMs(record.attempts + 1));
        stats.releasedCount += await releaseRecords(records.slice(index + 1), later);
        return;
      }
    }
  } catch (err: unknown) {
    // Claimed rows left behind here go back to pending through the stale reclaim.
    console.error(
      `[WebhookDispatcher] Failed to save results for endpoint ${records[0]?.endpointId}:`,
      (err as Error).message || err
    );
  }
}

async function attemptDelivery(
  record: WebhookOutboxRecord,
  endpoint: WebhookEndpoint | undefined
): Promise<DeliveryOutcome> {
  if (!endpoint || endpoint.projectId !== record.projectId || !endpoint.active) {
    return { kind: 'failed', error: 'Webhook endpoint deactivated or deleted' };
  }

  try {
    await resolveAndValidateTargetIp(endpoint.url);
  } catch (err: unknown) {
    return {
      kind: 'retry',
      error: `SSRF Shield: ${(err as Error).message || 'DNS resolution failed'}`,
    };
  }

  try {
    const rawBody = JSON.stringify(record.payload);
    const signature = calculateHmacSignature(rawBody, decryptSecret(endpoint.encryptedSecret));

    const response = await fetchWithSsrfProtection(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Gami-Signature': signature,
        'X-Gami-Event-Id': record.eventId,
        'X-Gami-Event-Type': record.eventType,
        'X-Gami-Delivery-Id': record.id,
      },
      body: rawBody,
      redirect: 'manual', // Disable redirects to prevent SSRF bypass
      signal: AbortSignal.timeout(DEFAULT_WEBHOOK_TIMEOUT_MS),
    });

    // Unread bodies keep the connection busy, and the content is not used.
    await response.body?.cancel().catch(() => undefined);

    if (response.ok) return { kind: 'delivered' };

    const error = `HTTP ${response.status}: ${response.statusText}`;
    return { kind: isRetryableHttpStatus(response.status) ? 'retry' : 'failed', error };
  } catch (err: unknown) {
    return { kind: 'retry', error: (err as Error).message || 'HTTP request failed' };
  }
}

async function saveOutcome(
  record: WebhookOutboxRecord,
  endpoint: WebhookEndpoint | undefined,
  outcome: DeliveryOutcome,
  now: Date
): Promise<void> {
  const attempts = record.attempts + 1;

  if (outcome.kind === 'delivered') {
    await db.transaction(async (tx) => {
      await tx
        .update(webhookOutbox)
        .set({
          status: 'delivered',
          attempts,
          deliveredAt: now,
          lastError: null,
          processingAt: null,
          updatedAt: now,
        })
        .where(eq(webhookOutbox.id, record.id));

      await tx
        .update(webhookEndpoints)
        .set({ lastDeliveryAt: now, updatedAt: now })
        .where(eq(webhookEndpoints.id, record.endpointId));
    });
    return;
  }

  if (outcome.kind === 'retry' && attempts < MAX_WEBHOOK_ATTEMPTS) {
    await db
      .update(webhookOutbox)
      .set({
        status: 'pending',
        attempts,
        availableAt: new Date(now.getTime() + calculateBackoffMs(attempts)),
        lastError: outcome.error,
        processingAt: null,
        updatedAt: now,
      })
      .where(eq(webhookOutbox.id, record.id));
    return;
  }

  await db.transaction(async (tx) => {
    await tx
      .update(webhookOutbox)
      .set({
        status: 'failed',
        attempts,
        lastError: outcome.error,
        processingAt: null,
        updatedAt: now,
      })
      .where(eq(webhookOutbox.id, record.id));

    if (endpoint) {
      await tx
        .update(webhookEndpoints)
        .set({ failureCount: sql`webhook_endpoints.failure_count + 1`, updatedAt: now })
        .where(eq(webhookEndpoints.id, endpoint.id));
    }
  });
}

/** Puts unattempted records back without using up one of their attempts. */
async function releaseRecords(records: WebhookOutboxRecord[], availableAt: Date): Promise<number> {
  if (records.length === 0) return 0;

  await db
    .update(webhookOutbox)
    .set({ status: 'pending', processingAt: null, availableAt, updatedAt: new Date() })
    .where(
      inArray(
        webhookOutbox.id,
        records.map((record) => record.id)
      )
    );
  return records.length;
}

async function forEachConcurrently<T>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<void>
): Promise<void> {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      await run(item);
    }
  });
  await Promise.all(runners);
}
