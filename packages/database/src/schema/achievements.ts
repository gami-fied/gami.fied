import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
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
    uniqueIndex('user_achievements_proj_user_ach_unique').on(
      table.projectId,
      table.userId,
      table.achievementId
    ),
    uniqueIndex('user_achievements_rule_execution_unique')
      .on(table.ruleExecutionId)
      .where(sql`rule_execution_id IS NOT NULL`),
    index('user_achievements_proj_user_idx').on(table.projectId, table.userId),
    index('user_achievements_proj_ach_idx').on(table.projectId, table.achievementId),
    index('user_achievements_user_idx').on(table.userId),
    index('user_achievements_ach_idx').on(table.achievementId),
    index('user_achievements_awarded_idx').on(table.awardedAt),
  ]
);

export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;
export type UserAchievement = typeof userAchievements.$inferSelect;
export type NewUserAchievement = typeof userAchievements.$inferInsert;
