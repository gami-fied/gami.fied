import crypto from 'crypto';
import { currencies, db, isUniqueViolation, lootBoxes, lootBoxOpens, type LootBox, type LootBoxOpen } from '@gami/database';
import { CurrencyUnavailableError, grantPrizes, InsufficientBalanceError, spendWallet, walletBalances, type Prize } from '@gami/rewards';
import { createWebhookDelivery } from '@gami/webhooks';
import { and, count, desc, eq, gte, or, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { bad, firstIssue, keySchema, lockFor, MechanicError, notFound, optionalText, optionalUrl, prizeProblems, prizesSchema, requirePlayer, sendMechanicError, utcDayStart } from './shared.js';

export interface BoxItem {
  id: string;
  name: string;
  /** The item's share of the draw: its weight over the sum of all weights. */
  weight: number;
  /** Rare items are what the guarantee promises. */
  rare: boolean;
  prizes: Prize[];
}

const itemSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(128),
  weight: z.number().int().min(1).max(1_000_000),
  rare: z.boolean().default(false),
  prizes: prizesSchema,
});

export const boxSchema = z.object({
  key: keySchema,
  name: z.string().min(1).max(128),
  description: optionalText(2000),
  imageUrl: optionalUrl,
  kind: z.enum(['box', 'wheel']).default('box'),
  /** The currency a try is paid in. Leave it out for a free box. */
  currency: keySchema.nullable().optional(),
  cost: z.number().int().min(0).max(100_000_000).default(0),
  guaranteeAfter: z.number().int().min(1).max(1000).nullable().optional(),
  dailyLimit: z.number().int().min(1).max(10_000).nullable().optional(),
  items: z.array(itemSchema).min(1, 'A box needs at least one item').max(50),
  enabled: z.boolean().default(true),
});

type BoxInput = z.infer<typeof boxSchema>;

const itemsOf = (box: Pick<LootBox, 'items'>) => (box.items ?? []) as BoxItem[];

/** Each item's chance as a percentage with two decimals. This is the published drop table. */
export function dropTable(items: BoxItem[]) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  return items.map((item) => ({
    id: item.id,
    name: item.name,
    rare: item.rare,
    chance: total === 0 ? 0 : Math.round((item.weight / total) * 10_000) / 100,
    prizes: item.prizes,
  }));
}

/** Picks one item by weight. `roll` is a whole number from 0 up to, not including, the sum of the weights. */
export function pickItem(items: BoxItem[], roll: number): BoxItem {
  let left = roll;
  for (const item of items) {
    if (left < item.weight) return item;
    left -= item.weight;
  }
  return items[items.length - 1]!;
}

/** How many tries in a row, counting back from the latest, gave nothing rare. */
async function triesWithoutRare(handle: Pick<typeof db, 'select'>, boxId: string, userId: string, lookBack: number): Promise<number> {
  const recent = await handle
    .select({ rare: lootBoxOpens.rare })
    .from(lootBoxOpens)
    .where(and(eq(lootBoxOpens.boxId, boxId), eq(lootBoxOpens.userId, userId)))
    .orderBy(desc(lootBoxOpens.createdAt), desc(lootBoxOpens.id))
    .limit(lookBack);
  const firstRare = recent.findIndex((open) => open.rare);
  return firstRare === -1 ? recent.length : firstRare;
}

async function triesToday(handle: Pick<typeof db, 'select'>, boxId: string, userId: string, now: Date): Promise<number> {
  const [row] = await handle
    .select({ total: count() })
    .from(lootBoxOpens)
    .where(and(eq(lootBoxOpens.boxId, boxId), eq(lootBoxOpens.userId, userId), gte(lootBoxOpens.createdAt, utcDayStart(now))));
  return row?.total ?? 0;
}

export interface OpenBoxInput {
  projectId: string;
  /** The player's ID or your own ID for them. */
  user: string;
  boxKey: string;
  idempotencyKey?: string | null;
  /** For tests: the random number source, as `crypto.randomInt`. */
  random?: (max: number) => number;
  now?: Date;
}

const shapeOpen = (open: LootBoxOpen) => ({
  id: open.id,
  item: { id: open.itemId, name: open.itemName, rare: open.rare },
  prizes: open.prizes as Prize[],
  guaranteed: open.guaranteed,
  cost: open.cost,
  createdAt: open.createdAt,
});

/**
 * One try at a box, in one transaction: the daily limit, the cost, the draw and the prizes all
 * happen together or not at all. A player's tries at one box take turns, so the guarantee and the
 * limit cannot be raced.
 */
