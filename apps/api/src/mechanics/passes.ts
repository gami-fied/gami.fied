import crypto from 'crypto';
import { currencies, db, isUniqueViolation, seasonPasses, seasonPassProgress, xpLedger, type SeasonPass } from '@gami/database';
import { CurrencyUnavailableError, grantPrizes, InsufficientBalanceError, spendWallet, walletBalances, type Prize } from '@gami/rewards';
import { and, count, eq, gte, lt, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { bad, firstIssue, keySchema, MechanicError, notFound, optionalText, prizeProblems, prizesSchema, requirePlayer, sendMechanicError } from './shared.js';

export interface PassTier {
  /** Season XP that unlocks this tier. */
  xp: number;
  free: Prize[];
  premium: Prize[];
}

export type PassLane = 'free' | 'premium';

/** Rewards can still be claimed for this long after the season ends. XP earned then does not count. */
export const CLAIM_GRACE_DAYS = 7;
const DAY_MS = 86_400_000;

const passSchema = z
  .object({
    key: keySchema,
    name: z.string().min(1).max(128),
    description: optionalText(2000),
    startAt: z.string().datetime({ offset: true }),
    endAt: z.string().datetime({ offset: true }),
    /** The currency the premium lane is bought with. Leave it out for a pass with only a free lane. */
    premiumCurrency: keySchema.nullable().optional(),
    premiumCost: z.number().int().min(1).max(100_000_000).nullable().optional(),
    tiers: z
      .array(z.object({ xp: z.number().int().min(0).max(1_000_000_000), free: prizesSchema.default([]), premium: prizesSchema.default([]) }))
      .min(1, 'A pass needs at least one tier')
      .max(200),
    enabled: z.boolean().default(true),
  })
  .refine((value) => new Date(value.endAt) > new Date(value.startAt), { message: 'The season must end after it starts' })
  .refine((value) => value.tiers.every((tier, index) => index === 0 || tier.xp > value.tiers[index - 1]!.xp), { message: 'Each tier must need more XP than the one before it' });

type PassInput = z.infer<typeof passSchema>;

const tiersOf = (pass: Pick<SeasonPass, 'tiers'>) => (pass.tiers ?? []) as PassTier[];
const hasPremium = (pass: SeasonPass) => pass.premiumCurrencyId !== null && pass.premiumCost !== null;

export function passStatus(pass: Pick<SeasonPass, 'startAt' | 'endAt'>, now: Date): 'upcoming' | 'active' | 'ended' {
  if (now < pass.startAt) return 'upcoming';
  return now < pass.endAt ? 'active' : 'ended';
}

/** XP a player earned while the season ran. Deductions count against it, and it never goes below 0. */
export async function seasonXp(handle: Pick<typeof db, 'select'>, pass: SeasonPass, userId: string): Promise<number> {
  const [row] = await handle
    .select({ total: sql<number>`COALESCE(SUM(${xpLedger.amount}), 0)::int` })
    .from(xpLedger)
    .where(and(eq(xpLedger.projectId, pass.projectId), eq(xpLedger.userId, userId), gte(xpLedger.createdAt, pass.startAt), lt(xpLedger.createdAt, pass.endAt)));
  return Math.max(0, row?.total ?? 0);
}

async function findPass(projectId: string, ref: string) {
  const [pass] = await db
    .select()
    .from(seasonPasses)
    .where(and(eq(seasonPasses.projectId, projectId), or(eq(seasonPasses.id, ref), eq(seasonPasses.key, ref))));
  return pass ?? null;
}

/** Each pass that is running or can still be claimed from, as one player sees it. */
export async function passesForPlayer(projectId: string, userId: string, now: Date = new Date()) {
  const list = await db
    .select({ pass: seasonPasses, currencyKey: currencies.key, currencyName: currencies.name, symbol: currencies.symbol })
    .from(seasonPasses)
    .leftJoin(currencies, eq(currencies.id, seasonPasses.premiumCurrencyId))
    .where(and(eq(seasonPasses.projectId, projectId), eq(seasonPasses.enabled, true)))
    .orderBy(seasonPasses.startAt, seasonPasses.id);
  const open = list.filter(({ pass }) => now < new Date(pass.endAt.getTime() + CLAIM_GRACE_DAYS * DAY_MS));
  if (open.length === 0) return [];

  const [rows, balances] = await Promise.all([
    db
      .select()
      .from(seasonPassProgress)
      .where(and(eq(seasonPassProgress.projectId, projectId), eq(seasonPassProgress.userId, userId))),
    walletBalances(db, projectId, userId),
  ]);

  return Promise.all(
    open.map(async ({ pass, currencyKey, currencyName, symbol }) => {
      const mine = rows.find((row) => row.passId === pass.id);
      const claimed = new Set((mine?.claimed ?? []) as string[]);
      const premium = mine?.premium ?? false;
      const status = passStatus(pass, now);
      const xp = status === 'upcoming' ? 0 : await seasonXp(db, pass, userId);
      const tiers = tiersOf(pass).map((tier, index) => {
        const number = index + 1;
        const unlocked = xp >= tier.xp;
        return {
          tier: number,
          xp: tier.xp,
          unlocked,
          free: { prizes: tier.free, claimed: claimed.has(`free:${number}`), claimable: unlocked && tier.free.length > 0 && !claimed.has(`free:${number}`) },
          premium: { prizes: tier.premium, claimed: claimed.has(`premium:${number}`), claimable: unlocked && premium && tier.premium.length > 0 && !claimed.has(`premium:${number}`) },
        };
      });
      const next = tiers.find((tier) => !tier.unlocked);
      return {
        key: pass.key,
        name: pass.name,
        description: pass.description,
        status,
        startAt: pass.startAt,
        endAt: pass.endAt,
        /** Rewards can be claimed until this time. */
        claimUntil: new Date(pass.endAt.getTime() + CLAIM_GRACE_DAYS * DAY_MS),
        xp,
        tier: tiers.filter((tier) => tier.unlocked).length,
        xpToNextTier: next ? next.xp - xp : null,
        premium: {
          available: hasPremium(pass),
          owned: premium,
          cost: pass.premiumCost,
          currency: currencyKey,
          currencyName,
          currencySymbol: symbol,
          affordable: hasPremium(pass) && (balances.get(pass.premiumCurrencyId!) ?? 0) >= pass.premiumCost!,
        },
        tiers,
      };
    })
  );
}

/** Locks the player's row for a pass, making it first if needed. */
async function lockProgress(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], pass: SeasonPass, userId: string) {
  await tx
    .insert(seasonPassProgress)
    .values({ id: `spp_${crypto.randomUUID()}`, projectId: pass.projectId, userId, passId: pass.id })
    .onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(seasonPassProgress)
    .where(and(eq(seasonPassProgress.passId, pass.id), eq(seasonPassProgress.userId, userId)))
    .for('update');
  return row!;
}

