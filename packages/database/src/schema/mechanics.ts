import { boolean, foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { achievements } from './achievements.js';
import { endUsers } from './end-users.js';
import { projects } from './projects.js';
import { currencies } from './store.js';

/*
 * Random rewards, season passes, teams and shared goals, cosmetics,
 * leaderboard prizes and journeys.
 *
 * Prizes are kept as JSON and name what they give by key (`{ type: 'currency', currency: 'gems' }`),
 * never by ID, so a design can be exported, imported and copied between projects as it is.
 */

const id = () => text('id').primaryKey();
const project = () =>
  text('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' });
const user = () =>
  text('user_id')
    .notNull()
    .references(() => endUsers.id, { onDelete: 'cascade' });
const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => at('created_at').defaultNow().notNull();
const updatedAt = () => at('updated_at').defaultNow().notNull();

// ---------- Random rewards ----------

/** A mystery box or a wheel: one try gives one of its items, picked by weight. */
export const lootBoxes = pgTable(
  'loot_boxes',
  {
    id: id(),
    projectId: project(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    /** `box` or `wheel`. It only changes how your app shows it. */
    kind: text('kind').default('box').notNull(),
    /** What a try costs. Null with a cost of 0 means it is free. */
    currencyId: text('currency_id').references(() => currencies.id, { onDelete: 'restrict' }),
    cost: integer('cost').default(0).notNull(),
    /** After this many tries in a row without a rare item, the next try gives one. Null means no guarantee. */
    guaranteeAfter: integer('guarantee_after'),
    /** Most tries one player gets in a UTC day, or null for no limit. */
    dailyLimit: integer('daily_limit'),
    /** `[{ id, name, weight, rare, prizes }]`. The chance of an item is its weight over the sum of all weights. */
    items: jsonb('items').default([]).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('loot_boxes_proj_key_unique').on(table.projectId, table.key)]
);

/** One try, with what it gave. */
export const lootBoxOpens = pgTable(
  'loot_box_opens',
  {
    id: id(),
    projectId: project(),
    userId: user(),
    boxId: text('box_id')
      .notNull()
      .references(() => lootBoxes.id, { onDelete: 'cascade' }),
    itemId: text('item_id').notNull(),
    itemName: text('item_name').notNull(),
    prizes: jsonb('prizes').default([]).notNull(),
    rare: boolean('rare').default(false).notNull(),
    /** True when the guarantee chose the item, not chance. */
    guaranteed: boolean('guaranteed').default(false).notNull(),
    cost: integer('cost').default(0).notNull(),
    idempotencyKey: text('idempotency_key'),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({ name: 'loot_box_opens_project_user_fk', columns: [table.projectId, table.userId], foreignColumns: [endUsers.projectId, endUsers.id] }).onDelete('cascade'),
    uniqueIndex('loot_box_opens_idempotency_unique').on(table.projectId, table.idempotencyKey),
    index('loot_box_opens_box_user_idx').on(table.boxId, table.userId, table.createdAt),
  ]
);

// ---------- Season pass ----------

/** A track of rewards for one season. Players climb it with the XP they earn while it runs. */
export const seasonPasses = pgTable(
  'season_passes',
  {
    id: id(),
    projectId: project(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    startAt: at('start_at').notNull(),
    endAt: at('end_at').notNull(),
    /** What the premium lane costs. Null means the pass has only a free lane. */
    premiumCurrencyId: text('premium_currency_id').references(() => currencies.id, { onDelete: 'restrict' }),
    premiumCost: integer('premium_cost'),
    /** `[{ xp, free, premium }]`, lowest first. `xp` is the season XP that unlocks the tier. */
    tiers: jsonb('tiers').default([]).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('season_passes_proj_key_unique').on(table.projectId, table.key)]
);

/** One player's pass: whether they hold the premium lane, and which rewards they have claimed. */
export const seasonPassProgress = pgTable(
  'season_pass_progress',
  {
    id: id(),
    projectId: project(),
    userId: user(),
    passId: text('pass_id')
      .notNull()
      .references(() => seasonPasses.id, { onDelete: 'cascade' }),
    premium: boolean('premium').default(false).notNull(),
    /** Claimed rewards, as `free:1` or `premium:3` (lane, then tier number from 1). */
    claimed: jsonb('claimed').default([]).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({ name: 'season_pass_progress_project_user_fk', columns: [table.projectId, table.userId], foreignColumns: [endUsers.projectId, endUsers.id] }).onDelete('cascade'),
    uniqueIndex('season_pass_progress_pass_user_unique').on(table.passId, table.userId),
  ]
);

// ---------- Teams and shared goals ----------

export const teams = pgTable(
  'teams',
  {
    id: id(),
    projectId: project(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    imageUrl: text('image_url'),
    /** Most members, or null for no limit. */
    maxMembers: integer('max_members'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('teams_proj_key_unique').on(table.projectId, table.key)]
);

/** A player is in one team at a time. */
export const teamMembers = pgTable(
  'team_members',
  {
    id: id(),
    projectId: project(),
    teamId: text('team_id')
      .notNull()
      .references(() => teams.id, { onDelete: 'cascade' }),
    userId: user(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({ name: 'team_members_project_user_fk', columns: [table.projectId, table.userId], foreignColumns: [endUsers.projectId, endUsers.id] }).onDelete('cascade'),
    uniqueIndex('team_members_proj_user_unique').on(table.projectId, table.userId),
    index('team_members_team_idx').on(table.teamId),
  ]
);

/** One target many players work towards: everyone together (`community`), or each team on its own (`team`). */
export const sharedGoals = pgTable(
  'shared_goals',
  {
    id: id(),
    projectId: project(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    scope: text('scope').default('community').notNull(),
    /** The event that counts. */
    trigger: text('trigger').notNull(),
    /** Payload conditions an event must meet to count, as for challenges. */
    filters: jsonb('filters'),
    /** A number in the event to add, such as `payload.distance`. Null counts each event as 1. */
    amountField: text('amount_field'),
    target: integer('target').notNull(),
    startAt: at('start_at'),
    endAt: at('end_at'),
    /** Prizes for everyone who contributed, paid when the target is reached. */
    rewards: jsonb('rewards').default([]).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('shared_goals_proj_key_unique').on(table.projectId, table.key), index('shared_goals_proj_trigger_idx').on(table.projectId, table.enabled, table.trigger)]
);

/** The running total, one row for a community goal and one per team for a team goal. */
export const sharedGoalProgress = pgTable(
  'shared_goal_progress',
  {
    id: id(),
    projectId: project(),
    goalId: text('goal_id')
      .notNull()
      .references(() => sharedGoals.id, { onDelete: 'cascade' }),
    /** The team's ID, or `all` for a community goal. */
    scopeKey: text('scope_key').default('all').notNull(),
    progress: integer('progress').default(0).notNull(),
    completedAt: at('completed_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('shared_goal_progress_goal_scope_unique').on(table.goalId, table.scopeKey)]
);

/** How much each player added, which is also the list of who gets the prizes. */
export const sharedGoalContributions = pgTable(
  'shared_goal_contributions',
  {
    id: id(),
    projectId: project(),
    goalId: text('goal_id')
      .notNull()
      .references(() => sharedGoals.id, { onDelete: 'cascade' }),
    scopeKey: text('scope_key').default('all').notNull(),
    userId: user(),
    amount: integer('amount').default(0).notNull(),
    /** Set once the prizes are paid, so each player is paid once. */
    paidAt: at('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({ name: 'shared_goal_contributions_project_user_fk', columns: [table.projectId, table.userId], foreignColumns: [endUsers.projectId, endUsers.id] }).onDelete('cascade'),
    uniqueIndex('shared_goal_contributions_goal_user_unique').on(table.goalId, table.userId),
    index('shared_goal_contributions_unpaid_idx').on(table.goalId, table.scopeKey, table.paidAt),
  ]
);

/** Which events a goal has already counted, so a retried event is not counted twice. */
export const sharedGoalEvents = pgTable(
  'shared_goal_events',
  {
    id: id(),
    projectId: project(),
    goalId: text('goal_id')
      .notNull()
      .references(() => sharedGoals.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex('shared_goal_events_goal_event_unique').on(table.goalId, table.eventId)]
);

// ---------- Cosmetics ----------

/** A title, an avatar frame or a profile item. It is unlocked by an achievement, bought, or given as a prize. */
export const cosmetics = pgTable(
  'cosmetics',
  {
    id: id(),
    projectId: project(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** `title`, `frame` or `item`. A player wears one of each kind at a time. */
    kind: text('kind').default('title').notNull(),
    imageUrl: text('image_url'),
    /** Everyone who holds this achievement owns the cosmetic. */
    achievementId: text('achievement_id').references(() => achievements.id, { onDelete: 'set null' }),
    /** What it costs to buy. Null means it cannot be bought. */
    currencyId: text('currency_id').references(() => currencies.id, { onDelete: 'restrict' }),
    cost: integer('cost'),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('cosmetics_proj_key_unique').on(table.projectId, table.key)]
);

export const userCosmetics = pgTable(
  'user_cosmetics',
  {
    id: id(),
    projectId: project(),
    userId: user(),
    cosmeticId: text('cosmetic_id')
      .notNull()
      .references(() => cosmetics.id, { onDelete: 'cascade' }),
    /** `purchase`, `achievement`, `prize` or `grant`. */
    source: text('source').default('grant').notNull(),
    equipped: boolean('equipped').default(false).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({ name: 'user_cosmetics_project_user_fk', columns: [table.projectId, table.userId], foreignColumns: [endUsers.projectId, endUsers.id] }).onDelete('cascade'),
    uniqueIndex('user_cosmetics_user_cosmetic_unique').on(table.userId, table.cosmeticId),
    index('user_cosmetics_equipped_idx').on(table.projectId, table.userId, table.equipped),
  ]
);

// ---------- Leaderboard prizes ----------

/** Prizes for a range of places on the daily, weekly or monthly board, paid when the period ends. */
export const leaderboardPrizes = pgTable(
  'leaderboard_prizes',
  {
    id: id(),
    projectId: project(),
    name: text('name').notNull(),
    /** `daily`, `weekly` or `monthly`, in UTC like the boards. */
    period: text('period').notNull(),
    fromRank: integer('from_rank').default(1).notNull(),
    toRank: integer('to_rank').default(1).notNull(),
    rewards: jsonb('rewards').default([]).notNull(),
    /** The last period that was paid, named by its first day, such as `2026-11-09`. */
    lastPaidPeriod: text('last_paid_period'),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index('leaderboard_prizes_proj_idx').on(table.projectId, table.enabled)]
);

/** One player paid for one place in one period. */
export const leaderboardPayouts = pgTable(
  'leaderboard_payouts',
  {
    id: id(),
    projectId: project(),
    userId: user(),
    prizeId: text('prize_id')
      .notNull()
      .references(() => leaderboardPrizes.id, { onDelete: 'cascade' }),
    period: text('period').notNull(),
    periodKey: text('period_key').notNull(),
    rank: integer('rank').notNull(),
    xp: integer('xp').default(0).notNull(),
    rewards: jsonb('rewards').default([]).notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({ name: 'leaderboard_payouts_project_user_fk', columns: [table.projectId, table.userId], foreignColumns: [endUsers.projectId, endUsers.id] }).onDelete('cascade'),
    uniqueIndex('leaderboard_payouts_prize_period_user_unique').on(table.prizeId, table.periodKey, table.userId),
    index('leaderboard_payouts_proj_idx').on(table.projectId, table.createdAt),
  ]
);

// ---------- Journeys ----------

/** A chain of challenges. Each one opens when the one before it is finished. */
export const journeys = pgTable(
  'journeys',
  {
    id: id(),
    projectId: project(),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** Challenge keys, in order. */
    steps: jsonb('steps').default([]).notNull(),
    /** Prizes for finishing the last step. */
    rewards: jsonb('rewards').default([]).notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex('journeys_proj_key_unique').on(table.projectId, table.key)]
);

export const journeyCompletions = pgTable(
  'journey_completions',
  {
    id: id(),
    projectId: project(),
    userId: user(),
    journeyId: text('journey_id')
      .notNull()
      .references(() => journeys.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (table) => [
    foreignKey({ name: 'journey_completions_project_user_fk', columns: [table.projectId, table.userId], foreignColumns: [endUsers.projectId, endUsers.id] }).onDelete('cascade'),
    uniqueIndex('journey_completions_journey_user_unique').on(table.journeyId, table.userId),
  ]
);

export type LootBox = typeof lootBoxes.$inferSelect;
export type LootBoxOpen = typeof lootBoxOpens.$inferSelect;
export type SeasonPass = typeof seasonPasses.$inferSelect;
export type SeasonPassProgress = typeof seasonPassProgress.$inferSelect;
export type Team = typeof teams.$inferSelect;
export type SharedGoal = typeof sharedGoals.$inferSelect;
export type Cosmetic = typeof cosmetics.$inferSelect;
export type LeaderboardPrize = typeof leaderboardPrizes.$inferSelect;
export type Journey = typeof journeys.$inferSelect;
