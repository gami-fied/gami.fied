import {
  auditLogs,
  db,
  getPlatformSettings,
  member,
  projects,
  users,
  webhookEndpoints,
  webhookOutbox,
  type WebhookEndpoint,
  type WebhookOutboxRecord,
} from '@gami/database';
import {
  calculateHmacSignature,
  calculateTimestampedSignature,
  decryptSecret,
  fetchWithSsrfProtection,
  resolveAndValidateTargetIp,
} from '@gami/webhooks';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { getActiveSmtpProvider } from './email-notification-dispatcher.js';
import { claimDueRows, reclaimStaleRows } from './outbox.js';
import { createLogger } from '@gami/config';

const log = createLogger('WebhookDispatcher');

export const STALE_WEBHOOK_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
export const MAX_CONCURRENT_WEBHOOK_ENDPOINTS = 10;
/** Well under the stale threshold, so a record is never reclaimed while it is being sent. */
export const WEBHOOK_BATCH_BUDGET_MS = 60 * 1000;
/** Deliveries that used up every retry in a row, with no success between them. */
export const MAX_CONSECUTIVE_ENDPOINT_FAILURES = 20;

export interface WebhookDispatcherStats {
  processedCount: number;
  deliveredCount: number;
  failedCount: number;
  recoveredCount: number;
  releasedCount: number;
}

interface DeliveryLimits {
  timeoutMs: number;
  maxAttempts: number;
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
  const settings = await getPlatformSettings('webhooks');
  const now = forceNow ?? new Date();
  const recoveredCount = await reclaimStaleRows(
    webhookOutbox,
    STALE_WEBHOOK_PROCESSING_THRESHOLD_MS,
    now
  );
  const claimed = settings.enabled ? await claimDueRows(webhookOutbox, limit, forceNow) : [];

  const stats: WebhookDispatcherStats = {
    processedCount: 0,
    deliveredCount: 0,
    failedCount: 0,
    recoveredCount,
    releasedCount: 0,
  };
  if (claimed.length === 0) return stats;
  const delivery = { timeoutMs: settings.defaultTimeoutMs, maxAttempts: settings.maxRetryAttempts + 1 };

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
      await sendToEndpoint(endpoint, records, { now, deadline, stats, delivery });
    }
  );

  return stats;
}

/**
 * Sends one endpoint's records in order. Anything worth retrying stops the rest of the batch for
 * that endpoint, so one slow or rate-limiting endpoint costs a single timeout rather than fifty.
 */