export interface ClaimInput {
  projectId: string;
  user: string;
  passKey: string;
  /** Leave both out to claim everything that is ready. */
  tier?: number;
  lane?: PassLane;
  now?: Date;
}

/** Gives a player the rewards of the tiers they have reached. Each reward is given once. */
export async function claimPassRewards(input: ClaimInput) {
  const { projectId } = input;
  const now = input.now ?? new Date();
  const pass = await findPass(projectId, input.passKey);
  if (!pass || !pass.enabled) throw new MechanicError('PASS_UNAVAILABLE', 'That pass is not available', 404);
  if (now < pass.startAt) throw new MechanicError('PASS_NOT_STARTED', 'That season has not started yet');
  if (now >= new Date(pass.endAt.getTime() + CLAIM_GRACE_DAYS * DAY_MS)) throw new MechanicError('PASS_ENDED', 'That season is over, and its rewards can no longer be claimed');

  try {
    return await db.transaction(async (tx) => {
      const player = await requirePlayer(tx, projectId, input.user);
      const row = await lockProgress(tx, pass, player.id);
      const claimed = new Set(row.claimed as string[]);
      const xp = await seasonXp(tx, pass, player.id);
      const tiers = tiersOf(pass);
      const one = input.tier !== undefined || input.lane !== undefined;

      const wanted: { tier: number; lane: PassLane }[] = [];
      if (one) {
        const tier = input.tier ?? 0;
        const lane = input.lane ?? 'free';
        const definition = tiers[tier - 1];
        if (!definition) throw new MechanicError('TIER_NOT_FOUND', `This pass has no tier ${tier}`, 404);
        if (xp < definition.xp) throw new MechanicError('TIER_LOCKED', `Tier ${tier} needs ${definition.xp} season XP. You have ${xp}.`);
        if (lane === 'premium' && !row.premium) throw new MechanicError('PREMIUM_REQUIRED', 'That reward is on the premium lane');
        if (claimed.has(`${lane}:${tier}`)) throw new MechanicError('ALREADY_CLAIMED', 'You have already claimed that reward');
        if (definition[lane].length === 0) throw new MechanicError('NOTHING_TO_CLAIM', `Tier ${tier} has no ${lane} reward`);
        wanted.push({ tier, lane });
      } else {
        tiers.forEach((definition, index) => {
          if (xp < definition.xp) return;
          for (const lane of ['free', 'premium'] as const) {
            if (lane === 'premium' && !row.premium) continue;
            if (definition[lane].length > 0 && !claimed.has(`${lane}:${index + 1}`)) wanted.push({ tier: index + 1, lane });
          }
        });
      }

      const given: { tier: number; lane: PassLane; prizes: Prize[] }[] = [];
      for (const { tier, lane } of wanted) {
        const prizes = tiers[tier - 1]![lane];
        await grantPrizes(tx, { projectId, userId: player.id, prizes, reason: `${pass.name}: tier ${tier}`, source: `pass:${pass.id}:${player.id}:${lane}:${tier}`, metadata: { passId: pass.id, tier, lane } });
        claimed.add(`${lane}:${tier}`);
        given.push({ tier, lane, prizes });
      }
      if (given.length > 0) {
        await tx
          .update(seasonPassProgress)
          .set({ claimed: [...claimed], updatedAt: now })
          .where(eq(seasonPassProgress.id, row.id));
      }
      return { pass: pass.key, claimed: given };
    });
  } catch (err) {
    if (err instanceof CurrencyUnavailableError) throw new MechanicError('PASS_UNAVAILABLE', 'A reward on that pass is not available right now. Nothing was claimed.');
    throw err;
  }
}

