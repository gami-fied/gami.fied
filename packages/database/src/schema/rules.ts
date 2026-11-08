import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const rules = pgTable(
  'rules',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    trigger: text('trigger').notNull(),
    conditions: jsonb('conditions'),
    actions: jsonb('actions').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    /** Edits saved but not yet live: `{ name, description, trigger, conditions, actions }`. */
    draft: jsonb('draft'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [index('rules_project_id_idx').on(table.projectId)]
);

/** Every state a rule has been live in, so a change can be traced and undone. */
export const ruleVersions = pgTable(
  'rule_versions',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => rules.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    /** The rule as it was: name, description, trigger, conditions, actions and enabled. */
    snapshot: jsonb('snapshot').notNull(),
    note: text('note'),
    /** The user or API key that made the change. */
    actor: text('actor'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('rule_versions_rule_version_unique').on(table.ruleId, table.version)]
);

export type RuleVersion = typeof ruleVersions.$inferSelect;
export type Rule = typeof rules.$inferSelect;
export type NewRule = typeof rules.$inferInsert;
