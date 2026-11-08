import {
  boolean,
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
import { projects } from './projects.js';

/** A kind of points besides XP, such as coins or gems, that people can spend. */
export const currencies = pgTable(
  'currencies',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    /** A short symbol or emoji shown next to amounts. */
    symbol: text('symbol'),
    /** Days until earned points expire. Null means they never do. */
    expiresAfterDays: integer('expires_after_days'),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('currencies_proj_key_unique').on(table.projectId, table.key)]
);

/**
 * Points a person earned, kept as lots so spending can use the ones that expire soonest first and
 * expiry only removes what was never spent.
 */
export const walletLots = pgTable(
  'wallet_lots',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    currencyId: text('currency_id')
      .notNull()
      .references(() => currencies.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    remaining: integer('remaining').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'wallet_lots_project_user_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [endUsers.projectId, endUsers.id],
    }).onDelete('cascade'),
    index('wallet_lots_spend_idx').on(table.projectId, table.userId, table.currencyId, table.expiresAt),
  ]
);

/** Every change to a wallet: earned, spent, expired, refunded or adjusted. */
export const walletEntries = pgTable(
  'wallet_entries',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    currencyId: text('currency_id')
      .notNull()
      .references(() => currencies.id, { onDelete: 'cascade' }),
    /** Positive adds points, negative removes them. */
    amount: integer('amount').notNull(),
    /** `earn`, `spend`, `expire`, `refund` or `adjust`. */
    kind: text('kind').notNull(),
    reason: text('reason').notNull(),
    metadata: jsonb('metadata'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'wallet_entries_project_user_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [endUsers.projectId, endUsers.id],
    }).onDelete('cascade'),
    uniqueIndex('wallet_entries_idempotency_unique').on(table.projectId, table.idempotencyKey),
    index('wallet_entries_user_idx').on(table.projectId, table.userId, table.currencyId, table.createdAt),
  ]
);

/** Something people can buy with a currency. */
export const rewards = pgTable(
  'rewards',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    imageUrl: text('image_url'),
    currencyId: text('currency_id')
      .notNull()
      .references(() => currencies.id, { onDelete: 'restrict' }),
    cost: integer('cost').notNull(),
    /** Units left, or null for unlimited. */
    stock: integer('stock'),
    /** Most one person can ever redeem, or null for no limit. */
    perUserLimit: integer('per_user_limit'),
    /** `code` hands out a code from a pool, and `fulfilled_by_you` leaves delivery to your own system. */
    kind: text('kind').default('fulfilled_by_you').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('rewards_proj_key_unique').on(table.projectId, table.key)]
);

/** Coupon or gift codes waiting to be given out for a reward. */
export const rewardCodes = pgTable(
  'reward_codes',
  {
    id: text('id').primaryKey(),
    rewardId: text('reward_id')
      .notNull()
      .references(() => rewards.id, { onDelete: 'cascade' }),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    /** Set when the code is given to someone. */
    redemptionId: text('redemption_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('reward_codes_reward_code_unique').on(table.rewardId, table.code),
    index('reward_codes_available_idx').on(table.rewardId, table.redemptionId),
  ]
);

/** One purchase. */
export const redemptions = pgTable(
  'redemptions',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => endUsers.id, { onDelete: 'cascade' }),
    rewardId: text('reward_id')
      .notNull()
      .references(() => rewards.id, { onDelete: 'cascade' }),
    rewardName: text('reward_name').notNull(),
    currencyId: text('currency_id').notNull(),
    cost: integer('cost').notNull(),
    /** `pending` until it is delivered, then `fulfilled`, or `cancelled` with the points refunded. */
    status: text('status').default('pending').notNull(),
    code: text('code'),
    note: text('note'),
    idempotencyKey: text('idempotency_key'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: 'redemptions_project_user_fk',
      columns: [table.projectId, table.userId],
      foreignColumns: [endUsers.projectId, endUsers.id],
    }).onDelete('cascade'),
    uniqueIndex('redemptions_idempotency_unique').on(table.projectId, table.idempotencyKey),
    index('redemptions_proj_status_idx').on(table.projectId, table.status, table.createdAt),
    index('redemptions_user_idx').on(table.projectId, table.userId, table.createdAt),
  ]
);

export type Currency = typeof currencies.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type Redemption = typeof redemptions.$inferSelect;
