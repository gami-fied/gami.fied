import { index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { projects } from './projects.js';

export const events = pgTable(
  'events',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => endUsers.id, { onDelete: 'set null' }),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    idempotencyKey: text('idempotency_key'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('events_project_idempotency_idx').on(table.projectId, table.idempotencyKey),
    index('events_project_id_idx').on(table.projectId),
    index('events_project_user_id_idx').on(table.projectId, table.userId),
    index('events_project_type_idx').on(table.projectId, table.type),
    index('events_project_occurred_at_idx').on(table.projectId, table.occurredAt),
  ]
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
