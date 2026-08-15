import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const endUsers = pgTable(
  'end_users',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    metadata: jsonb('metadata'),
    active: boolean('active').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('end_users_project_external_id_idx').on(table.projectId, table.externalId),
    index('end_users_project_id_idx').on(table.projectId),
    index('end_users_project_created_idx').on(table.projectId, table.createdAt),
    index('end_users_project_name_idx').on(table.projectId, table.name),
  ]
);

export type EndUser = typeof endUsers.$inferSelect;
export type NewEndUser = typeof endUsers.$inferInsert;
