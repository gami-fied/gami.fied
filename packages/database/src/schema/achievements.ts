import {
  boolean,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { events } from './events.js';
import { projects } from './projects.js';
import { ruleExecutions } from './rule-executions.js';

export const achievements = pgTable(
  'achievements',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    iconUrl: text('icon_url'),
    enabled: boolean('enabled').default(true).notNull(),
    /**
     * How the achievement is earned without a rule: `{ event, metric, field?, window, target }`,
     * or `{ metric: 'streak', streak, target }`. Null means only rules and challenges grant it.
     */
    criteria: jsonb('criteria'),
    /** Higher levels after the first: `[{ name, target, xp? }]`, with targets above the criteria's. */
    tiers: jsonb('tiers'),
    /** Secret badge. Players do not see it, or its progress, until they earn it. */
    hidden: boolean('hidden').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('achievements_proj_key_unique').on(table.projectId, table.key),
    index('achievements_proj_enabled_idx').on(table.projectId, table.enabled),
  ]
);

export const userAchievements = pgTable(
  'user_achievements',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    achievementId: text('achievement_id')
      .notNull()
      .references(() => achievements.id, { onDelete: 'cascade' }),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    ruleExecutionId: text('rule_execution_id').references(() => ruleExecutions.id, {
      onDelete: 'set null',
    }),
    metadata: jsonb('metadata'),
    awardedAt: timestamp('awarded_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'user_achievements_project_user_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [endUsers.projectId, endUsers.id],
    }).onDelete('cascade'),
    uniqueIndex('user_achievements_proj_user_ach_unique').on(
      table.projectId,
      table.userId,
      table.achievementId
    ),
    index('user_achievements_proj_user_idx').on(table.projectId, table.userId),
    index('user_achievements_proj_ach_idx').on(table.projectId, table.achievementId),
    index('user_achievements_user_idx').on(table.userId),
    index('user_achievements_ach_idx').on(table.achievementId),
    index('user_achievements_awarded_idx').on(table.awardedAt),
  ]
);

/** How far a user is toward an achievement that has criteria. */
export const userAchievementProgress = pgTable(
  'user_achievement_progress',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    achievementId: text('achievement_id')
      .notNull()
      .references(() => achievements.id, { onDelete: 'cascade' }),
    /** What the criteria measured at the last event. */
    value: doublePrecision('value').notNull().default(0),
    /** The highest tier reached. 0 means none yet, 1 is the achievement's own target. */
    tier: integer('tier').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'user_achievement_progress_project_user_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [endUsers.projectId, endUsers.id],
    }).onDelete('cascade'),
    uniqueIndex('user_achievement_progress_unique').on(table.projectId, table.userId, table.achievementId),
    index('user_achievement_progress_user_idx').on(table.projectId, table.userId),
  ]
);

export type UserAchievementProgress = typeof userAchievementProgress.$inferSelect;
export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
