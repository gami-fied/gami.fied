export type WebhookEventType =
  | 'xp.awarded'
  | 'achievement.unlocked'
  | 'level.up'
  | 'challenge.completed'
  | 'user.created'
  | 'user.deactivated'
  | 'webhook.test';

export const SUPPORTED_WEBHOOK_EVENT_TYPES: WebhookEventType[] = [
  'xp.awarded',
  'achievement.unlocked',
  'level.up',
  'challenge.completed',
  'user.created',
  'user.deactivated',
];

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  projectId: string;
  userId?: string | null;
  externalUserId?: string | null;
  data: Record<string, unknown>;
}

export interface WebhookDelivery {
  id: string;
  endpointId: string;
  eventId: string;
  eventType: WebhookEventType;
  status: 'pending' | 'processing' | 'delivered' | 'failed';
  attempts: number;
  availableAt: string;
  deliveredAt?: string | null;
  lastError?: string | null;
  createdAt: string;
}

export interface WebhookEndpointInfo {
  id: string;
  projectId: string;
  name: string;
  url: string;
  description: string | null;
  active: boolean;
  events: WebhookEventType[];
  createdAt: string | Date;
  updatedAt: string | Date;
  lastDeliveryAt: string | Date | null;
  failureCount: number;
}
