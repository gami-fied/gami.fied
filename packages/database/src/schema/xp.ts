import { bigint, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { events } from './events.js';
import { projects } from './projects.js';
import { ruleExecutions } from './rule-executions.js';
import { rules } from './rules.js';

export const xpLedger = pgTable(
  'xp_ledger',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    ruleId: text('rule_id').references(() => rules.id, { onDelete: 'set null' }),
    ruleExecutionId: text('rule_execution_id').references(() => ruleExecutions.id, {
      onDelete: 'set null',
    }),
    idempotencyKey: text('idempotency_key'),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    reason: text('reason').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('xp_ledger_rule_execution_unique').on(table.ruleExecutionId),
    uniqueIndex('xp_ledger_proj_idempotency_unique').on(table.projectId, table.idempotencyKey),
    index('xp_ledger_proj_user_created_idx').on(table.projectId, table.userId, table.createdAt),
    index('xp_ledger_event_id_idx').on(table.eventId),
    index('xp_ledger_rule_id_idx').on(table.ruleId),
  ]
);

export const userXpBalances = pgTable(
  'user_xp_balances',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    totalXp: bigint('total_xp', { mode: 'number' }).default(0).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_xp_balances_proj_user_unique').on(table.projectId, table.userId),
    index('idx_user_xp_balances_project_total_xp_user').on(
      table.projectId,
      table.totalXp,
      table.userId
    ),
  ]
);

export type XpLedger = typeof xpLedger.$inferSelect;
export type NewXpLedger = typeof xpLedger.$inferInsert;
export type UserXpBalance = typeof userXpBalances.$inferSelect;
export type NewUserXpBalance = typeof userXpBalances.$inferInsert;
