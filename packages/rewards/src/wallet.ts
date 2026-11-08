import { randomUUID } from 'crypto';
import { currencies, walletEntries, walletLots, type Currency } from '@gami/database';
import { and, asc, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';
import type { RewardTransaction } from './award-xp.js';

export class InsufficientBalanceError extends Error {
  constructor(
    public readonly balance: number,
    public readonly needed: number
  ) {
    super(`Not enough points: ${balance} available, ${needed} needed`);
    this.name = 'InsufficientBalanceError';
  }
}

export class CurrencyUnavailableError extends Error {
  constructor(key: string) {
    super(`Currency "${key}" does not exist or is turned off`);
    this.name = 'CurrencyUnavailableError';
  }
}

export type WalletKind = 'earn' | 'spend' | 'expire' | 'refund' | 'adjust';

interface WalletChange {
  projectId: string;
  userId: string;
  amount: number;
  reason: string;
  kind?: WalletKind;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string | null;
}

export async function findCurrency(tx: RewardTransaction, projectId: string, key: string): Promise<Currency> {
  const [currency] = await tx
    .select()
    .from(currencies)
    .where(and(eq(currencies.projectId, projectId), eq(currencies.key, key)));
  if (!currency || !currency.enabled) throw new CurrencyUnavailableError(key);
  return currency;
}

/** Adds points. A repeat of the same idempotency key does nothing and says so. */
export async function creditWallet(
  tx: RewardTransaction,
  currency: Currency,
  input: WalletChange,
  now: Date = new Date()
): Promise<{ duplicate: boolean; entryId?: string }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('A credit must be a whole number above 0');

  const [entry] = await tx
    .insert(walletEntries)
    .values({
      id: `wle_${randomUUID()}`,
      projectId: input.projectId,
      userId: input.userId,
      currencyId: currency.id,
      amount: input.amount,
      kind: input.kind ?? 'earn',
      reason: input.reason,
      metadata: input.metadata ?? {},
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: walletEntries.id });
  if (!entry) return { duplicate: true };

  await tx.insert(walletLots).values({
    id: `wlt_${randomUUID()}`,
    projectId: input.projectId,
    userId: input.userId,
    currencyId: currency.id,
    amount: input.amount,
    remaining: input.amount,
    expiresAt: currency.expiresAfterDays ? new Date(now.getTime() + currency.expiresAfterDays * 86_400_000) : null,
  });
  return { duplicate: false, entryId: entry.id };
}

/**
 * Takes points away, using the ones that expire soonest first. Throws if there are not enough,
 * which rolls the whole transaction back.
 */
export async function spendWallet(
  tx: RewardTransaction,
  currency: Currency,
  input: WalletChange,
  now: Date = new Date()
): Promise<{ duplicate: boolean; entryId?: string }> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error('An amount to spend must be a whole number above 0');

  const [entry] = await tx
    .insert(walletEntries)
    .values({
      id: `wle_${randomUUID()}`,
      projectId: input.projectId,
      userId: input.userId,
      currencyId: currency.id,
      amount: -input.amount,
      kind: input.kind ?? 'spend',
      reason: input.reason,
      metadata: input.metadata ?? {},
      idempotencyKey: input.idempotencyKey ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: walletEntries.id });
  if (!entry) return { duplicate: true };

  // Locking the lots serialises two purchases by the same person, so they cannot both spend the same points.
  const lots = await tx
    .select()
    .from(walletLots)
    .where(
      and(
        eq(walletLots.projectId, input.projectId),
        eq(walletLots.userId, input.userId),
        eq(walletLots.currencyId, currency.id),
        gt(walletLots.remaining, 0),
        or(isNull(walletLots.expiresAt), gt(walletLots.expiresAt, now))
      )
    )
    .orderBy(sql`${walletLots.expiresAt} ASC NULLS LAST`, asc(walletLots.createdAt))
    .for('update');

  const available = lots.reduce((sum, lot) => sum + lot.remaining, 0);
  if (available < input.amount) throw new InsufficientBalanceError(available, input.amount);

  let left = input.amount;
  for (const lot of lots) {
    if (left === 0) break;
    const take = Math.min(lot.remaining, left);
    await tx.update(walletLots).set({ remaining: lot.remaining - take }).where(eq(walletLots.id, lot.id));
    left -= take;
  }
  return { duplicate: false, entryId: entry.id };
}

/** What a person can spend right now. Expired points are not counted. */
export async function walletBalance(
  handle: Pick<RewardTransaction, 'select'>,
  projectId: string,
  userId: string,
  currencyId: string,
  now: Date = new Date()
): Promise<number> {
  const [row] = await handle
    .select({ total: sql<number>`COALESCE(SUM(${walletLots.remaining}), 0)::int` })
    .from(walletLots)
    .where(
      and(
        eq(walletLots.projectId, projectId),
        eq(walletLots.userId, userId),
        eq(walletLots.currencyId, currencyId),
        or(isNull(walletLots.expiresAt), gt(walletLots.expiresAt, now))
      )
    );
  return row?.total ?? 0;
}

/** Writes off points whose time is up, and records each write-off. Returns how many lots were closed. */
export async function expireLots(tx: RewardTransaction, now: Date = new Date(), batch = 500): Promise<number> {
  const stale = await tx
    .select()
    .from(walletLots)
    .where(and(gt(walletLots.remaining, 0), lte(walletLots.expiresAt, now)))
    .limit(batch)
    .for('update', { skipLocked: true });

  for (const lot of stale) {
    await tx.update(walletLots).set({ remaining: 0 }).where(eq(walletLots.id, lot.id));
    await tx.insert(walletEntries).values({
      id: `wle_${randomUUID()}`,
      projectId: lot.projectId,
      userId: lot.userId,
      currencyId: lot.currencyId,
      amount: -lot.remaining,
      kind: 'expire',
      reason: 'Points expired',
      metadata: { lotId: lot.id },
    });
  }
  return stale.length;
}
