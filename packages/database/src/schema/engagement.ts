import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { endUsers } from './end-users.js';
import { projects } from './projects.js';

/** A saved group of people, chosen by what you know about them, for leaderboards and reports. */
export const segments = pgTable(
  'segments',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** `{ match: 'all' | 'any', conditions: [{ field, operator, value }] }` */
    filter: jsonb('filter').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('segments_proj_key_unique').on(table.projectId, table.key)]
);

/**
 * Tiers of small groups that compete each week. The top of each group moves up a tier, and the
 * bottom moves down, so everyone plays against people at their own level.
 */
export const leagues = pgTable(
  'leagues',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    /** Tier names from lowest to highest, such as Bronze, Silver, Gold. */
    tiers: jsonb('tiers').$type<string[]>().notNull(),
    groupSize: integer('group_size').default(30).notNull(),
    promote: integer('promote').default(5).notNull(),
    relegate: integer('relegate').default(5).notNull(),
    cadence: text('cadence').$type<'daily' | 'weekly'>().default('weekly').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('leagues_proj_key_unique').on(table.projectId, table.key)]
);

export const leagueSeasons = pgTable(
  'league_seasons',
  {
    id: text('id').primaryKey(),
    leagueId: text('league_id')
      .notNull()
      .references(() => leagues.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    startsAt: timestamp('starts_at', { withTimezone: true, mode: 'date' }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true, mode: 'date' }).notNull(),
    /** Set once results are final and people have moved tiers. */
    closedAt: timestamp('closed_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('league_seasons_league_start_unique').on(table.leagueId, table.startsAt)]
);

export const leagueMembers = pgTable(
  'league_members',
  {
    id: text('id').primaryKey(),
    seasonId: text('season_id')
      .notNull()
      .references(() => leagueSeasons.id, { onDelete: 'cascade' }),
    leagueId: text('league_id')
      .notNull()
      .references(() => leagues.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    /** 0 is the lowest tier. */
    tier: integer('tier').notNull(),
    groupNo: integer('group_no').notNull(),
    /** Filled in when the season closes. */
    finalRank: integer('final_rank'),
    finalXp: integer('final_xp'),
    outcome: text('outcome').$type<'promoted' | 'relegated' | 'stayed'>(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('league_members_season_user_unique').on(table.seasonId, table.userId),
    index('league_members_group_idx').on(table.seasonId, table.tier, table.groupNo),
    index('league_members_user_idx').on(table.userId, table.leagueId),
  ]
);

/** Two rows per friendship, one each way, so "my friends" is one indexed lookup. */
export const friendships = pgTable(
  'friendships',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    friendId: text('friend_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('friendships_pair_unique').on(table.projectId, table.userId, table.friendId)]
);

/** A small thank-you or well-done from one player to another. */
export const kudos = pgTable(
  'kudos',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    fromUserId: text('from_user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    toUserId: text('to_user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    message: text('message'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    index('kudos_to_idx').on(table.projectId, table.toUserId, table.createdAt),
    index('kudos_from_idx').on(table.projectId, table.fromUserId, table.createdAt),
  ]
);

/** One per project: what inviting a friend earns, and when it counts. */
export const referralPrograms = pgTable('referral_programs', {
  projectId: text('project_id')
    .primaryKey()
    .references(() => projects.id, { onDelete: 'cascade' }),
  enabled: boolean('enabled').default(true).notNull(),
  /** The event the new player must send for the invite to count. Null counts it on sign-up. */
  qualifyingEvent: text('qualifying_event'),
  referrerXp: integer('referrer_xp').default(0).notNull(),
  refereeXp: integer('referee_xp').default(0).notNull(),
  /** Optional currency reward for the inviter. */
  currencyKey: text('currency_key'),
  referrerCurrency: integer('referrer_currency').default(0).notNull(),
  /** Most rewarded invites per person. Null means no limit. */
  maxRewardsPerReferrer: integer('max_rewards_per_referrer'),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

export const referralCodes = pgTable(
  'referral_codes',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('referral_codes_code_unique').on(table.projectId, table.code),
    uniqueIndex('referral_codes_user_unique').on(table.projectId, table.userId),
  ]
);

export const referrals = pgTable(
  'referrals',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    referrerId: text('referrer_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    refereeId: text('referee_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    status: text('status').$type<'pending' | 'rewarded' | 'capped'>().default('pending').notNull(),
    qualifiedAt: timestamp('qualified_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    // A person can only ever be invited once.
    uniqueIndex('referrals_referee_unique').on(table.projectId, table.refereeId),
    index('referrals_referrer_idx').on(table.projectId, table.referrerId),
  ]
);

/** Receives events from another service, such as Segment or Stripe, and turns them into events here. */
export const connectors = pgTable(
  'connectors',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    type: text('type').$type<'segment' | 'rudderstack' | 'stripe' | 'github'>().notNull(),
    name: text('name').notNull(),
    /** The shared or signing secret, encrypted. */
    secretEncrypted: text('secret_encrypted').notNull(),
    /** Optional per-type settings, such as which payload field names the user. */
    settings: jsonb('settings').$type<Record<string, unknown>>().default({}).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    receivedCount: integer('received_count').default(0).notNull(),
    lastReceivedAt: timestamp('last_received_at', { withTimezone: true, mode: 'date' }),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [index('connectors_project_idx').on(table.projectId)]
);

export type Segment = typeof segments.$inferSelect;
export type League = typeof leagues.$inferSelect;
export type LeagueSeason = typeof leagueSeasons.$inferSelect;
export type LeagueMember = typeof leagueMembers.$inferSelect;
export type Kudos = typeof kudos.$inferSelect;
export type ReferralProgram = typeof referralPrograms.$inferSelect;
export type Referral = typeof referrals.$inferSelect;
export type Connector = typeof connectors.$inferSelect;
