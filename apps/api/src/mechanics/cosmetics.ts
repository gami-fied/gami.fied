import crypto from 'crypto';
import { achievements, cosmetics, currencies, db, isUniqueViolation, userAchievements, userCosmetics, type Cosmetic } from '@gami/database';
import { InsufficientBalanceError, spendWallet, walletBalances } from '@gami/rewards';
import { and, count, eq, inArray, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { bad, firstIssue, keySchema, MechanicError, notFound, optionalText, optionalUrl, requirePlayer, sendMechanicError } from './shared.js';

export const COSMETIC_KINDS = ['title', 'frame', 'item'] as const;

export const cosmeticSchema = z.object({
  key: keySchema,
  name: z.string().min(1).max(128),
  description: optionalText(2000),
  kind: z.enum(COSMETIC_KINDS).default('title'),
  imageUrl: optionalUrl,
  /** Everyone who holds this achievement owns the cosmetic. */
  achievement: keySchema.nullable().optional(),
  /** What it is bought with. Leave both out for a cosmetic that cannot be bought. */
  currency: keySchema.nullable().optional(),
  cost: z.number().int().min(1).max(100_000_000).nullable().optional(),
  enabled: z.boolean().default(true),
});

type CosmeticInput = z.infer<typeof cosmeticSchema>;

async function findCosmetic(projectId: string, ref: string): Promise<Cosmetic | null> {
  const [row] = await db
    .select()
    .from(cosmetics)
    .where(and(eq(cosmetics.projectId, projectId), or(eq(cosmetics.id, ref), eq(cosmetics.key, ref))));
  return row ?? null;
}

/** The cosmetics a player owns: the ones they were given or bought, and the ones their achievements unlock. */
async function ownedIds(handle: Pick<typeof db, 'select'>, projectId: string, userId: string, list: Cosmetic[]) {
  const [rows, earned] = await Promise.all([
    handle
      .select()
      .from(userCosmetics)
      .where(and(eq(userCosmetics.projectId, projectId), eq(userCosmetics.userId, userId))),
    list.some((cosmetic) => cosmetic.achievementId)
      ? handle
          .select({ achievementId: userAchievements.achievementId })
          .from(userAchievements)
          .where(and(eq(userAchievements.projectId, projectId), eq(userAchievements.userId, userId)))
      : [],
  ]);
  const badges = new Set(earned.map((row) => row.achievementId));
  const owned = new Set(rows.map((row) => row.cosmeticId));
  for (const cosmetic of list) if (cosmetic.achievementId && badges.has(cosmetic.achievementId)) owned.add(cosmetic.id);
  return { owned, equipped: new Set(rows.filter((row) => row.equipped).map((row) => row.cosmeticId)) };
}

/** Every cosmetic in the project as one player sees it: owned, worn, and how to get the rest. */
export async function cosmeticsForPlayer(projectId: string, userId: string) {
  const list = await db
    .select({ cosmetic: cosmetics, currencyKey: currencies.key, currencySymbol: currencies.symbol, currencyEnabled: currencies.enabled, achievementKey: achievements.key, achievementName: achievements.name })
    .from(cosmetics)
    .leftJoin(currencies, eq(currencies.id, cosmetics.currencyId))
    .leftJoin(achievements, eq(achievements.id, cosmetics.achievementId))
    .where(and(eq(cosmetics.projectId, projectId), eq(cosmetics.enabled, true)))
    .orderBy(cosmetics.kind, cosmetics.createdAt, cosmetics.id);
  if (list.length === 0) return [];
  const [{ owned, equipped }, balances] = await Promise.all([
    ownedIds(
      db,
      projectId,
      userId,
      list.map((row) => row.cosmetic)
    ),
    walletBalances(db, projectId, userId),
  ]);
  return list.map(({ cosmetic, currencyKey, currencySymbol, currencyEnabled, achievementKey, achievementName }) => {
    const forSale = cosmetic.cost !== null && cosmetic.currencyId !== null && Boolean(currencyEnabled);
    return {
      key: cosmetic.key,
      name: cosmetic.name,
      description: cosmetic.description,
      kind: cosmetic.kind,
      imageUrl: cosmetic.imageUrl,
      owned: owned.has(cosmetic.id),
      equipped: equipped.has(cosmetic.id),
      /** The achievement that unlocks it, if one does. */
      achievement: achievementKey ? { key: achievementKey, name: achievementName } : null,
      cost: forSale ? cosmetic.cost : null,
      currency: forSale ? currencyKey : null,
      currencySymbol: forSale ? currencySymbol : null,
      affordable: forSale && (balances.get(cosmetic.currencyId!) ?? 0) >= cosmetic.cost!,
    };
  });
}

export interface WornCosmetics {
  title: { key: string; name: string } | null;
  frame: { key: string; name: string; imageUrl: string | null } | null;
  items: { key: string; name: string; imageUrl: string | null }[];
}

/** What each of some players is wearing, for profiles and leaderboard rows. */
export async function wornBy(projectId: string, userIds: string[]): Promise<Map<string, WornCosmetics>> {
  const worn = new Map<string, WornCosmetics>();
  if (userIds.length === 0) return worn;
  const rows = await db
    .select({ userId: userCosmetics.userId, key: cosmetics.key, name: cosmetics.name, kind: cosmetics.kind, imageUrl: cosmetics.imageUrl })
    .from(userCosmetics)
    .innerJoin(cosmetics, eq(cosmetics.id, userCosmetics.cosmeticId))
    .where(and(eq(userCosmetics.projectId, projectId), inArray(userCosmetics.userId, userIds), eq(userCosmetics.equipped, true), eq(cosmetics.enabled, true)));
  for (const row of rows) {
    const entry = worn.get(row.userId) ?? { title: null, frame: null, items: [] };
    if (row.kind === 'title') entry.title = { key: row.key, name: row.name };
    else if (row.kind === 'frame') entry.frame = { key: row.key, name: row.name, imageUrl: row.imageUrl };
    else entry.items.push({ key: row.key, name: row.name, imageUrl: row.imageUrl });
    worn.set(row.userId, entry);
  }
  return worn;
}

export const NOTHING_WORN: WornCosmetics = { title: null, frame: null, items: [] };

export async function buyCosmetic(projectId: string, userRef: string, cosmeticKey: string) {
  try {
    return await db.transaction(async (tx) => {
      const player = await requirePlayer(tx, projectId, userRef);
      const [cosmetic] = await tx
        .select()
        .from(cosmetics)
        .where(and(eq(cosmetics.projectId, projectId), eq(cosmetics.key, cosmeticKey)));
      if (!cosmetic || !cosmetic.enabled) throw new MechanicError('COSMETIC_UNAVAILABLE', 'That cosmetic is not available', 404);
      if (cosmetic.cost === null || cosmetic.currencyId === null) throw new MechanicError('NOT_FOR_SALE', 'That cosmetic cannot be bought');
      const [currency] = await tx.select().from(currencies).where(eq(currencies.id, cosmetic.currencyId));
      if (!currency?.enabled) throw new MechanicError('COSMETIC_UNAVAILABLE', 'That cosmetic is not available right now', 404);

      // The row is the claim on the cosmetic: a second purchase finds it and pays nothing.
      const [bought] = await tx
        .insert(userCosmetics)
        .values({ id: `ucos_${crypto.randomUUID()}`, projectId, userId: player.id, cosmeticId: cosmetic.id, source: 'purchase' })
        .onConflictDoNothing()
        .returning({ id: userCosmetics.id });
      if (!bought) throw new MechanicError('ALREADY_OWNED', 'You already own that cosmetic');
      await spendWallet(tx, currency, { projectId, userId: player.id, amount: cosmetic.cost, reason: `Bought ${cosmetic.name}`, kind: 'spend', metadata: { cosmeticId: cosmetic.id } });
      return { key: cosmetic.key, name: cosmetic.name, kind: cosmetic.kind, cost: cosmetic.cost, currency: currency.key };
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) throw new MechanicError('INSUFFICIENT_POINTS', `Not enough points: ${err.balance} available, ${err.needed} needed`);
    throw err;
  }
}

/** Puts a cosmetic on, or takes it off. A player wears one title and one frame, and any number of items. */
export async function setEquipped(projectId: string, userRef: string, cosmeticKey: string, equipped: boolean) {
  return db.transaction(async (tx) => {
    const player = await requirePlayer(tx, projectId, userRef);
    const [cosmetic] = await tx
      .select()
      .from(cosmetics)
      .where(and(eq(cosmetics.projectId, projectId), eq(cosmetics.key, cosmeticKey)));
    if (!cosmetic || !cosmetic.enabled) throw new MechanicError('COSMETIC_UNAVAILABLE', 'That cosmetic is not available', 404);
    const { owned } = await ownedIds(tx, projectId, player.id, [cosmetic]);
    if (!owned.has(cosmetic.id)) throw new MechanicError('NOT_OWNED', 'You do not own that cosmetic', 403);

    if (equipped && cosmetic.kind !== 'item') {
      const sameKind = await tx
        .select({ id: cosmetics.id })
        .from(cosmetics)
        .where(and(eq(cosmetics.projectId, projectId), eq(cosmetics.kind, cosmetic.kind)));
      await tx
        .update(userCosmetics)
        .set({ equipped: false })
        .where(
          and(
            eq(userCosmetics.userId, player.id),
            inArray(
              userCosmetics.cosmeticId,
              sameKind.map((row) => row.id)
            )
          )
        );
    }
    // A cosmetic owned through an achievement has no row until it is first worn.
    await tx
      .insert(userCosmetics)
      .values({ id: `ucos_${crypto.randomUUID()}`, projectId, userId: player.id, cosmeticId: cosmetic.id, source: 'achievement', equipped })
      .onConflictDoUpdate({ target: [userCosmetics.userId, userCosmetics.cosmeticId], set: { equipped } });
    return { key: cosmetic.key, kind: cosmetic.kind, equipped };
  });
}

async function toRow(projectId: string, input: CosmeticInput): Promise<{ problem: string } | { values: Omit<typeof cosmetics.$inferInsert, 'id' | 'projectId'> }> {
  let achievementId: string | null = null;
  if (input.achievement) {
    const [achievement] = await db
      .select({ id: achievements.id })
      .from(achievements)
      .where(and(eq(achievements.projectId, projectId), eq(achievements.key, input.achievement)));
    if (!achievement) return { problem: `There is no achievement "${input.achievement}"` };
    achievementId = achievement.id;
  }
  let currencyId: string | null = null;
  if (input.currency || input.cost) {
    if (!input.currency || !input.cost) return { problem: 'A cosmetic for sale needs both a currency and a cost' };
    const [currency] = await db
      .select({ id: currencies.id })
      .from(currencies)
      .where(and(eq(currencies.projectId, projectId), eq(currencies.key, input.currency)));
    if (!currency) return { problem: `There is no currency "${input.currency}"` };
    currencyId = currency.id;
  }
  return {
    values: {
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      kind: input.kind,
      imageUrl: input.imageUrl || null,
      achievementId,
      currencyId,
      cost: currencyId ? input.cost! : null,
      enabled: input.enabled,
    },
  };
}

export async function cosmeticRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/cosmetics', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [list, owners] = await Promise.all([
      db
        .select({ cosmetic: cosmetics, currency: currencies.key, achievement: achievements.key })
        .from(cosmetics)
        .leftJoin(currencies, eq(currencies.id, cosmetics.currencyId))
        .leftJoin(achievements, eq(achievements.id, cosmetics.achievementId))
        .where(eq(cosmetics.projectId, projectId))
        .orderBy(cosmetics.kind, cosmetics.createdAt, cosmetics.id),
      db.select({ cosmeticId: userCosmetics.cosmeticId, total: count() }).from(userCosmetics).where(eq(userCosmetics.projectId, projectId)).groupBy(userCosmetics.cosmeticId),
    ]);
    const held = new Map(owners.map((row) => [row.cosmeticId, row.total]));
    return reply.send({ data: list.map(({ cosmetic, currency, achievement }) => ({ ...cosmetic, currency, achievement, owners: held.get(cosmetic.id) ?? 0 })) });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/cosmetics', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = cosmeticSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, firstIssue(parsed.error, 'Invalid cosmetic'));
    const row = await toRow(projectId, parsed.data);
    if ('problem' in row) return bad(reply, row.problem);
    try {
      const [created] = await db
        .insert(cosmetics)
        .values({ id: `cos_${crypto.randomUUID()}`, projectId, ...row.values })
        .returning();
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A cosmetic with the key "${parsed.data.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; cosmeticId: string } }>('/api/projects/:projectId/cosmetics/:cosmeticId', async (request, reply) => {
    const { projectId, cosmeticId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const existing = await findCosmetic(projectId, cosmeticId);
    if (!existing) return notFound(reply, 'Cosmetic');
    if (typeof request.body !== 'object' || request.body === null) return bad(reply, 'Invalid cosmetic');
    const [[currency], [achievement]] = await Promise.all([
      existing.currencyId ? db.select({ key: currencies.key }).from(currencies).where(eq(currencies.id, existing.currencyId)) : [[]],
      existing.achievementId ? db.select({ key: achievements.key }).from(achievements).where(eq(achievements.id, existing.achievementId)) : [[]],
    ]) as [{ key: string }[], { key: string }[]];
    const merged = cosmeticSchema.safeParse({ ...existing, currency: currency?.key ?? null, achievement: achievement?.key ?? null, ...(request.body as Record<string, unknown>), key: existing.key });
    if (!merged.success) return bad(reply, firstIssue(merged.error, 'Invalid cosmetic'));
    const row = await toRow(projectId, merged.data);
    if ('problem' in row) return bad(reply, row.problem);
    const [updated] = await db
      .update(cosmetics)
      .set({ ...row.values, updatedAt: new Date() })
      .where(eq(cosmetics.id, existing.id))
      .returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; cosmeticId: string } }>('/api/projects/:projectId/cosmetics/:cosmeticId', async (request, reply) => {
    const { projectId, cosmeticId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [deleted] = await db
      .delete(cosmetics)
      .where(and(eq(cosmetics.projectId, projectId), eq(cosmetics.id, cosmeticId)))
      .returning({ id: cosmetics.id });
    if (!deleted) return notFound(reply, 'Cosmetic');
    return reply.status(204).send();
  });

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/cosmetics', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      const player = await requirePlayer(db, projectId, userId);
      return reply.send({ data: await cosmeticsForPlayer(projectId, player.id) });
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });

  // Gives a cosmetic to a player, for example as a gift or a support gesture.
  fastify.post<{ Params: { projectId: string; userId: string }; Body: { cosmetic?: string } }>('/api/projects/:projectId/users/:userId/cosmetics', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    if (typeof request.body?.cosmetic !== 'string') return bad(reply, 'Send the cosmetic to give, as { "cosmetic": "<key>" }');
    try {
      const player = await requirePlayer(db, projectId, userId);
      const cosmetic = await findCosmetic(projectId, request.body.cosmetic);
      if (!cosmetic) return notFound(reply, 'Cosmetic');
      const [given] = await db
        .insert(userCosmetics)
        .values({ id: `ucos_${crypto.randomUUID()}`, projectId, userId: player.id, cosmeticId: cosmetic.id, source: 'grant' })
        .onConflictDoNothing()
        .returning({ id: userCosmetics.id });
      return reply.send({ key: cosmetic.key, given: Boolean(given) });
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });
}
