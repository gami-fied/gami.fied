import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { projects } from './projects.js';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    actorType: text('actor_type').notNull(), // 'user' | 'system' | 'api_key'
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(), // e.g. 'user.created', 'rule.updated', 'xp.manually_adjusted'
    resourceType: text('resource_type').notNull(), // 'user', 'rule', 'webhook', 'event', 'api_key'
    resourceId: text('resource_id').notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_audit_logs_proj_created').on(table.projectId, table.createdAt),
    index('idx_audit_logs_proj_res').on(table.projectId, table.resourceType, table.resourceId),
    index('idx_audit_logs_proj_actor').on(table.projectId, table.actorId, table.createdAt),
  ]
);

export type AuditLogRecord = typeof auditLogs.$inferSelect;
export type NewAuditLogRecord = typeof auditLogs.$inferInsert;
