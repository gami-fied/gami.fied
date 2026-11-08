import crypto from 'crypto';
import {
  currencies,
  db,
  endUsers,
  isUniqueViolation,
  redemptions,
  rewardCodes,
  rewards,
  walletEntries,
  walletLots,
} from '@gami/database';
import {
  creditWallet,
  CurrencyUnavailableError,
  findCurrency,
  InsufficientBalanceError,
  spendWallet,
  walletBalance,
} from '@gami/rewards';
import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { cancelRedemption, fulfillRedemption, redeemReward, StoreError } from './redeem.js';

const key = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, numbers, dashes and underscores');

const currencySchema = z.object({
  key,
  name: z.string().min(1).max(64),
  symbol: z.string().max(8).nullable().optional(),
  expiresAfterDays: z.number().int().min(1).max(3650).nullable().optional(),
  enabled: z.boolean().default(true),
});

const rewardSchema = z.object({
  key,
  name: z.string().min(1).max(128),
  description: z.string().max(2000).nullable().optional(),
  imageUrl: z.string().url().max(512).nullable().optional().or(z.literal('')),
  currency: key,
  cost: z.number().int().min(1).max(100_000_000),
  stock: z.number().int().min(0).max(100_000_000).nullable().optional(),
  perUserLimit: z.number().int().min(1).max(10_000).nullable().optional(),
  kind: z.enum(['fulfilled_by_you', 'code']).default('fulfilled_by_you'),
  enabled: z.boolean().default(true),
});

export function sendStoreError(reply: FastifyReply, err: unknown) {
  if (err instanceof StoreError) return reply.status(err.status).send({ error: err.code, code: err.code, message: err.message });
  throw err;
}

const bad = (reply: FastifyReply, message: string) => reply.status(400).send({ error: 'Bad Request', message });

