import { jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const serverConfigs = pgTable('server_configs', {
  key: text('key').primaryKey(), // e.g. 'smtp_config'
  value: jsonb('value').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .notNull(),
});

export type ServerConfigRecord = typeof serverConfigs.$inferSelect;
export type NewServerConfigRecord = typeof serverConfigs.$inferInsert;
