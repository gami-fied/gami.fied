import { sql } from 'drizzle-orm';
import { boolean, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations } from './organizations.js';

/**
 * Whether a feature is on. A row with no organization is the instance-wide setting; a row with one
 * overrides it for that organization. No row means the feature's default. An organization can turn
 * a feature off, but never on when the instance has it off.
 */
export const featureSettings = pgTable(
  'feature_settings',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    feature: text('feature').notNull(),
    enabled: boolean('enabled').notNull(),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('feature_settings_instance_unique').on(table.feature).where(sql`${table.organizationId} IS NULL`),
    uniqueIndex('feature_settings_org_unique').on(table.organizationId, table.feature).where(sql`${table.organizationId} IS NOT NULL`),
  ]
);

/**
 * Limits and security rules for organizations. The row with no organization holds the instance
 * defaults; an organization's row overrides them field by field, and a null field inherits.
 */
export const organizationPolicies = pgTable(
  'organization_policies',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
    maxProjects: integer('max_projects'),
    maxMembers: integer('max_members'),
    /** New members and invitations must use one of these email domains. Empty allows any. */
    allowedEmailDomains: jsonb('allowed_email_domains').$type<string[]>(),
    /** API keys must expire within this many days. */
    apiKeyMaxLifetimeDays: integer('api_key_max_lifetime_days'),
    /** API keys only work from these addresses or CIDR ranges. Empty allows any. */
    apiIpAllowlist: jsonb('api_ip_allowlist').$type<string[]>(),
    /** End-user tokens only work when the project lists its allowed sites. */
    requireAllowedOrigins: boolean('require_allowed_origins'),
    /** Events a project may send per minute. */
    eventsPerMinute: integer('events_per_minute'),
    adminNotes: text('admin_notes'),
    updatedBy: text('updated_by'),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('organization_policies_instance_unique').on(sql`(1)`).where(sql`${table.organizationId} IS NULL`),
    uniqueIndex('organization_policies_org_unique').on(table.organizationId).where(sql`${table.organizationId} IS NOT NULL`),
  ]
);

export type FeatureSetting = typeof featureSettings.$inferSelect;
export type OrganizationPolicy = typeof organizationPolicies.$inferSelect;
