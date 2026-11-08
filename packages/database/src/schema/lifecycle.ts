import { boolean, foreignKey, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { projects } from './projects.js';

/** An email the engine sends on its own: a streak reminder, a weekly recap or a win-back note. */
export const lifecycleCampaigns = pgTable(
  'lifecycle_campaigns',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** `streak_reminder`, `weekly_recap` or `winback`. */
    kind: text('kind').notNull(),
    enabled: boolean('enabled').default(false).notNull(),
    subject: text('subject').notNull(),
    /** Plain text with `{{variables}}`. Blank lines start new paragraphs. */
    body: text('body').notNull(),
    /** Timing and targeting, which depends on the kind. */
    config: jsonb('config').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [index('lifecycle_campaigns_proj_enabled_idx').on(table.projectId, table.enabled)]
);

/** One row per email a campaign queued. The unique key is what stops anyone getting the same one twice. */
export const lifecycleSends = pgTable(
  'lifecycle_sends',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    campaignId: text('campaign_id')
      .notNull()
      .references(() => lifecycleCampaigns.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    /** The day, week or spell of inactivity this email was for. */
    periodKey: text('period_key').notNull(),
    emailOutboxId: text('email_outbox_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'lifecycle_sends_project_user_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [endUsers.projectId, endUsers.id],
    }).onDelete('cascade'),
    uniqueIndex('lifecycle_sends_campaign_user_period_unique').on(table.campaignId, table.userId, table.periodKey),
    index('lifecycle_sends_campaign_created_idx').on(table.campaignId, table.createdAt),
  ]
);

export type LifecycleCampaign = typeof lifecycleCampaigns.$inferSelect;
export type LifecycleSend = typeof lifecycleSends.$inferSelect;
