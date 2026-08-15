import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { events } from './events.js';
import { rules } from './rules.js';

export const ruleExecutions = pgTable(
  'rule_executions',
  {
    id: text('id').primaryKey(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => rules.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    status: text('status').default('pending').notNull(),
    executedAt: timestamp('executed_at', { withTimezone: true, mode: 'date' }),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('rule_executions_rule_event_unique').on(table.ruleId, table.eventId),
    index('rule_executions_rule_id_idx').on(table.ruleId),
    index('rule_executions_event_id_idx').on(table.eventId),
    index('rule_executions_status_idx').on(table.status),
  ]
);

export type RuleExecution = typeof ruleExecutions.$inferSelect;
export type NewRuleExecution = typeof ruleExecutions.$inferInsert;