export async function storeRoutes(fastify: FastifyInstance) {
  const resolveUser = async (projectId: string, userId: string) =>
    (
      await db
        .select({ id: endUsers.id, externalId: endUsers.externalId })
        .from(endUsers)
        .where(and(eq(endUsers.projectId, projectId), sql`(${endUsers.id} = ${userId} OR ${endUsers.externalId} = ${userId})`))
    )[0];

  // ---------- Currencies ----------
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/currencies', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const data = await db.select().from(currencies).where(eq(currencies.projectId, projectId)).orderBy(currencies.createdAt);
    return reply.send({ data });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/currencies', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = currencySchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid currency');
    try {
      const [created] = await db
        .insert(currencies)
        .values({ id: `cur_${crypto.randomUUID()}`, projectId, ...parsed.data, symbol: parsed.data.symbol ?? null, expiresAfterDays: parsed.data.expiresAfterDays ?? null })
        .returning();
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A currency with the key "${parsed.data.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; currencyId: string } }>('/api/projects/:projectId/currencies/:currencyId', async (request, reply) => {
    const { projectId, currencyId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = currencySchema.omit({ key: true }).partial().safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid currency');
    // Expiry applies to points earned from now on. Points already earned keep their original date.
    const [updated] = await db.update(currencies).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(currencies.id, currencyId), eq(currencies.projectId, projectId))).returning();
    if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Currency not found' });
    return reply.send(updated);
  });

  // ---------- Rewards ----------
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/rewards', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;

    const [list, codeCounts, bought] = await Promise.all([
      db
        .select({ reward: rewards, currencyKey: currencies.key, currencyName: currencies.name, symbol: currencies.symbol })
        .from(rewards)
        .innerJoin(currencies, eq(currencies.id, rewards.currencyId))
        .where(eq(rewards.projectId, projectId))
        .orderBy(desc(rewards.createdAt)),
      db
        .select({ rewardId: rewardCodes.rewardId, total: count(), left: sql<number>`COUNT(*) FILTER (WHERE ${rewardCodes.redemptionId} IS NULL)::int` })
        .from(rewardCodes)
        .where(eq(rewardCodes.projectId, projectId))
        .groupBy(rewardCodes.rewardId),
      db
        .select({ rewardId: redemptions.rewardId, total: count() })
        .from(redemptions)
        .where(and(eq(redemptions.projectId, projectId), sql`${redemptions.status} <> 'cancelled'`))
        .groupBy(redemptions.rewardId),
    ]);
    const codesFor = new Map(codeCounts.map((row) => [row.rewardId, row]));
    const soldFor = new Map(bought.map((row) => [row.rewardId, row.total]));

    return reply.send({
      data: list.map(({ reward, currencyKey, currencyName, symbol }) => ({
        ...reward,
        currency: currencyKey,
        currencyName,
        currencySymbol: symbol,
        codesTotal: codesFor.get(reward.id)?.total ?? 0,
        codesLeft: codesFor.get(reward.id)?.left ?? 0,
        redeemed: soldFor.get(reward.id) ?? 0,
      })),
    });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/rewards', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = rewardSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid reward');
    const d = parsed.data;

    const [currency] = await db.select().from(currencies).where(and(eq(currencies.projectId, projectId), eq(currencies.key, d.currency)));
    if (!currency) return bad(reply, `There is no currency "${d.currency}". Create it first.`);
    try {
      const [created] = await db
        .insert(rewards)
        .values({
          id: `rwd_${crypto.randomUUID()}`,
          projectId,
          key: d.key,
          name: d.name,
          description: d.description ?? null,
          imageUrl: d.imageUrl || null,
          currencyId: currency.id,
          cost: d.cost,
          stock: d.stock ?? null,
          perUserLimit: d.perUserLimit ?? null,
          kind: d.kind,
          enabled: d.enabled,
        })
        .returning();
      return reply.status(201).send({ ...created, currency: currency.key });
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A reward with the key "${d.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; rewardId: string } }>('/api/projects/:projectId/rewards/:rewardId', async (request, reply) => {
    const { projectId, rewardId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = rewardSchema.omit({ key: true, currency: true, kind: true }).partial().safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid reward');
    const d = parsed.data;
    const changes: Record<string, unknown> = { ...d, updatedAt: new Date() };
    if (d.imageUrl !== undefined) changes['imageUrl'] = d.imageUrl || null;
    const [updated] = await db.update(rewards).set(changes).where(and(eq(rewards.id, rewardId), eq(rewards.projectId, projectId))).returning();
    if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Reward not found' });
    return reply.send(updated);
  });

  // A reward that has been bought is history, so it can only be switched off.
  fastify.delete<{ Params: { projectId: string; rewardId: string } }>('/api/projects/:projectId/rewards/:rewardId', async (request, reply) => {
    const { projectId, rewardId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [sold] = await db.select({ total: count() }).from(redemptions).where(eq(redemptions.rewardId, rewardId));
    if ((sold?.total ?? 0) > 0) return reply.status(409).send({ error: 'Conflict', message: 'This reward has been bought, so it can only be switched off.' });
    const [gone] = await db.delete(rewards).where(and(eq(rewards.id, rewardId), eq(rewards.projectId, projectId))).returning({ id: rewards.id });
    if (!gone) return reply.status(404).send({ error: 'Not Found', message: 'Reward not found' });
    return reply.status(204).send();
  });

  // Add codes to hand out, one per purchase. Duplicates are skipped.
  fastify.post<{ Params: { projectId: string; rewardId: string } }>('/api/projects/:projectId/rewards/:rewardId/codes', async (request, reply) => {
    const { projectId, rewardId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = z.object({ codes: z.array(z.string().min(1).max(256)).min(1).max(5000) }).safeParse(request.body);
    if (!parsed.success) return bad(reply, 'Send a list of codes, up to 5,000 at a time');

    const [reward] = await db.select().from(rewards).where(and(eq(rewards.id, rewardId), eq(rewards.projectId, projectId)));
    if (!reward) return reply.status(404).send({ error: 'Not Found', message: 'Reward not found' });
    if (reward.kind !== 'code') return bad(reply, 'Only a reward that hands out codes can have codes');

    const unique = [...new Set(parsed.data.codes.map((code) => code.trim()).filter(Boolean))];
    const added = await db
      .insert(rewardCodes)
      .values(unique.map((code) => ({ id: `rcd_${crypto.randomUUID()}`, rewardId, projectId, code })))
      .onConflictDoNothing()
      .returning({ id: rewardCodes.id });
    return reply.status(201).send({ added: added.length, skipped: unique.length - added.length });
  });

  // ---------- Purchases ----------
  fastify.get<{ Params: { projectId: string }; Querystring: { status?: string; limit?: string; userId?: string } }>(
    '/api/projects/:projectId/redemptions',
    async (request, reply) => {
      const { projectId } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;
      const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
      const data = await db
        .select({
          id: redemptions.id,
          userId: redemptions.userId,
          externalId: endUsers.externalId,
          name: endUsers.name,
          rewardName: redemptions.rewardName,
          cost: redemptions.cost,
          status: redemptions.status,
          code: redemptions.code,
          note: redemptions.note,
          createdAt: redemptions.createdAt,
        })
        .from(redemptions)
        .innerJoin(endUsers, eq(endUsers.id, redemptions.userId))
        .where(
          and(
            eq(redemptions.projectId, projectId),
            request.query.status ? eq(redemptions.status, request.query.status) : undefined,
            request.query.userId ? eq(redemptions.userId, request.query.userId) : undefined
          )
        )
        .orderBy(desc(redemptions.createdAt))
        .limit(limit);
      return reply.send({ data });
    }
  );

  const note = z.object({ note: z.string().max(500).optional() });

  fastify.post<{ Params: { projectId: string; redemptionId: string } }>('/api/projects/:projectId/redemptions/:redemptionId/fulfill', async (request, reply) => {
    const { projectId, redemptionId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      return reply.send(await fulfillRedemption(projectId, redemptionId, note.safeParse(request.body ?? {}).data?.note));
    } catch (err) {
      return sendStoreError(reply, err);
    }
  });

  fastify.post<{ Params: { projectId: string; redemptionId: string } }>('/api/projects/:projectId/redemptions/:redemptionId/cancel', async (request, reply) => {
    const { projectId, redemptionId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      return reply.send(await cancelRedemption(projectId, redemptionId, note.safeParse(request.body ?? {}).data?.note));
    } catch (err) {
      return sendStoreError(reply, err);
    }
  });

  // ---------- A user's wallets ----------
  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/wallets', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const user = await resolveUser(projectId, userId);
    if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });

    const list = await db.select().from(currencies).where(and(eq(currencies.projectId, projectId), eq(currencies.enabled, true))).orderBy(currencies.createdAt);
    const data = await Promise.all(
      list.map(async (currency) => ({
        currency: currency.key,
        name: currency.name,
        symbol: currency.symbol,
        balance: await walletBalance(db, projectId, user.id, currency.id),
        expiringSoon: await expiringWithin(projectId, user.id, currency.id, 7),
      }))
    );
    return reply.send({ data });
  });

  fastify.get<{ Params: { projectId: string; userId: string; currencyKey: string }; Querystring: { limit?: string } }>(
    '/api/projects/:projectId/users/:userId/wallets/:currencyKey/ledger',
    async (request, reply) => {
      const { projectId, userId, currencyKey } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;
      const user = await resolveUser(projectId, userId);
      if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
      const [currency] = await db.select().from(currencies).where(and(eq(currencies.projectId, projectId), eq(currencies.key, currencyKey)));
      if (!currency) return reply.status(404).send({ error: 'Not Found', message: 'Currency not found' });

      const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
      const data = await db
        .select()
        .from(walletEntries)
        .where(and(eq(walletEntries.projectId, projectId), eq(walletEntries.userId, user.id), eq(walletEntries.currencyId, currency.id)))
        .orderBy(desc(walletEntries.createdAt))
        .limit(limit);
      return reply.send({ data });
    }
  );

  // Give or take points by hand, recorded in the ledger with a reason.
  fastify.post<{ Params: { projectId: string; userId: string; currencyKey: string } }>(
    '/api/projects/:projectId/users/:userId/wallets/:currencyKey/adjust',
    async (request, reply) => {
      const { projectId, userId, currencyKey } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;
      const parsed = z
        .object({ amount: z.number().int().refine((n) => n !== 0, 'The amount cannot be 0').refine((n) => Math.abs(n) <= 10_000_000), reason: z.string().min(1).max(256), idempotencyKey: z.string().max(128).optional() })
        .safeParse(request.body);
      if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Send an amount and a reason');
      const user = await resolveUser(projectId, userId);
      if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });

      try {
        const result = await db.transaction(async (tx) => {
          const currency = await findCurrency(tx, projectId, currencyKey);
          const change = { projectId, userId: user.id, reason: parsed.data.reason, kind: 'adjust' as const, idempotencyKey: parsed.data.idempotencyKey ? `adjust:${parsed.data.idempotencyKey}` : null };
          if (parsed.data.amount > 0) await creditWallet(tx, currency, { ...change, amount: parsed.data.amount });
          else await spendWallet(tx, currency, { ...change, amount: -parsed.data.amount });
          return walletBalance(tx, projectId, user.id, currency.id);
        });
        return reply.status(201).send({ balance: result });
      } catch (err) {
        if (err instanceof CurrencyUnavailableError) return reply.status(404).send({ error: 'Not Found', message: err.message });
        if (err instanceof InsufficientBalanceError) return reply.status(409).send({ error: 'INSUFFICIENT_POINTS', message: err.message });
        throw err;
      }
    }
  );

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/redemptions', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const user = await resolveUser(projectId, userId);
    if (!user) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    const data = await db.select().from(redemptions).where(and(eq(redemptions.projectId, projectId), eq(redemptions.userId, user.id))).orderBy(desc(redemptions.createdAt)).limit(100);
    return reply.send({ data });
  });

  // Buy a reward on a user's behalf, from your server.
  fastify.post<{ Params: { projectId: string; userId: string; rewardKey: string } }>(
    '/api/projects/:projectId/users/:userId/rewards/:rewardKey/redeem',
    async (request, reply) => {
      const { projectId, userId, rewardKey } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;
      const parsed = z.object({ idempotencyKey: z.string().max(128).optional() }).safeParse(request.body ?? {});
      try {
        const { redemption, duplicate } = await redeemReward({ projectId, user: userId, rewardKey, idempotencyKey: parsed.success ? parsed.data.idempotencyKey : undefined });
        return reply.status(duplicate ? 200 : 201).send({ ...redemption, duplicate });
      } catch (err) {
        return sendStoreError(reply, err);
      }
    }
  );
}

/** Points that will expire in the next few days, so a player can be told to spend them. */
async function expiringWithin(projectId: string, userId: string, currencyId: string, days: number): Promise<number> {
  const soon = new Date(Date.now() + days * 86_400_000);
  const [row] = await db
    .select({ total: sql<number>`COALESCE(SUM(${walletLots.remaining}), 0)::int` })
    .from(walletLots)
    .where(
      and(
        eq(walletLots.projectId, projectId),
        eq(walletLots.userId, userId),
        eq(walletLots.currencyId, currencyId),
        sql`${walletLots.remaining} > 0 AND ${walletLots.expiresAt} IS NOT NULL AND ${walletLots.expiresAt} > now() AND ${walletLots.expiresAt} <= ${soon.toISOString()}::timestamptz`
      )
    );
  return row?.total ?? 0;
}
