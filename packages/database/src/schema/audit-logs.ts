import { index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';
import { projects } from './projects.js';

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, {
      onDelete: 'set null',
    }),
    projectId: text('project_id').references(() => projects.id, {
      onDelete: 'set null',
    }),
    actorType: text('actor_type').notNull(), // 'user' | 'system' | 'api_key'
    actorId: text('actor_id').notNull(),
    action: text('action').notNull(), // e.g. 'user.created', 'rule.updated', 'admin.security_updated'
    severity: text('severity').default('info').notNull(), // 'info' | 'warning' | 'critical'
    resourceType: text('resource_type').notNull(), // 'user', 'rule', 'webhook', 'event', 'api_key', 'server_config'
    resourceId: text('resource_id').notNull(),
    metadata: jsonb('metadata').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_audit_logs_proj_created').on(table.projectId, table.createdAt),
    index('idx_audit_logs_org_created').on(table.organizationId, table.createdAt),
    index('idx_audit_logs_proj_res').on(table.projectId, table.resourceType, table.resourceId),
    index('idx_audit_logs_proj_actor').on(table.projectId, table.actorId, table.createdAt),
    index('idx_audit_logs_severity').on(table.severity, table.createdAt),
  ]
);

export type AuditLogRecord = typeof auditLogs.$inferSelect;
export type NewAuditLogRecord = typeof auditLogs.$inferInsert;
