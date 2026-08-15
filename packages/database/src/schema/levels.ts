import {
  bigint,
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const levels = pgTable(
  'levels',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    level: integer('level').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    iconUrl: text('icon_url'),
    enabled: boolean('enabled').default(true).notNull(),
    requiredXp: bigint('required_xp', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('levels_proj_level_unique').on(table.projectId, table.level),
    uniqueIndex('levels_proj_required_xp_unique').on(table.projectId, table.requiredXp),
    index('levels_proj_required_xp_idx').on(table.projectId, table.requiredXp),
    index('levels_proj_enabled_idx').on(table.projectId, table.enabled),
  ]
);

export type Level = typeof levels.$inferSelect;
export type NewLevel = typeof levels.$inferInsert;
