import crypto from 'crypto';
import {
  currencies,
  db,
  endUsers,
  redemptions,
  rewardCodes,
  rewards,
  type Redemption,
} from '@gami/database';
import {
  creditWallet,
  CurrencyUnavailableError,
  InsufficientBalanceError,
  spendWallet,
} from '@gami/rewards';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, count, eq, isNull, ne } from 'drizzle-orm';

export class StoreError extends Error {
  constructor(
    public readonly code:
      | 'REWARD_UNAVAILABLE'
      | 'OUT_OF_STOCK'
      | 'OUT_OF_CODES'
      | 'LIMIT_REACHED'
      | 'INSUFFICIENT_POINTS'
      | 'USER_NOT_FOUND'
      | 'NOT_FOUND'
      | 'WRONG_STATE',
    message: string,
    public readonly status = 409
  ) {
    super(message);
    this.name = 'StoreError';
  }
}

export interface RedeemInput {
  projectId: string;
  /** The user's ID or your own ID for them. */
  user: string;
  rewardKey: string;
  idempotencyKey?: string | null;
}

/**
 * Buys a reward in one transaction: the stock, the person's limit, the points and the code all
 * change together or not at all. Two people cannot take the last item, and one person cannot
 * spend the same points twice.
 */
export async function redeemReward(input: RedeemInput): Promise<{ redemption: Redemption; duplicate: boolean }> {
  const { projectId } = input;

  try {
    return await db.transaction(async (tx) => {
      const [person] = await tx
        .select({ id: endUsers.id, active: endUsers.active, externalId: endUsers.externalId })
        .from(endUsers)
        .where(and(eq(endUsers.projectId, projectId), eq(endUsers.id, input.user)));
      const user =
        person ??
        (await tx.select({ id: endUsers.id, active: endUsers.active, externalId: endUsers.externalId }).from(endUsers).where(and(eq(endUsers.projectId, projectId), eq(endUsers.externalId, input.user))))[0];
      if (!user) throw new StoreError('USER_NOT_FOUND', 'User not found', 404);
      if (!user.active) throw new StoreError('USER_NOT_FOUND', 'This user is deactivated', 403);

      if (input.idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(redemptions)
          .where(and(eq(redemptions.projectId, projectId), eq(redemptions.idempotencyKey, input.idempotencyKey)));
        if (existing) return { redemption: existing, duplicate: true };
      }

      // Locking the reward serialises everyone buying it, so stock and codes cannot be oversold.
      const [reward] = await tx
        .select()
        .from(rewards)
        .where(and(eq(rewards.projectId, projectId), eq(rewards.key, input.rewardKey)))
        .for('update');
      if (!reward || !reward.enabled) throw new StoreError('REWARD_UNAVAILABLE', 'That reward is not available', 404);
      if (reward.stock !== null && reward.stock <= 0) throw new StoreError('OUT_OF_STOCK', 'That reward is out of stock');

      if (reward.perUserLimit !== null) {
        const [bought] = await tx
          .select({ total: count() })
          .from(redemptions)
          .where(and(eq(redemptions.userId, user.id), eq(redemptions.rewardId, reward.id), ne(redemptions.status, 'cancelled')));
        if ((bought?.total ?? 0) >= reward.perUserLimit) {
          throw new StoreError('LIMIT_REACHED', `You can redeem this at most ${reward.perUserLimit} time${reward.perUserLimit === 1 ? '' : 's'}`);
        }
      }

      const [currency] = await tx.select().from(currencies).where(eq(currencies.id, reward.currencyId));
      if (!currency?.enabled) throw new StoreError('REWARD_UNAVAILABLE', 'That reward is not available right now', 404);

      const redemptionId = `rdm_${crypto.randomUUID()}`;
      await spendWallet(tx, currency, {
        projectId,
        userId: user.id,
        amount: reward.cost,
        reason: `Bought ${reward.name}`,
        kind: 'spend',
        metadata: { rewardId: reward.id, redemptionId },
      });

      let code: string | null = null;
      if (reward.kind === 'code') {
        const [available] = await tx
          .select()
          .from(rewardCodes)
          .where(and(eq(rewardCodes.rewardId, reward.id), isNull(rewardCodes.redemptionId)))
          .limit(1)
          .for('update', { skipLocked: true });
        if (!available) throw new StoreError('OUT_OF_CODES', 'That reward has run out of codes');
        code = available.code;
        await tx.update(rewardCodes).set({ redemptionId }).where(eq(rewardCodes.id, available.id));
      }

      if (reward.stock !== null) await tx.update(rewards).set({ stock: reward.stock - 1, updatedAt: new Date() }).where(eq(rewards.id, reward.id));

      const [redemption] = await tx
        .insert(redemptions)
        .values({
          id: redemptionId,
          projectId,
          userId: user.id,
          rewardId: reward.id,
          rewardName: reward.name,
          currencyId: currency.id,
          cost: reward.cost,
          // A code is delivered in the response, so there is nothing left to do. Anything else waits for you.
          status: reward.kind === 'code' ? 'fulfilled' : 'pending',
          code,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();

      await createWebhookDelivery(tx, {
        projectId,
        eventId: redemptionId,
        eventType: 'reward.redeemed',
        userId: user.id,
        externalUserId: user.externalId,
        data: { redemptionId, rewardKey: reward.key, rewardName: reward.name, cost: reward.cost, currency: currency.key, code, status: redemption!.status },
      });

      return { redemption: redemption!, duplicate: false };
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) {
      throw new StoreError('INSUFFICIENT_POINTS', `Not enough points: ${err.balance} available, ${err.needed} needed`);
    }
    if (err instanceof CurrencyUnavailableError) throw new StoreError('REWARD_UNAVAILABLE', 'That reward is not available right now', 404);
    throw err;
  }
}

/** Marks a purchase delivered, once you have shipped it. */
export async function fulfillRedemption(projectId: string, redemptionId: string, note?: string): Promise<Redemption> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(redemptions)
      .where(and(eq(redemptions.id, redemptionId), eq(redemptions.projectId, projectId)))
      .for('update');
    if (!row) throw new StoreError('NOT_FOUND', 'Purchase not found', 404);
    if (row.status === 'fulfilled') return row;
    if (row.status !== 'pending') throw new StoreError('WRONG_STATE', `A ${row.status} purchase cannot be fulfilled`);
    const [updated] = await tx.update(redemptions).set({ status: 'fulfilled', note: note ?? row.note, updatedAt: new Date() }).where(eq(redemptions.id, row.id)).returning();
    return updated!;
  });
}

