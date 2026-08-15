import { index, integer, jsonb, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { projects } from './projects.js';

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    type: text('type').notNull(), // xp_awarded | achievement_unlocked | level_up | challenge_completed
    title: text('title').notNull(),
    message: text('message').notNull(),
    data: jsonb('data').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    readAt: timestamp('read_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_notifications_proj_user_created').on(table.projectId, table.userId, table.createdAt),
    index('idx_notifications_proj_user_read_created').on(
      table.projectId,
      table.userId,
      table.readAt,
      table.createdAt
    ),
    unique('notifications_proj_user_source_uniq').on(
      table.projectId,
      table.userId,
      table.sourceType,
      table.sourceId
    ),
  ]
);

export const notificationOutbox = pgTable(
  'notification_outbox',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    notificationId: text('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    status: text('status').default('pending').notNull(), // pending | processing | completed | failed
    attempts: integer('attempts').default(0).notNull(),
    lastError: text('last_error'),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    processingAt: timestamp('processing_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_notification_outbox_status_available').on(table.status, table.availableAt),
    index('idx_notification_outbox_proj_notif').on(table.projectId, table.notificationId),
  ]
);

export type NotificationRecord = typeof notifications.$inferSelect;
export type NewNotificationRecord = typeof notifications.$inferInsert;
export type NotificationOutboxRecord = typeof notificationOutbox.$inferSelect;
export type NewNotificationOutboxRecord = typeof notificationOutbox.$inferInsert;
