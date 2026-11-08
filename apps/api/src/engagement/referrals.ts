import { currencies, db, endUsers, referralPrograms, referrals } from '@gami/database';
import { claimReferral, getReferralProgram, ReferralError, referralCodeFor } from '@gami/rewards';
import { and, count, desc, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { alias } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { resolveEndUserId } from '../leaderboards/index.js';

const programSchema = z.object({
  enabled: z.boolean(),
  qualifyingEvent: z.string().min(1).max(128).nullable(),
  referrerXp: z.number().int().min(0).max(1_000_000),
  refereeXp: z.number().int().min(0).max(1_000_000),
  currencyKey: z.string().min(1).max(64).nullable(),
  referrerCurrency: z.number().int().min(0).max(1_000_000),
  maxRewardsPerReferrer: z.number().int().min(1).max(100_000).nullable(),
});

export function sendReferralError(reply: FastifyReply, err: unknown) {
  if (err instanceof ReferralError) return reply.status(err.status).send({ error: err.code, code: err.code, message: err.message });
  throw err;
}

/** A person's invite code and how their invites went. */
export async function referralSummary(projectId: string, userId: string) {
  const [code, rows] = await Promise.all([
    referralCodeFor(projectId, userId),
    db.select({ status: referrals.status, total: count() }).from(referrals).where(and(eq(referrals.projectId, projectId), eq(referrals.referrerId, userId))).groupBy(referrals.status),
  ]);
  const by = Object.fromEntries(rows.map((row) => [row.status, row.total])) as Record<string, number>;
  return { code, invited: (by['pending'] ?? 0) + (by['rewarded'] ?? 0) + (by['capped'] ?? 0), rewarded: by['rewarded'] ?? 0, pending: by['pending'] ?? 0 };
}

export async function referralRoutes(fastify: FastifyInstance) {
  const defaults = { enabled: false, qualifyingEvent: null, referrerXp: 100, refereeXp: 50, currencyKey: null, referrerCurrency: 0, maxRewardsPerReferrer: null };

  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/referral-program', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const program = await getReferralProgram(projectId);
    const [stats] = await db.select({ total: count() }).from(referrals).where(eq(referrals.projectId, projectId));
    return reply.send({ ...(program ?? { projectId, ...defaults }), referrals: stats?.total ?? 0 });
  });

  fastify.put<{ Params: { projectId: string } }>('/api/projects/:projectId/referral-program', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = programSchema.safeParse({ ...defaults, ...(request.body as object) });
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Invalid program' });
    if (parsed.data.currencyKey) {
      const [currency] = await db.select({ id: currencies.id }).from(currencies).where(and(eq(currencies.projectId, projectId), eq(currencies.key, parsed.data.currencyKey)));
      if (!currency) return reply.status(400).send({ error: 'Bad Request', message: `There is no currency "${parsed.data.currencyKey}"` });
    }
    const values = { ...parsed.data, updatedAt: new Date() };
    const [saved] = await db.insert(referralPrograms).values({ projectId, ...values }).onConflictDoUpdate({ target: referralPrograms.projectId, set: values }).returning();
    return reply.send(saved);
  });

  fastify.get<{ Params: { projectId: string }; Querystring: { limit?: string } }>('/api/projects/:projectId/referrals', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const referrer = alias(endUsers, 'referrer');
    const referee = alias(endUsers, 'referee');
    const data = await db
      .select({
        id: referrals.id,
        status: referrals.status,
        createdAt: referrals.createdAt,
        qualifiedAt: referrals.qualifiedAt,
        referrerId: referrals.referrerId,
        referrerName: referrer.name,
        referrerExternalId: referrer.externalId,
        refereeId: referrals.refereeId,
        refereeName: referee.name,
        refereeExternalId: referee.externalId,
      })
      .from(referrals)
      .innerJoin(referrer, eq(referrer.id, referrals.referrerId))
      .innerJoin(referee, eq(referee.id, referrals.refereeId))
      .where(eq(referrals.projectId, projectId))
      .orderBy(desc(referrals.createdAt))
      .limit(Math.min(200, Math.max(1, Number(request.query.limit) || 50)));
    return reply.send({ data });
  });

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/referral', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const id = await resolveEndUserId(projectId, request.params.userId);
    if (!id) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    return reply.send(await referralSummary(projectId, id));
  });

  // Your server records that a new player joined with a code, for example at sign-up.
  fastify.post<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/referral', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = z.object({ code: z.string().min(4).max(32) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: 'Send the invite code' });
    const id = await resolveEndUserId(projectId, request.params.userId);
    if (!id) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    try {
      const referral = await claimReferral(projectId, id, parsed.data.code);
      return reply.status(201).send({ id: referral.id, status: referral.status });
    } catch (err) {
      return sendReferralError(reply, err);
    }
  });
}
