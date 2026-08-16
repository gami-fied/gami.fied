import { jsonb, pgTable, text, timestamp, uniqueIndex, index, integer, varchar, boolean } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';
import { notifications } from './notifications.js';
import { events } from './events.js';

export const integrations = pgTable(
  'integrations',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    projectId: varchar('project_id', { length: 64 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(), // e.g. 'discord', 'slack', 'teams'
    name: text('name').notNull(),
    status: text('status').default('active').notNull(), // 'active' | 'disabled' | 'error'
    config: jsonb('config').default({}).notNull(), // encrypted secrets, guildId, channelId, enabledEvents
    enabled: boolean('enabled').default(true).notNull(),
    lastTestedAt: timestamp('last_tested_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_integrations_project_id').on(table.projectId),
    index('idx_integrations_provider').on(table.provider),
    index('idx_integrations_status').on(table.status),
  ]
);

export const integrationDeliveries = pgTable(
  'integration_deliveries',
  {
    id: varchar('id', { length: 64 }).primaryKey(),
    integrationId: varchar('integration_id', { length: 64 })
      .notNull()
      .references(() => integrations.id, { onDelete: 'cascade' }),
    projectId: varchar('project_id', { length: 64 })
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    notificationId: varchar('notification_id', { length: 64 }).references(
      () => notifications.id,
      { onDelete: 'set null' }
    ),
    eventId: varchar('event_id', { length: 64 }).references(() => events.id, {
      onDelete: 'set null',
    }),
    eventType: text('event_type').notNull(),
    status: text('status').default('pending').notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    processingAt: timestamp('processing_at', { withTimezone: true, mode: 'date' }),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    replayedAt: timestamp('replayed_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    externalMessageId: text('external_message_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('idx_integration_deliveries_idempotency').on(
      table.integrationId,
      table.notificationId
    ),
    index('idx_integration_deliveries_integration_id').on(table.integrationId),
    index('idx_integration_deliveries_project_id').on(table.projectId),
    index('idx_integration_deliveries_status_available').on(
      table.status,
      table.availableAt
    ),
    index('idx_integration_deliveries_notification_id').on(table.notificationId),
    index('idx_integration_deliveries_event_id').on(table.eventId),
  ]
);

export type IntegrationRecord = typeof integrations.$inferSelect;
export type NewIntegrationRecord = typeof integrations.$inferInsert;
export type IntegrationDeliveryRecord = typeof integrationDeliveries.$inferSelect;
