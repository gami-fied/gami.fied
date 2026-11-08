import { doublePrecision, foreignKey, index, integer, jsonb, pgTable, text, timestamp, boolean } from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { projects } from './projects.js';

/** A multiplier on the XP rules award, for a promotion such as double XP on weekends. */
export const xpBoosts = pgTable(
  'xp_boosts',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    multiplier: doublePrecision('multiplier').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    startAt: timestamp('start_at', { withTimezone: true, mode: 'date' }),
    endAt: timestamp('end_at', { withTimezone: true, mode: 'date' }),
    /** Days it applies on, 0 (Monday) to 6 (Sunday). Null means every day. */
    daysOfWeek: jsonb('days_of_week'),
    /** Hours of the day it applies, `[from, to)` in `timeZone`. Both null means all day. */
    fromHour: integer('from_hour'),
    toHour: integer('to_hour'),
    timeZone: text('time_zone').default('UTC').notNull(),
    /** Only these event types, or every event when null. */
    eventTypes: jsonb('event_types'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [index('xp_boosts_proj_enabled_idx').on(table.projectId, table.enabled)]
);

/** A ceiling or pause on rule XP, to stop farming and runaway rules. */
export const xpLimits = pgTable(
  'xp_limits',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** `xp_cap` (most XP in a period), `award_cap` (most awards in a period) or `cooldown` (seconds between awards). */
    kind: text('kind').notNull(),
    /** `day`, `week` or `month`, for the two caps. */
    period: text('period'),
    /** The cap, or the cooldown in seconds. */
    amount: integer('amount').notNull(),
    /** Count only this rule, or every rule when null. */
    ruleId: text('rule_id'),
    /** Count only rules that trigger on this event type. */
    eventType: text('event_type'),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [index('xp_limits_proj_enabled_idx').on(table.projectId, table.enabled)]
);

/** Each time a limit held XP back. Many in a row is a sign of someone gaming a rule. */
export const xpLimitHits = pgTable(
  'xp_limit_hits',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    limitId: text('limit_id').references(() => xpLimits.id, { onDelete: 'set null' }),
    limitName: text('limit_name').notNull(),
    ruleId: text('rule_id'),
    eventId: text('event_id'),
    /** What the rule would have given, and what it actually gave. */
    wanted: integer('wanted').notNull(),
    given: integer('given').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'xp_limit_hits_project_user_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [endUsers.projectId, endUsers.id],
    }).onDelete('cascade'),
    index('xp_limit_hits_user_idx').on(table.projectId, table.userId, table.createdAt),
    index('xp_limit_hits_proj_created_idx').on(table.projectId, table.createdAt),
  ]
);

export type XpBoost = typeof xpBoosts.$inferSelect;
export type XpLimit = typeof xpLimits.$inferSelect;
