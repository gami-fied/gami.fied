import { index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { notifications } from './notifications.js';
import { projects } from './projects.js';

export const emailNotificationOutbox = pgTable(
  'email_notification_outbox',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .references(() => projects.id, { onDelete: 'cascade' }),
    notificationId: text('notification_id')
      .references(() => notifications.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    recipientEmail: text('recipient_email').notNull(),
    subject: text('subject').notNull(),
    htmlBody: text('html_body').notNull(),
    textBody: text('text_body').notNull(),
    status: text('status').default('pending').notNull(), // 'pending' | 'processing' | 'completed' | 'failed'
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    processingAt: timestamp('processing_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    // Explicit channel-aware uniqueness constraint on notificationId
    uniqueIndex('email_notification_outbox_notif_id_unique').on(table.notificationId),
    index('email_notification_outbox_status_available_idx').on(table.status, table.availableAt),
    index('email_notification_outbox_proj_user_idx').on(table.projectId, table.userId),
  ]
);

export type EmailNotificationOutboxRecord = typeof emailNotificationOutbox.$inferSelect;
export type NewEmailNotificationOutboxRecord = typeof emailNotificationOutbox.$inferInsert;
