import { db, webhookEndpoints, webhookOutbox } from '@gami/database';
import { calculateHmacSignature, decryptSecret, resolveAndValidateTargetIp } from '@gami/webhooks';
import { and, eq, lt, lte, or, sql } from 'drizzle-orm';

export const MAX_WEBHOOK_ATTEMPTS = 10;
export const STALE_WEBHOOK_PROCESSING_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
export const DEFAULT_WEBHOOK_TIMEOUT_MS = 10 * 1000; // 10 seconds

export interface WebhookDispatcherStats {
  processedCount: number;
  deliveredCount: number;
  failedCount: number;
  recoveredCount: number;
}

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
 * Dispatches pending and retryable webhook_outbox records asynchronously with HMAC signatures,
 * DNS rebinding shielding, 10s timeout, exponential backoff, and crash recovery.
 */
export async function dispatchPendingWebhooks(
  limit = 50,
  forceNow?: Date
): Promise<WebhookDispatcherStats> {
  const now = forceNow || new Date();
  const staleThreshold = new Date(now.getTime() - STALE_WEBHOOK_PROCESSING_THRESHOLD_MS);

  return await db.transaction(async (tx) => {
    // 1. Reclaim stale processing records (crash recovery)
    const recoveredRecords = await tx
      .update(webhookOutbox)
      .set({
        status: 'pending',
        processingAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(webhookOutbox.status, 'processing'),
          lt(webhookOutbox.processingAt, staleThreshold)
        )
      )
      .returning({ id: webhookOutbox.id });

    const recoveredCount = recoveredRecords.length;

    // 2. Select pending / retryable outbox entries with SELECT ... FOR UPDATE SKIP LOCKED
    const candidateRecords = await tx
      .select()
      .from(webhookOutbox)
      .where(
        and(
          or(
            and(eq(webhookOutbox.status, 'pending'), lte(webhookOutbox.availableAt, now)),
            and(
              eq(webhookOutbox.status, 'failed'),
              lte(webhookOutbox.availableAt, now),
              lt(webhookOutbox.attempts, MAX_WEBHOOK_ATTEMPTS)
            )
          )
        )
      )
      .limit(limit)
      .for('update', { skipLocked: true });

    let deliveredCount = 0;
    let failedCount = 0;

    for (const record of candidateRecords) {
      const attemptsCount = record.attempts + 1;

      // Mark as processing with timestamp
      await tx
        .update(webhookOutbox)
        .set({
          status: 'processing',
          processingAt: now,
          updatedAt: now,
        })
        .where(eq(webhookOutbox.id, record.id));

      // Fetch endpoint details
      const [endpoint] = await tx
        .select()
        .from(webhookEndpoints)
        .where(
          and(
            eq(webhookEndpoints.id, record.endpointId),
            eq(webhookEndpoints.projectId, record.projectId)
          )
        );

      if (!endpoint || !endpoint.active) {
        await tx
          .update(webhookOutbox)
          .set({
            status: 'failed',
            attempts: attemptsCount,
            lastError: 'Webhook endpoint deactivated or deleted',
            processingAt: null,
            updatedAt: now,
          })
          .where(eq(webhookOutbox.id, record.id));

        failedCount++;
        continue;
      }

      // Pre-delivery DNS resolution and rebinding validation
      try {
        await resolveAndValidateTargetIp(endpoint.url);
      } catch (dnsErr: unknown) {
        const dnsErrMsg = (dnsErr as Error).message || 'DNS resolution failed';
        await tx
          .update(webhookOutbox)
          .set({
            status: 'failed',
            attempts: attemptsCount,
            lastError: `SSRF Shield: ${dnsErrMsg}`,
            processingAt: null,
            updatedAt: now,
          })
          .where(eq(webhookOutbox.id, record.id));

        await tx
          .update(webhookEndpoints)
          .set({
            failureCount: sql`webhook_endpoints.failure_count + 1`,
            updatedAt: now,
          })
          .where(eq(webhookEndpoints.id, endpoint.id));

        failedCount++;
        continue;
      }

      // Calculate HMAC-SHA256 signature
      const rawBody = JSON.stringify(record.payload);
      const secret = decryptSecret(endpoint.secretHash);
      const signature = calculateHmacSignature(rawBody, secret);

      let responseStatus: number | null = null;
      let deliveryError: string | null = null;
      let isSuccess = false;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), DEFAULT_WEBHOOK_TIMEOUT_MS);

        const response = await fetch(endpoint.url, {
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
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        responseStatus = response.status;

        if (response.ok) {
          isSuccess = true;
        } else {
          deliveryError = `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch (err: unknown) {
        deliveryError = (err as Error).message || 'HTTP request failed';
      }

      if (isSuccess) {
        await tx
          .update(webhookOutbox)
          .set({
            status: 'delivered',
            attempts: attemptsCount,
            deliveredAt: now,
            lastError: null,
            processingAt: null,
            updatedAt: now,
          })
          .where(eq(webhookOutbox.id, record.id));

        await tx
          .update(webhookEndpoints)
          .set({
            lastDeliveryAt: now,
            updatedAt: now,
          })
          .where(eq(webhookEndpoints.id, endpoint.id));

        deliveredCount++;
      } else {
        const isRetryable =
          responseStatus !== null
            ? isRetryableHttpStatus(responseStatus)
            : true; // Network/timeout errors are retryable

        if (isRetryable && attemptsCount < MAX_WEBHOOK_ATTEMPTS) {
          const backoffMs = calculateBackoffMs(attemptsCount);
          const nextAvailableAt = new Date(now.getTime() + backoffMs);

          await tx
            .update(webhookOutbox)
            .set({
              status: 'pending',
              attempts: attemptsCount,
              availableAt: nextAvailableAt,
              lastError: deliveryError,
              processingAt: null,
              updatedAt: now,
            })
            .where(eq(webhookOutbox.id, record.id));
        } else {
          // Permanent failure or max attempts exceeded
          await tx
            .update(webhookOutbox)
            .set({
              status: 'failed',
              attempts: attemptsCount,
              lastError: deliveryError,
              processingAt: null,
              updatedAt: now,
            })
            .where(eq(webhookOutbox.id, record.id));

          await tx
            .update(webhookEndpoints)
            .set({
              failureCount: sql`webhook_endpoints.failure_count + 1`,
              updatedAt: now,
            })
            .where(eq(webhookEndpoints.id, endpoint.id));
        }

        failedCount++;
      }
    }

    return {
      processedCount: candidateRecords.length,
      deliveredCount,
      failedCount,
      recoveredCount,
    };
  });
}
