import crypto from 'crypto';
import { db, endUsers, webhookEndpoints, webhookOutbox, webhookSubscriptions } from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { buildWebhookPayload } from './payload.js';
import type { WebhookEventType } from './types.js';

export interface CreateWebhookDeliveryParams {
  projectId: string;
  eventId: string;
  eventType: WebhookEventType;
  userId?: string | null;
  externalUserId?: string | null;
  data: Record<string, unknown>;
  createdAt?: string | Date;
}

/**
 * Queries active webhook endpoints for a project subscribed to an eventType and inserts durable webhook_outbox intent records.
 * Automatically resolves externalUserId from endUsers if userId is provided and externalUserId is missing.
 * Uses ON CONFLICT DO NOTHING (UNIQUE(endpoint_id, event_id, event_type)) for exact-once intent queuing.
 * Can be executed inside an existing PostgreSQL transaction.
 */
export async function createWebhookDelivery(
  client: typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0],
  params: CreateWebhookDeliveryParams
): Promise<number> {
  const { projectId, eventId, eventType, userId, externalUserId, data, createdAt } = params;

  // 1. Query active endpoints for project subscribed to eventType
  const matchingEndpoints = await client
    .select({
      id: webhookEndpoints.id,
    })
    .from(webhookEndpoints)
    .innerJoin(
      webhookSubscriptions,
      and(
        eq(webhookSubscriptions.endpointId, webhookEndpoints.id),
        eq(webhookSubscriptions.eventType, eventType)
      )
    )
    .where(
      and(
        eq(webhookEndpoints.projectId, projectId),
        eq(webhookEndpoints.active, true)
      )
    );

  if (matchingEndpoints.length === 0) {
    return 0;
  }

  // Auto-resolve externalUserId from endUsers if missing
  let resolvedExternalUserId: string | null = externalUserId || null;
  if (!resolvedExternalUserId && userId) {
    const [userRecord] = await client
      .select({ externalId: endUsers.externalId })
      .from(endUsers)
      .where(and(eq(endUsers.projectId, projectId), eq(endUsers.id, userId)));

    if (userRecord?.externalId) {
      resolvedExternalUserId = userRecord.externalId;
    }
  }

  const payload = buildWebhookPayload({
    eventId,
    eventType,
    projectId,
    userId,
    externalUserId: resolvedExternalUserId,
    data,
    createdAt,
  });

  const now = new Date();
  let createdCount = 0;

  // 2. Insert outbox record for each subscribed endpoint
  for (const ep of matchingEndpoints) {
    const outboxId = `who_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

    await client
      .insert(webhookOutbox)
      .values({
        id: outboxId,
        projectId,
        endpointId: ep.id,
        eventType,
        eventId,
        payload,
        status: 'pending',
        attempts: 0,
        availableAt: now,
      })
      .onConflictDoNothing();

    createdCount++;
  }

  return createdCount;
}
