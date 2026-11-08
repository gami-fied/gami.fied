import {
  boolean,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { events } from './events.js';
import { projects } from './projects.js';

/** What counts toward a streak, how often, and how forgiving it is. */
export const streakDefinitions = pgTable(
  'streak_definitions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** The event type that counts as activity. */
    triggerEvent: text('trigger_event').notNull(),
    /** `daily` or `weekly`. */
    cadence: text('cadence').notNull().default('daily'),
    /** IANA zone used for users who have none of their own. */
    timeZone: text('time_zone').notNull().default('UTC'),
    /** A freeze is earned every time the streak reaches a multiple of this. 0 means never. */
    freezeEvery: integer('freeze_every').notNull().default(0),
    maxFreezes: integer('max_freezes').notNull().default(0),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('streak_definitions_proj_key_unique').on(table.projectId, table.key),
    index('streak_definitions_proj_trigger_idx').on(table.projectId, table.triggerEvent, table.enabled),
  ]
);

/** One user's progress on one streak. */
export const userStreaks = pgTable(
  'user_streaks',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    definitionId: text('definition_id')
      .notNull()
      .references(() => streakDefinitions.id, { onDelete: 'cascade' }),
    current: integer('current').notNull().default(0),
    longest: integer('longest').notNull().default(0),
    /** Index of the last period with activity. See `periodIndex` in `@gami/progression`. */
    lastPeriod: integer('last_period'),
    freezes: integer('freezes').notNull().default(0),
    /** The user's own IANA zone, when an event or their profile supplied one. */
    timeZone: text('time_zone'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'user_streaks_project_user_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [endUsers.projectId, endUsers.id],
    }).onDelete('cascade'),
    uniqueIndex('user_streaks_user_definition_unique').on(table.projectId, table.userId, table.definitionId),
    index('user_streaks_proj_definition_current_idx').on(table.projectId, table.definitionId, table.current),
  ]
);

/** Each time a streak grew, was saved by a freeze, or ended. Repeat activity in a period is not kept. */
export const streakHistory = pgTable(
  'streak_history',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    definitionId: text('definition_id')
      .notNull()
      .references(() => streakDefinitions.id, { onDelete: 'cascade' }),
    eventId: text('event_id').references(() => events.id, { onDelete: 'set null' }),
    /** `started`, `extended`, `frozen` or `reset`. */
    change: text('change').notNull(),
    current: integer('current').notNull(),
    freezesUsed: integer('freezes_used').notNull().default(0),
    freezesEarned: integer('freezes_earned').notNull().default(0),
    /** The streak that ended, for a `reset`. */
    brokenStreak: integer('broken_streak').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('streak_history_user_definition_idx').on(table.projectId, table.userId, table.definitionId, table.createdAt),
  ]
);

export type StreakDefinition = typeof streakDefinitions.$inferSelect;
export type UserStreak = typeof userStreaks.$inferSelect;
