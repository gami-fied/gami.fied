import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { projects } from './projects.js';

export const challenges = pgTable(
  'challenges',
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
    trigger: text('trigger').notNull(),
    type: text('type').default('counter').notNull(),
    target: integer('target').notNull(),
    startAt: timestamp('start_at', { withTimezone: true, mode: 'date' }),
    endAt: timestamp('end_at', { withTimezone: true, mode: 'date' }),
    rewards: jsonb('rewards').default([]).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('challenges_proj_key_unique').on(table.projectId, table.key),
    index('idx_challenges_proj_enabled_trigger').on(table.projectId, table.enabled, table.trigger),
  ]
);

export const userChallengeProgress = pgTable(
  'user_challenge_progress',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    progress: integer('progress').default(0).notNull(),
    completed: boolean('completed').default(false).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('user_challenge_progress_proj_user_challenge_unique').on(
      table.projectId,
      table.userId,
      table.challengeId
    ),
    index('idx_user_challenge_progress_proj_challenge').on(table.projectId, table.challengeId),
    index('idx_user_challenge_progress_proj_user').on(table.projectId, table.userId),
    index('idx_user_challenge_progress_challenge_completed').on(table.challengeId, table.completed),
    index('idx_user_challenge_progress_challenge_progress').on(table.challengeId, table.progress),
  ]
);

export type Challenge = typeof challenges.$inferSelect;
export type NewChallenge = typeof challenges.$inferInsert;
export type UserChallengeProgress = typeof userChallengeProgress.$inferSelect;
export type NewUserChallengeProgress = typeof userChallengeProgress.$inferInsert;