async function sendToEndpoint(
  endpoint: WebhookEndpoint | undefined,
  records: WebhookOutboxRecord[],
  context: {
    now: Date;
    deadline: number;
    stats: WebhookDispatcherStats;
    delivery: DeliveryLimits;
  }
): Promise<void> {
  const { now, deadline, stats, delivery } = context;

  try {
    for (const [index, record] of records.entries()) {
      if (Date.now() >= deadline) {
        stats.releasedCount += await releaseRecords(records.slice(index), now);
        return;
      }

      const outcome = await attemptDelivery(record, endpoint, delivery.timeoutMs);
      await saveOutcome(record, endpoint, outcome, now, delivery.maxAttempts);
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
    log.error(`Failed to save results for endpoint ${records[0]?.endpointId}:`,
      (err as Error).message || err
    );
  }
}

async function attemptDelivery(
  record: WebhookOutboxRecord,
  endpoint: WebhookEndpoint | undefined,
  timeoutMs: number
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
    const secret = decryptSecret(endpoint.encryptedSecret);
    const timestamp = Math.floor(Date.now() / 1000);

    const response = await fetchWithSsrfProtection(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Gami-Signature': calculateHmacSignature(rawBody, secret),
        'X-Gami-Timestamp': String(timestamp),
        'X-Gami-Signature-V2': signaturesFor(endpoint, secret, rawBody, timestamp),
        'X-Gami-Event-Id': record.eventId,
        'X-Gami-Event-Type': record.eventType,
        'X-Gami-Delivery-Id': record.id,
      },
      body: rawBody,
      redirect: 'manual', // Disable redirects to prevent SSRF bypass
      signal: AbortSignal.timeout(timeoutMs),
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

/** Signs with the previous secret as well during a rotation, so receivers can switch over. */
function signaturesFor(
  endpoint: WebhookEndpoint,
  secret: string,
  rawBody: string,
  timestamp: number
): string {
  const signatures = [calculateTimestampedSignature(rawBody, secret, timestamp)];
  const { previousEncryptedSecret, previousSecretExpiresAt } = endpoint;

  if (previousEncryptedSecret && previousSecretExpiresAt && previousSecretExpiresAt > new Date()) {
    signatures.push(
      calculateTimestampedSignature(rawBody, decryptSecret(previousEncryptedSecret), timestamp)
    );
  }
  return signatures.join(',');
}

async function saveOutcome(
  record: WebhookOutboxRecord,
  endpoint: WebhookEndpoint | undefined,
  outcome: DeliveryOutcome,
  now: Date,
  maxAttempts: number
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
        .set({ lastDeliveryAt: now, failureCount: 0, updatedAt: now })
        .where(eq(webhookEndpoints.id, record.endpointId));
    });
    return;
  }

  if (outcome.kind === 'retry' && attempts < maxAttempts) {
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

  const disabled = await db.transaction(async (tx) => {
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

    if (!endpoint?.active) return false;

    const [updated] = await tx
      .update(webhookEndpoints)
      .set({ failureCount: sql`webhook_endpoints.failure_count + 1`, updatedAt: now })
      .where(eq(webhookEndpoints.id, endpoint.id))
      .returning({ failureCount: webhookEndpoints.failureCount });

    if (!updated || updated.failureCount < MAX_CONSECUTIVE_ENDPOINT_FAILURES) return false;

    const disabledReason = `Disabled after ${updated.failureCount} failed deliveries in a row. Last error: ${outcome.error}`;
    await tx
      .update(webhookEndpoints)
      .set({ active: false, disabledReason, updatedAt: now })
      .where(eq(webhookEndpoints.id, endpoint.id));
    await tx.insert(auditLogs).values({
      id: `aud_${randomUUID()}`,
      projectId: endpoint.projectId,
      actorType: 'system',
      actorId: 'webhook-dispatcher',
      action: 'webhook.auto_disabled',
      severity: 'warning',
      resourceType: 'webhook',
      resourceId: endpoint.id,
      metadata: { failureCount: updated.failureCount, lastError: outcome.error },
    });
    return true;
  });

  if (disabled && endpoint) await notifyOwnersOfDisabledEndpoint(endpoint);
}

/** A failure here is only logged: the endpoint is already disabled and shows that in the API. */
async function notifyOwnersOfDisabledEndpoint(endpoint: WebhookEndpoint): Promise<void> {
  try {
    const provider = await getActiveSmtpProvider();
    if (!provider) return;

    const owners = await db
      .select({ email: users.email })
      .from(projects)
      .innerJoin(member, eq(member.organizationId, projects.organizationId))
      .innerJoin(users, eq(users.id, member.userId))
      .where(and(eq(projects.id, endpoint.projectId), eq(member.role, 'owner')));

    const text = `Gami disabled your webhook endpoint "${endpoint.name}" because deliveries to it kept failing. Fix the endpoint, then turn it back on from the dashboard.`;
    for (const owner of owners) {
      await provider.sendEmail({
        to: owner.email,
        subject: `Webhook endpoint "${endpoint.name}" was disabled`,
        html: `<p>${escapeHtml(text)}</p>`,
        text,
      });
    }
  } catch (err: unknown) {
    log.error(`Could not notify owners about endpoint ${endpoint.id}:`,
      (err as Error).message || err
    );
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
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
