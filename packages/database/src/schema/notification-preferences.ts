import { boolean, index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { projects } from './projects.js';

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(), // 'in_app' | 'email'
    notificationType: text('notification_type').notNull(), // 'xp_awarded' | 'achievement_unlocked' | 'level_up' | 'challenge_completed'
    enabled: boolean('enabled').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('notification_prefs_proj_usr_chan_type_idx').on(
      table.projectId,
      table.userId,
      table.channel,
      table.notificationType
    ),
    index('notification_prefs_proj_usr_chan_idx').on(
      table.projectId,
      table.userId,
      table.channel
    ),
  ]
);

export type NotificationPreferenceRecord = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreferenceRecord = typeof notificationPreferences.$inferInsert;
