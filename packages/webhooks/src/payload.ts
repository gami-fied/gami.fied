import type { WebhookEventType, WebhookPayload } from './types.js';

export function buildWebhookPayload(params: {
  eventId: string;
  eventType: WebhookEventType;
  projectId: string;
  userId?: string | null;
  externalUserId?: string | null;
  data: Record<string, unknown>;
  createdAt?: string | Date;
}): WebhookPayload {
  const createdAtIso = params.createdAt
    ? typeof params.createdAt === 'string'
      ? params.createdAt
      : params.createdAt.toISOString()
    : new Date().toISOString();

  return {
    id: params.eventId,
    type: params.eventType,
    createdAt: createdAtIso,
    projectId: params.projectId,
    userId: params.userId || null,
    externalUserId: params.externalUserId || null,
    data: params.data,
  };
}