export async function openBox(input: OpenBoxInput) {
  const { projectId } = input;
  const now = input.now ?? new Date();
  const random = input.random ?? ((max: number) => crypto.randomInt(max));

  try {
    return await db.transaction(async (tx) => {
      const player = await requirePlayer(tx, projectId, input.user);

      if (input.idempotencyKey) {
        const [existing] = await tx
          .select()
          .from(lootBoxOpens)
          .where(and(eq(lootBoxOpens.projectId, projectId), eq(lootBoxOpens.idempotencyKey, input.idempotencyKey)));
        if (existing && existing.userId !== player.id) throw new MechanicError('IDEMPOTENCY_KEY_IN_USE', 'That idempotency key has already been used. Send a new one.');
        if (existing) return { ...shapeOpen(existing), duplicate: true };
      }

      const [box] = await tx
        .select()
        .from(lootBoxes)
        .where(and(eq(lootBoxes.projectId, projectId), eq(lootBoxes.key, input.boxKey)));
      const items = box ? itemsOf(box) : [];
      if (!box || !box.enabled || items.length === 0) throw new MechanicError('BOX_UNAVAILABLE', 'That box is not available', 404);

      await lockFor(tx, `box:${box.id}:${player.id}`);

      if (box.dailyLimit !== null && (await triesToday(tx, box.id, player.id, now)) >= box.dailyLimit) {
        throw new MechanicError('LIMIT_REACHED', `You can open this ${box.dailyLimit} time${box.dailyLimit === 1 ? '' : 's'} a day. Come back tomorrow.`);
      }

      if (box.cost > 0) {
        const [currency] = box.currencyId ? await tx.select().from(currencies).where(eq(currencies.id, box.currencyId)) : [];
        if (!currency?.enabled) throw new MechanicError('BOX_UNAVAILABLE', 'That box is not available right now', 404);
        await spendWallet(tx, currency, { projectId, userId: player.id, amount: box.cost, reason: `Opened ${box.name}`, kind: 'spend', metadata: { boxId: box.id } });
      }

      // The guarantee: after enough tries with nothing rare, this one is drawn from the rare items only.
      const rareItems = items.filter((item) => item.rare);
      const guaranteed = box.guaranteeAfter !== null && rareItems.length > 0 && (await triesWithoutRare(tx, box.id, player.id, box.guaranteeAfter)) >= box.guaranteeAfter;
      const pool = guaranteed ? rareItems : items;
      const item = pickItem(pool, random(pool.reduce((sum, entry) => sum + entry.weight, 0)));

      const openId = `lbo_${crypto.randomUUID()}`;
      const [open] = await tx
        .insert(lootBoxOpens)
        .values({
          id: openId,
          projectId,
          userId: player.id,
          boxId: box.id,
          itemId: item.id,
          itemName: item.name,
          prizes: item.prizes,
          rare: item.rare,
          guaranteed,
          cost: box.cost,
          idempotencyKey: input.idempotencyKey ?? null,
          createdAt: now,
        })
        .returning();

      await grantPrizes(tx, { projectId, userId: player.id, prizes: item.prizes, reason: `${box.name}: ${item.name}`, source: `box:${openId}`, metadata: { boxId: box.id, itemId: item.id } });
      await createWebhookDelivery(tx, {
        projectId,
        eventId: openId,
        eventType: 'box.opened',
        userId: player.id,
        externalUserId: player.externalId,
        data: { openId, boxKey: box.key, boxName: box.name, item: { id: item.id, name: item.name, rare: item.rare }, prizes: item.prizes, guaranteed, cost: box.cost },
      });

      return { ...shapeOpen(open!), duplicate: false };
    });
  } catch (err) {
    if (err instanceof InsufficientBalanceError) throw new MechanicError('INSUFFICIENT_POINTS', `Not enough points: ${err.balance} available, ${err.needed} needed`);
    if (err instanceof CurrencyUnavailableError) throw new MechanicError('BOX_UNAVAILABLE', 'A prize in that box is not available right now. Nothing was taken.', 409);
    throw err;
  }
}

