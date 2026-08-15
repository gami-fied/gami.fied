import { boolean, index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const webhookEndpoints = pgTable(
  'webhook_endpoints',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    secretHash: text('secret_hash').notNull(),
    active: boolean('active').default(true).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    lastDeliveryAt: timestamp('last_delivery_at', { withTimezone: true, mode: 'date' }),
    failureCount: integer('failure_count').default(0).notNull(),
  },
  (table) => [
    index('idx_webhook_endpoints_proj_active').on(table.projectId, table.active),
    index('idx_webhook_endpoints_proj_created').on(table.projectId, table.createdAt),
  ]
);

export const webhookSubscriptions = pgTable(
  'webhook_subscriptions',
  {
    id: text('id').primaryKey(),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    unique('webhook_subs_endpoint_event_uniq').on(table.endpointId, table.eventType),
  ]
);

export const webhookOutbox = pgTable(
  'webhook_outbox',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    endpointId: text('endpoint_id')
      .notNull()
      .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
    eventType: text('event_type').notNull(),
    eventId: text('event_id').notNull(),
    payload: jsonb('payload').notNull(),
    status: text('status').default('pending').notNull(), // pending | processing | delivered | failed
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    processingAt: timestamp('processing_at', { withTimezone: true, mode: 'date' }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    unique('webhook_outbox_endpoint_event_type_uniq').on(
      table.endpointId,
      table.eventId,
      table.eventType
    ),
    index('idx_webhook_outbox_status_avail').on(table.status, table.availableAt),
    index('idx_webhook_outbox_proj_status_avail').on(
      table.projectId,
      table.status,
      table.availableAt
    ),
    index('idx_webhook_outbox_endpoint_created').on(table.endpointId, table.createdAt),
  ]
);

export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookSubscription = typeof webhookSubscriptions.$inferSelect;
export type NewWebhookSubscription = typeof webhookSubscriptions.$inferInsert;
export type WebhookOutboxRecord = typeof webhookOutbox.$inferSelect;
export type NewWebhookOutboxRecord = typeof webhookOutbox.$inferInsert;
