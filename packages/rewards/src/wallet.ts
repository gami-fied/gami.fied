import { randomUUID } from 'crypto';
import { currencies, db, walletEntries, walletLots, type Currency } from '@gami/database';
import { createNotificationIntent } from '@gami/notifications';
import { and, asc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
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
/**
 * Tells people about points that expire within `days`, once per lot, so nobody loses points
 * without warning. Lots of one person and currency are summed into one notification.
 */
export async function warnExpiringLots(days = 3): Promise<number> {
  const cutoff = new Date(Date.now() + days * 86_400_000);
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ lot: walletLots, currencyKey: currencies.key, currencyName: currencies.name })
      .from(walletLots)
      .innerJoin(currencies, eq(currencies.id, walletLots.currencyId))
      .where(and(isNull(walletLots.expiryWarnedAt), gt(walletLots.remaining, 0), gt(walletLots.expiresAt, new Date()), lte(walletLots.expiresAt, cutoff)))
      .limit(1000)
      .for('update', { of: walletLots, skipLocked: true });
    const groups = new Map<string, { projectId: string; userId: string; currencyKey: string; currencyName: string; amount: number; first: Date; ids: string[] }>();
    for (const { lot, currencyKey, currencyName } of due) {
      const key = `${lot.userId}:${lot.currencyId}`;
      const group = groups.get(key) ?? { projectId: lot.projectId, userId: lot.userId, currencyKey, currencyName, amount: 0, first: lot.expiresAt!, ids: [] };
      group.amount += lot.remaining;
      if (lot.expiresAt! < group.first) group.first = lot.expiresAt!;
      group.ids.push(lot.id);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      await createNotificationIntent(tx, {
        projectId: group.projectId,
        userId: group.userId,
        type: 'points_expiring',
        data: { currency: group.currencyKey, currencyName: group.currencyName, amount: group.amount, expiresAt: group.first.toISOString() },
        sourceType: 'points_expiring',
        sourceId: group.ids.sort()[0]!,
      });
      await tx.update(walletLots).set({ expiryWarnedAt: new Date() }).where(inArray(walletLots.id, group.ids));
    }
    return groups.size;
  });
}

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