/** The boxes a player can open, with the drop table and where they stand with the guarantee and the daily limit. */
export async function boxesForPlayer(projectId: string, userId: string, now: Date = new Date()) {
  const list = await db
    .select({ box: lootBoxes, currencyKey: currencies.key, currencyName: currencies.name, symbol: currencies.symbol, currencyEnabled: currencies.enabled })
    .from(lootBoxes)
    .leftJoin(currencies, eq(currencies.id, lootBoxes.currencyId))
    .where(and(eq(lootBoxes.projectId, projectId), eq(lootBoxes.enabled, true)))
    .orderBy(lootBoxes.createdAt, lootBoxes.id);
  if (list.length === 0) return [];
  const balances = await walletBalances(db, projectId, userId);

  return Promise.all(
    list
      .filter(({ box, currencyEnabled }) => box.cost === 0 || currencyEnabled)
      .map(async ({ box, currencyKey, currencyName, symbol }) => {
        const items = itemsOf(box);
        const hasGuarantee = box.guaranteeAfter !== null && items.some((item) => item.rare);
        const [dry, today] = await Promise.all([
          hasGuarantee ? triesWithoutRare(db, box.id, userId, box.guaranteeAfter!) : 0,
          box.dailyLimit !== null ? triesToday(db, box.id, userId, now) : 0,
        ]);
        return {
          key: box.key,
          name: box.name,
          description: box.description,
          imageUrl: box.imageUrl,
          kind: box.kind,
          cost: box.cost,
          currency: box.cost > 0 ? currencyKey : null,
          currencyName: box.cost > 0 ? currencyName : null,
          currencySymbol: box.cost > 0 ? symbol : null,
          affordable: box.cost === 0 || (balances.get(box.currencyId ?? '') ?? 0) >= box.cost,
          items: dropTable(items),
          guaranteeAfter: hasGuarantee ? box.guaranteeAfter : null,
          /** Tries left before one is sure to give a rare item. 0 means the next one will. */
          triesUntilGuarantee: hasGuarantee ? Math.max(0, box.guaranteeAfter! - dry) : null,
          dailyLimit: box.dailyLimit,
          triesLeftToday: box.dailyLimit !== null ? Math.max(0, box.dailyLimit - today) : null,
        };
      })
  );
}

async function toRow(projectId: string, input: BoxInput): Promise<{ problem: string } | { values: Omit<typeof lootBoxes.$inferInsert, 'id' | 'projectId'> }> {
  let currencyId: string | null = null;
  if (input.cost > 0) {
    if (!input.currency) return { problem: 'Choose the currency a try is paid in, or set the cost to 0' };
    const [currency] = await db
      .select({ id: currencies.id })
      .from(currencies)
      .where(and(eq(currencies.projectId, projectId), eq(currencies.key, input.currency)));
    if (!currency) return { problem: `There is no currency "${input.currency}"` };
    currencyId = currency.id;
  }
  if (input.guaranteeAfter && !input.items.some((item) => item.rare)) return { problem: 'A guarantee needs at least one item marked rare' };

  const seen = new Set<string>();
  const items: BoxItem[] = input.items.map((item) => {
    let id = item.id ?? `itm_${crypto.randomUUID().slice(0, 8)}`;
    while (seen.has(id)) id = `itm_${crypto.randomUUID().slice(0, 8)}`;
    seen.add(id);
    return { id, name: item.name, weight: item.weight, rare: item.rare, prizes: item.prizes };
  });
  const problems = await prizeProblems(projectId, items.flatMap((item) => item.prizes));
  if (problems.length > 0) return { problem: problems[0]! };

  return {
    values: {
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      imageUrl: input.imageUrl || null,
      kind: input.kind,
      currencyId,
      cost: input.cost,
      guaranteeAfter: input.guaranteeAfter ?? null,
      dailyLimit: input.dailyLimit ?? null,
      items,
      enabled: input.enabled,
    },
  };
}

