import { index, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { challenges } from './challenges.js';
import { endUsers } from './end-users.js';
import { events } from './events.js';
import { projects } from './projects.js';

export const challengeEventProgress = pgTable(
  'challenge_event_progress',
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
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('challenge_event_progress_project_challenge_event_unique').on(
      table.projectId,
      table.challengeId,
      table.eventId
    ),
    index('idx_challenge_event_progress_proj_challenge').on(table.projectId, table.challengeId),
    index('idx_challenge_event_progress_proj_user').on(table.projectId, table.userId),
    index('idx_challenge_event_progress_event').on(table.eventId),
  ]
);

export type ChallengeEventProgress = typeof challengeEventProgress.$inferSelect;
export type NewChallengeEventProgress = typeof challengeEventProgress.$inferInsert;
