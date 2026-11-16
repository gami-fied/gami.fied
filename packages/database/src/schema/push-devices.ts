import { boolean, foreignKey, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { projects } from './projects.js';

/** A phone or a browser that can receive push notifications for one player. */
export const pushDevices = pgTable(
  'push_devices',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    /** `ios`, `android` or `web`. */
    platform: text('platform').notNull(),
    /**
     * The APNs device token or FCM registration token the app got from the phone's system. For
     * `web` it is the address of the browser's push subscription.
     */
    token: text('token').notNull(),
    /** For `web`: the browser's keys, `{ p256dh, auth }`, which its messages are encrypted with. */
    keys: jsonb('keys'),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'push_devices_project_user_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [endUsers.projectId, endUsers.id],
    }).onDelete('cascade'),
    uniqueIndex('push_devices_project_token_unique').on(table.projectId, table.token),
    index('push_devices_user_idx').on(table.projectId, table.userId, table.platform),
  ]
);

export type PushDeviceRecord = typeof pushDevices.$inferSelect;
