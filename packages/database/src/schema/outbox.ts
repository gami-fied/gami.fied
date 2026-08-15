import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { events } from './events.js';

export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: text('id').primaryKey(),
    eventId: text('event_id')
      .notNull()
      .unique()
      .references(() => events.id, { onDelete: 'cascade' }),
    status: text('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('event_outbox_status_available_idx').on(table.status, table.availableAt),
    index('event_outbox_event_id_idx').on(table.eventId),
  ]
);

export type EventOutboxRecord = typeof eventOutbox.$inferSelect;
export type NewEventOutboxRecord = typeof eventOutbox.$inferInsert;
