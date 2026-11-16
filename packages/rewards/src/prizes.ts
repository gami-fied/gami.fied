import { randomUUID } from 'crypto';
import { achievements, cosmetics, currencies, userCosmetics } from '@gami/database';
import { and, eq, inArray } from 'drizzle-orm';
import { awardXp, type RewardTransaction } from './award-xp.js';
import { grantAchievement } from './grant-achievement.js';
import { creditWallet, findCurrency } from './wallet.js';

/**
 * Something a player can be given. Boxes, season passes, shared goals, leaderboard prizes and
 * journeys all pay out in these. Each names what it gives by key, so a design moves between
 * projects unchanged.
 */
export type Prize =
  | { type: 'xp'; amount: number }
  | { type: 'currency'; currency: string; amount: number }
  | { type: 'achievement'; achievement: string }
  | { type: 'cosmetic'; cosmetic: string };

export const PRIZE_TYPES = ['xp', 'currency', 'achievement', 'cosmetic'] as const;

export interface GrantPrizesInput {
  projectId: string;
  userId: string;
  prizes: Prize[];
  /** Shown in the player's XP and wallet history, such as `Mystery box: Daily chest`. */
  reason: string;
  /**
   * Names this one payout, such as `box:<open id>`. Paying the same source twice changes nothing,
   * so a caller can retry after a crash.
   */
  source: string;
  metadata?: Record<string, unknown>;
}

/** A short line for a prize, such as `50 XP` or `20 gems`. */
export function describePrize(prize: Prize): string {
  switch (prize.type) {
    case 'xp':
      return `${prize.amount} XP`;
    case 'currency':
      return `${prize.amount} ${prize.currency}`;
    case 'achievement':
      return `the ${prize.achievement} badge`;
    case 'cosmetic':
      return `the ${prize.cosmetic} cosmetic`;
  }
}

export const describePrizes = (prizes: Prize[]): string => (prizes.length === 0 ? 'nothing' : prizes.map(describePrize).join(', '));

/**
 * Pays a list of prizes inside the caller's transaction. A prize that names something missing or
 * turned off throws, which rolls the whole payout back, so a player never gets half of it.
 */
export async function grantPrizes(tx: RewardTransaction, input: GrantPrizesInput): Promise<void> {
  const { projectId, userId, reason, source } = input;
  const metadata = { ...input.metadata, source };

  for (const [index, prize] of input.prizes.entries()) {
    const idempotencyKey = `prize:${source}:${index}`;
    if (prize.type === 'xp') {
      await awardXp(tx, { projectId, userId, amount: prize.amount, reason, metadata, idempotencyKey });
    } else if (prize.type === 'currency') {
      const currency = await findCurrency(tx, projectId, prize.currency);
      await creditWallet(tx, currency, { projectId, userId, amount: prize.amount, reason, kind: 'earn', metadata, idempotencyKey });
    } else if (prize.type === 'achievement') {
      await grantAchievement(tx, { projectId, userId, achievementKey: prize.achievement, metadata });
    } else {
      const [cosmetic] = await tx
        .select({ id: cosmetics.id, enabled: cosmetics.enabled })
        .from(cosmetics)
        .where(and(eq(cosmetics.projectId, projectId), eq(cosmetics.key, prize.cosmetic)));
      if (!cosmetic || !cosmetic.enabled) throw new Error(`Cosmetic "${prize.cosmetic}" does not exist or is turned off`);
      await tx
        .insert(userCosmetics)
        .values({ id: `ucos_${randomUUID()}`, projectId, userId, cosmeticId: cosmetic.id, source: 'prize' })
        .onConflictDoNothing();
    }
  }
}

/**
 * Checks that everything a list of prizes names exists in the project. Returns the problems in
 * plain words, or an empty list. Used when a design is saved, so a mistake shows up then and not
 * when a player is owed something.
 */
export async function checkPrizes(handle: Pick<RewardTransaction, 'select'>, projectId: string, prizes: Prize[]): Promise<string[]> {
  const wanted = {
    currency: [...new Set(prizes.flatMap((prize) => (prize.type === 'currency' ? [prize.currency] : [])))],
    achievement: [...new Set(prizes.flatMap((prize) => (prize.type === 'achievement' ? [prize.achievement] : [])))],
    cosmetic: [...new Set(prizes.flatMap((prize) => (prize.type === 'cosmetic' ? [prize.cosmetic] : [])))],
  };
  const keysOf = async (table: typeof currencies | typeof achievements | typeof cosmetics, keys: string[]) =>
    keys.length === 0
      ? new Set<string>()
      : new Set(
          (
            await handle
              .select({ key: table.key })
              .from(table)
              .where(and(eq(table.projectId, projectId), inArray(table.key, keys)))
          ).map((row) => row.key)
        );
  const [haveCurrencies, haveAchievements, haveCosmetics] = await Promise.all([
    keysOf(currencies, wanted.currency),
    keysOf(achievements, wanted.achievement),
    keysOf(cosmetics, wanted.cosmetic),
  ]);
  return [
    ...wanted.currency.filter((key) => !haveCurrencies.has(key)).map((key) => `There is no currency "${key}"`),
    ...wanted.achievement.filter((key) => !haveAchievements.has(key)).map((key) => `There is no achievement "${key}"`),
    ...wanted.cosmetic.filter((key) => !haveCosmetics.has(key)).map((key) => `There is no cosmetic "${key}"`),
  ];
}
