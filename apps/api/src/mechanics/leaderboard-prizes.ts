import crypto from 'crypto';
import { db, endUsers, leaderboardPayouts, leaderboardPrizes } from '@gami/database';
import type { Prize } from '@gami/rewards';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { bad, firstIssue, notFound, prizeProblems, prizesSchema } from './shared.js';

const prizeRuleSchema = z
  .object({
    name: z.string().min(1).max(128),
    period: z.enum(['daily', 'weekly', 'monthly']),
    fromRank: z.number().int().min(1).max(100).default(1),
    // The board is read 100 places at a time, so prizes reach that far.
    toRank: z.number().int().min(1).max(100).default(1),
    rewards: prizesSchema.min(1, 'Add at least one prize'),
    enabled: z.boolean().default(true),
  })
  .refine((value) => value.toRank >= value.fromRank, { message: 'The last place must not be before the first' });

/** The prizes on offer and what this player has won, for a "this week's prizes" panel. */
export async function prizesForPlayer(projectId: string, userId: string) {
  const [rules, won] = await Promise.all([
    db
      .select()
      .from(leaderboardPrizes)
      .where(and(eq(leaderboardPrizes.projectId, projectId), eq(leaderboardPrizes.enabled, true)))
      .orderBy(leaderboardPrizes.period, leaderboardPrizes.fromRank),
    db
      .select()
      .from(leaderboardPayouts)
      .where(and(eq(leaderboardPayouts.projectId, projectId), eq(leaderboardPayouts.userId, userId)))
      .orderBy(desc(leaderboardPayouts.createdAt))
      .limit(20),
  ]);
  return {
    prizes: rules.map((rule) => ({ name: rule.name, period: rule.period, fromRank: rule.fromRank, toRank: rule.toRank, rewards: rule.rewards as Prize[] })),
    won: won.map((row) => ({ period: row.period, periodStart: row.periodKey, rank: row.rank, xp: row.xp, rewards: row.rewards as Prize[], paidAt: row.createdAt })),
  };
}

export async function leaderboardPrizeRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/leaderboard-prizes', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const data = await db.select().from(leaderboardPrizes).where(eq(leaderboardPrizes.projectId, projectId)).orderBy(leaderboardPrizes.period, leaderboardPrizes.fromRank, leaderboardPrizes.id);
    return reply.send({ data });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/leaderboard-prizes', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = prizeRuleSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, firstIssue(parsed.error, 'Invalid prize'));
    const problems = await prizeProblems(projectId, parsed.data.rewards);
    if (problems.length > 0) return bad(reply, problems[0]!);
    const [created] = await db
      .insert(leaderboardPrizes)
      .values({ id: `lbp_${crypto.randomUUID()}`, projectId, ...parsed.data })
      .returning();
    return reply.status(201).send(created);
  });

  fastify.patch<{ Params: { projectId: string; prizeId: string } }>('/api/projects/:projectId/leaderboard-prizes/:prizeId', async (request, reply) => {
    const { projectId, prizeId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [existing] = await db
      .select()
      .from(leaderboardPrizes)
      .where(and(eq(leaderboardPrizes.projectId, projectId), eq(leaderboardPrizes.id, prizeId)));
    if (!existing) return notFound(reply, 'Prize');
    if (typeof request.body !== 'object' || request.body === null) return bad(reply, 'Invalid prize');
    const merged = prizeRuleSchema.safeParse({ ...existing, ...(request.body as Record<string, unknown>) });
    if (!merged.success) return bad(reply, firstIssue(merged.error, 'Invalid prize'));
    const problems = await prizeProblems(projectId, merged.data.rewards);
    if (problems.length > 0) return bad(reply, problems[0]!);
    const [updated] = await db
      .update(leaderboardPrizes)
      .set({ ...merged.data, updatedAt: new Date() })
      .where(eq(leaderboardPrizes.id, existing.id))
      .returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; prizeId: string } }>('/api/projects/:projectId/leaderboard-prizes/:prizeId', async (request, reply) => {
    const { projectId, prizeId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [deleted] = await db
      .delete(leaderboardPrizes)
      .where(and(eq(leaderboardPrizes.projectId, projectId), eq(leaderboardPrizes.id, prizeId)))
      .returning({ id: leaderboardPrizes.id });
    if (!deleted) return notFound(reply, 'Prize');
    return reply.status(204).send();
  });

  // Who was paid, newest first.
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/leaderboard-prizes/payouts', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const data = await db
      .select({
        id: leaderboardPayouts.id,
        prizeId: leaderboardPayouts.prizeId,
        prizeName: leaderboardPrizes.name,
        period: leaderboardPayouts.period,
        periodStart: leaderboardPayouts.periodKey,
        rank: leaderboardPayouts.rank,
        xp: leaderboardPayouts.xp,
        rewards: leaderboardPayouts.rewards,
        userId: leaderboardPayouts.userId,
        externalId: endUsers.externalId,
        name: endUsers.name,
        createdAt: leaderboardPayouts.createdAt,
      })
      .from(leaderboardPayouts)
      .innerJoin(leaderboardPrizes, eq(leaderboardPrizes.id, leaderboardPayouts.prizeId))
      .innerJoin(endUsers, eq(endUsers.id, leaderboardPayouts.userId))
      .where(eq(leaderboardPayouts.projectId, projectId))
      .orderBy(desc(leaderboardPayouts.createdAt), leaderboardPayouts.rank)
      .limit(100);
    return reply.send({ data });
  });
}