/** Cancels a purchase that has not been delivered: the points come back, and the stock and code are released. */
export async function cancelRedemption(projectId: string, redemptionId: string, note?: string): Promise<Redemption> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(redemptions)
      .where(and(eq(redemptions.id, redemptionId), eq(redemptions.projectId, projectId)))
      .for('update');
    if (!row) throw new StoreError('NOT_FOUND', 'Purchase not found', 404);
    if (row.status === 'cancelled') return row;
    if (row.status !== 'pending') throw new StoreError('WRONG_STATE', 'A delivered purchase cannot be cancelled');

    const [currency] = await tx.select().from(currencies).where(eq(currencies.id, row.currencyId));
    if (!currency) throw new StoreError('NOT_FOUND', 'The currency no longer exists', 404);
    await creditWallet(tx, currency, {
      projectId,
      userId: row.userId,
      amount: row.cost,
      reason: `Refund for ${row.rewardName}`,
      kind: 'refund',
      metadata: { redemptionId: row.id },
      idempotencyKey: `refund:${row.id}`,
    });

    const [reward] = await tx.select().from(rewards).where(eq(rewards.id, row.rewardId)).for('update');
    if (reward && reward.stock !== null) await tx.update(rewards).set({ stock: reward.stock + 1 }).where(eq(rewards.id, reward.id));
    await tx.update(rewardCodes).set({ redemptionId: null }).where(eq(rewardCodes.redemptionId, row.id));

    const [updated] = await tx.update(redemptions).set({ status: 'cancelled', note: note ?? row.note, updatedAt: new Date() }).where(eq(redemptions.id, row.id)).returning();
    await createWebhookDelivery(tx, {
      projectId,
      eventId: `${row.id}:cancelled`,
      eventType: 'reward.cancelled',
      userId: row.userId,
      data: { redemptionId: row.id, rewardName: row.rewardName, refunded: row.cost },
    });
    return updated!;
  });
}
