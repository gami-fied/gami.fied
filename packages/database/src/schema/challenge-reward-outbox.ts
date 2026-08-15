import { index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { challenges } from './challenges.js';
import { endUsers } from './end-users.js';
import { events } from './events.js';
import { projects } from './projects.js';

export const challengeRewardOutbox = pgTable(
  'challenge_reward_outbox',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    challengeId: text('challenge_id')
      .notNull()
      .references(() => challenges.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    rewardType: text('reward_type').notNull(),
    rewardPayload: jsonb('reward_payload').notNull(),
    status: text('status').default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    availableAt: timestamp('available_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_cro_status_available').on(table.status, table.availableAt),
    index('idx_cro_proj_user_ch').on(table.projectId, table.userId, table.challengeId),
  ]
);

export type ChallengeRewardOutboxRecord = typeof challengeRewardOutbox.$inferSelect;
export type NewChallengeRewardOutboxRecord = typeof challengeRewardOutbox.$inferInsert;