/** Buys the premium lane. Rewards on it for tiers already reached can then be claimed. */
export async function buyPremium(input: { projectId: string; user: string; passKey: string; now?: Date }) {
  const { projectId } = input;
  const now = input.now ?? new Date();
  const pass = await findPass(projectId, input.passKey);
  if (!pass || !pass.enabled) throw new MechanicError('PASS_UNAVAILABLE', 'That pass is not available', 404);
  if (!hasPremium(pass)) throw new MechanicError('NO_PREMIUM_LANE', 'That pass has no premium lane');
  if (passStatus(pass, now) !== 'active') throw new MechanicError('PASS_NOT_ACTIVE', 'The premium lane can only be bought while the season is running');

  try {
    return await db.transaction(async (tx) => {
      const player = await requirePlayer(tx, projectId, input.user);
      const row = await lockProgress(tx, pass, player.id);
      if (row.premium) return { pass: pass.key, premium: true, duplicate: true, cost: 0 };
      const [currency] = await tx.select().from(currencies).where(eq(currencies.id, pass.premiumCurrencyId!));
      if (!currency?.enabled) throw new MechanicError('PASS_UNAVAILABLE', 'The premium lane is not available right now', 404);
      await spendWallet(tx, currency, { projectId, userId: player.id, amount: pass.premiumCost!, reason: `Premium lane: ${pass.name}`, kind: 'spend', metadata: { passId: pass.id } });
      await tx.update(seasonPassProgress).set({ premium: true, updatedAt: now }).where(eq(seasonPassProgress.id, row.id));
      return { pass: pass.key, premium: true, duplicate: false, cost: pass.premiumCost! };
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) throw new MechanicError('INSUFFICIENT_POINTS', `Not enough points: ${err.balance} available, ${err.needed} needed`);
    throw err;
  }
}

async function toRow(projectId: string, input: PassInput): Promise<{ problem: string } | { values: Omit<typeof seasonPasses.$inferInsert, 'id' | 'projectId'> }> {
  let premiumCurrencyId: string | null = null;
  const wantsPremium = Boolean(input.premiumCurrency) || Boolean(input.premiumCost);
  if (wantsPremium) {
    if (!input.premiumCurrency || !input.premiumCost) return { problem: 'A premium lane needs both a currency and a cost' };
    const [currency] = await db
      .select({ id: currencies.id })
      .from(currencies)
      .where(and(eq(currencies.projectId, projectId), eq(currencies.key, input.premiumCurrency)));
    if (!currency) return { problem: `There is no currency "${input.premiumCurrency}"` };
    premiumCurrencyId = currency.id;
  } else if (input.tiers.some((tier) => tier.premium.length > 0)) {
    return { problem: 'Set what the premium lane costs, or remove its rewards' };
  }
  const problems = await prizeProblems(projectId, input.tiers.flatMap((tier) => [...tier.free, ...tier.premium]));
  if (problems.length > 0) return { problem: problems[0]! };
  return {
    values: {
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      startAt: new Date(input.startAt),
      endAt: new Date(input.endAt),
      premiumCurrencyId,
      premiumCost: wantsPremium ? input.premiumCost! : null,
      tiers: input.tiers,
      enabled: input.enabled,
    },
  };
}

export async function passRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/passes', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [list, holders] = await Promise.all([
      db
        .select({ pass: seasonPasses, premiumCurrency: currencies.key })
        .from(seasonPasses)
        .leftJoin(currencies, eq(currencies.id, seasonPasses.premiumCurrencyId))
        .where(eq(seasonPasses.projectId, projectId))
        .orderBy(seasonPasses.startAt, seasonPasses.id),
      db
        .select({ passId: seasonPassProgress.passId, players: count(), premium: sql<number>`COUNT(*) FILTER (WHERE ${seasonPassProgress.premium})::int` })
        .from(seasonPassProgress)
        .where(eq(seasonPassProgress.projectId, projectId))
        .groupBy(seasonPassProgress.passId),
    ]);
    const stats = new Map(holders.map((row) => [row.passId, row]));
    const now = new Date();
    return reply.send({
      data: list.map(({ pass, premiumCurrency }) => ({ ...pass, premiumCurrency, status: passStatus(pass, now), players: stats.get(pass.id)?.players ?? 0, premiumPlayers: stats.get(pass.id)?.premium ?? 0 })),
    });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/passes', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = passSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, firstIssue(parsed.error, 'Invalid pass'));
    const row = await toRow(projectId, parsed.data);
    if ('problem' in row) return bad(reply, row.problem);
    try {
      const [created] = await db
        .insert(seasonPasses)
        .values({ id: `pass_${crypto.randomUUID()}`, projectId, ...row.values })
        .returning();
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A pass with the key "${parsed.data.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; passId: string } }>('/api/projects/:projectId/passes/:passId', async (request, reply) => {
    const { projectId, passId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const pass = await findPass(projectId, passId);
    if (!pass) return notFound(reply, 'Pass');
    if (typeof request.body !== 'object' || request.body === null) return bad(reply, 'Invalid pass');
    const [currency] = pass.premiumCurrencyId ? await db.select({ key: currencies.key }).from(currencies).where(eq(currencies.id, pass.premiumCurrencyId)) : [];
    const patch = { ...(request.body as Record<string, unknown>), key: pass.key };
    // The whole pass is checked again, so a change cannot leave it half valid.
    const merged = passSchema.safeParse({ ...pass, startAt: pass.startAt.toISOString(), endAt: pass.endAt.toISOString(), premiumCurrency: currency?.key ?? null, ...patch });
    if (!merged.success) return bad(reply, firstIssue(merged.error, 'Invalid pass'));
    const row = await toRow(projectId, merged.data);
    if ('problem' in row) return bad(reply, row.problem);
    const [updated] = await db
      .update(seasonPasses)
      .set({ ...row.values, updatedAt: new Date() })
      .where(eq(seasonPasses.id, pass.id))
      .returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; passId: string } }>('/api/projects/:projectId/passes/:passId', async (request, reply) => {
    const { projectId, passId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [deleted] = await db
      .delete(seasonPasses)
      .where(and(eq(seasonPasses.projectId, projectId), eq(seasonPasses.id, passId)))
      .returning({ id: seasonPasses.id });
    if (!deleted) return notFound(reply, 'Pass');
    return reply.status(204).send();
  });

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/passes', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      const player = await requirePlayer(db, projectId, userId);
      return reply.send({ data: await passesForPlayer(projectId, player.id) });
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });

  // Your server can give the premium lane itself, for example after a real-money purchase.
  fastify.post<{ Params: { projectId: string; userId: string; passKey: string } }>('/api/projects/:projectId/users/:userId/passes/:passKey/premium', async (request, reply) => {
    const { projectId, userId, passKey } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const pass = await findPass(projectId, passKey);
    if (!pass) return notFound(reply, 'Pass');
    try {
      const player = await requirePlayer(db, projectId, userId);
      await db.transaction(async (tx) => {
        const row = await lockProgress(tx, pass, player.id);
        if (!row.premium) await tx.update(seasonPassProgress).set({ premium: true, updatedAt: new Date() }).where(eq(seasonPassProgress.id, row.id));
      });
      return reply.send({ pass: pass.key, premium: true });
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });

  fastify.post<{ Params: { projectId: string; userId: string; passKey: string }; Body: { tier?: number; lane?: PassLane } }>(
    '/api/projects/:projectId/users/:userId/passes/:passKey/claim',
    async (request, reply) => {
      const { projectId, userId, passKey } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;
      const body = claimBody.safeParse(request.body ?? {});
      if (!body.success) return bad(reply, firstIssue(body.error, 'Invalid claim'));
      try {
        return reply.send(await claimPassRewards({ projectId, user: userId, passKey, ...body.data }));
      } catch (err) {
        return sendMechanicError(reply, err);
      }
    }
  );
}

export const claimBody = z.object({ tier: z.number().int().min(1).max(200).optional(), lane: z.enum(['free', 'premium']).optional() });