export async function boxRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/boxes', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [list, opened] = await Promise.all([
      db
        .select({ box: lootBoxes, currency: currencies.key })
        .from(lootBoxes)
        .leftJoin(currencies, eq(currencies.id, lootBoxes.currencyId))
        .where(eq(lootBoxes.projectId, projectId))
        .orderBy(lootBoxes.createdAt, lootBoxes.id),
      db
        .select({ boxId: lootBoxOpens.boxId, total: count(), players: sql<number>`COUNT(DISTINCT ${lootBoxOpens.userId})::int` })
        .from(lootBoxOpens)
        .where(eq(lootBoxOpens.projectId, projectId))
        .groupBy(lootBoxOpens.boxId),
    ]);
    const stats = new Map(opened.map((row) => [row.boxId, row]));
    return reply.send({
      data: list.map(({ box, currency }) => ({ ...box, currency, dropTable: dropTable(itemsOf(box)), opens: stats.get(box.id)?.total ?? 0, players: stats.get(box.id)?.players ?? 0 })),
    });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/boxes', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = boxSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, firstIssue(parsed.error, 'Invalid box'));
    const row = await toRow(projectId, parsed.data);
    if ('problem' in row) return bad(reply, row.problem);
    try {
      const [created] = await db
        .insert(lootBoxes)
        .values({ id: `box_${crypto.randomUUID()}`, projectId, ...row.values })
        .returning();
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A box with the key "${parsed.data.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; boxId: string } }>('/api/projects/:projectId/boxes/:boxId', async (request, reply) => {
    const { projectId, boxId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [existing] = await db
      .select({ box: lootBoxes, currency: currencies.key })
      .from(lootBoxes)
      .leftJoin(currencies, eq(currencies.id, lootBoxes.currencyId))
      .where(and(eq(lootBoxes.projectId, projectId), or(eq(lootBoxes.id, boxId), eq(lootBoxes.key, boxId))));
    if (!existing) return notFound(reply, 'Box');
    const patch = boxSchema.omit({ key: true }).partial().safeParse(request.body);
    if (!patch.success) return bad(reply, firstIssue(patch.error, 'Invalid box'));
    // The whole box is checked again, so a change cannot leave it half valid.
    const merged = boxSchema.safeParse({ ...existing.box, currency: existing.currency, ...patch.data });
    if (!merged.success) return bad(reply, firstIssue(merged.error, 'Invalid box'));
    const row = await toRow(projectId, merged.data);
    if ('problem' in row) return bad(reply, row.problem);
    const [updated] = await db
      .update(lootBoxes)
      .set({ ...row.values, updatedAt: new Date() })
      .where(eq(lootBoxes.id, existing.box.id))
      .returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; boxId: string } }>('/api/projects/:projectId/boxes/:boxId', async (request, reply) => {
    const { projectId, boxId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [deleted] = await db
      .delete(lootBoxes)
      .where(and(eq(lootBoxes.projectId, projectId), eq(lootBoxes.id, boxId)))
      .returning({ id: lootBoxes.id });
    if (!deleted) return notFound(reply, 'Box');
    return reply.status(204).send();
  });

  // What each item has actually given, next to its published chance, so the odds can be checked.
  fastify.get<{ Params: { projectId: string; boxId: string } }>('/api/projects/:projectId/boxes/:boxId/opens', async (request, reply) => {
    const { projectId, boxId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [box] = await db
      .select()
      .from(lootBoxes)
      .where(and(eq(lootBoxes.projectId, projectId), or(eq(lootBoxes.id, boxId), eq(lootBoxes.key, boxId))));
    if (!box) return notFound(reply, 'Box');
    const [byItem, recent] = await Promise.all([
      db
        .select({ itemId: lootBoxOpens.itemId, total: count(), guaranteed: sql<number>`COUNT(*) FILTER (WHERE ${lootBoxOpens.guaranteed})::int` })
        .from(lootBoxOpens)
        .where(eq(lootBoxOpens.boxId, box.id))
        .groupBy(lootBoxOpens.itemId),
      db.select().from(lootBoxOpens).where(eq(lootBoxOpens.boxId, box.id)).orderBy(desc(lootBoxOpens.createdAt)).limit(50),
    ]);
    const all = byItem.reduce((sum, row) => sum + row.total, 0);
    const counts = new Map(byItem.map((row) => [row.itemId, row]));
    return reply.send({
      total: all,
      items: dropTable(itemsOf(box)).map((item) => ({
        ...item,
        given: counts.get(item.id)?.total ?? 0,
        givenByGuarantee: counts.get(item.id)?.guaranteed ?? 0,
        share: all === 0 ? 0 : Math.round(((counts.get(item.id)?.total ?? 0) / all) * 10_000) / 100,
      })),
      recent: recent.map((open) => ({ ...shapeOpen(open), userId: open.userId })),
    });
  });

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/boxes', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      const player = await requirePlayer(db, projectId, userId);
      return reply.send({ data: await boxesForPlayer(projectId, player.id) });
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });

  fastify.post<{ Params: { projectId: string; userId: string; boxKey: string }; Body: { idempotencyKey?: string } }>(
    '/api/projects/:projectId/users/:userId/boxes/:boxKey/open',
    async (request, reply) => {
      const { projectId, userId, boxKey } = request.params;
      if (!(await requireProjectAccess(request, reply, projectId))) return;
      const header = request.headers['idempotency-key'];
      const idempotencyKey = (typeof header === 'string' ? header : request.body?.idempotencyKey)?.slice(0, 128);
      try {
        const result = await openBox({ projectId, user: userId, boxKey, idempotencyKey });
        return reply.status(result.duplicate ? 200 : 201).send(result);
      } catch (err) {
        return sendMechanicError(reply, err);
      }
    }
  );
}
