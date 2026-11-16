import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

/**
 * Player-facing text in another language. A row is one field of one thing, such as the name of
 * the achievement `first_lesson` in `pt-BR`. Things are named by key, so translations move with a
 * design when it is exported and imported.
 */
export const translations = pgTable(
  'translations',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    /** A language tag such as `fr` or `pt-BR`. */
    locale: text('locale').notNull(),
    /** What kind of thing, such as `achievement`, `challenge` or `notification`. */
    entityType: text('entity_type').notNull(),
    /** The thing's key. For a notification it is the notification type. */
    entityKey: text('entity_key').notNull(),
    /** `name` or `description`, or `title` and `message` for a notification. */
    field: text('field').notNull(),
    value: text('value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('translations_unique').on(table.projectId, table.locale, table.entityType, table.entityKey, table.field),
    index('translations_proj_locale_idx').on(table.projectId, table.locale),
  ]
);

export type Translation = typeof translations.$inferSelect;
