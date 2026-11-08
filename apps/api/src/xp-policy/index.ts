import crypto from 'crypto';
import { db, endUsers, rules, xpBoosts, xpLimitHits, xpLimits } from '@gami/database';
import { isValidTimeZone } from '@gami/progression';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const hour = z.number().int().min(0).max(24);

const boostBase = z.object({
  name: z.string().min(1).max(128),
  multiplier: z.number().min(0.1).max(10),
  enabled: z.boolean().default(true),
  startAt: z.string().datetime().nullable().optional(),
  endAt: z.string().datetime().nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).nullable().optional(),
  fromHour: hour.nullable().optional(),
  toHour: hour.nullable().optional(),
  timeZone: z.string().refine(isValidTimeZone, 'Must be an IANA time zone').default('UTC'),
  eventTypes: z.array(z.string().min(1).max(128)).max(50).nullable().optional(),
});

function checkBoost(data: z.infer<typeof boostBase> | Partial<z.infer<typeof boostBase>>): string | null {
  if (data.startAt && data.endAt && new Date(data.endAt) <= new Date(data.startAt)) return 'The end must be after the start';
  if ((data.fromHour == null) !== (data.toHour == null)) return 'Give both a start hour and an end hour, or neither';
  return null;
}

const limitBase = z.object({
  name: z.string().min(1).max(128),
  kind: z.enum(['xp_cap', 'award_cap', 'cooldown']),
  period: z.enum(['day', 'week', 'month']).nullable().optional(),
  amount: z.number().int().min(1).max(10_000_000),
  ruleId: z.string().max(128).nullable().optional(),
  eventType: z.string().max(128).nullable().optional(),
  enabled: z.boolean().default(true),
});

function checkLimit(data: z.infer<typeof limitBase>): string | null {
  if (data.kind !== 'cooldown' && !data.period) return 'Choose whether the cap is per day, week or month';
  if (data.kind === 'cooldown' && data.amount > 31 * 86_400) return 'A cooldown can be at most 31 days';
  return null;
}

const bad = (reply: FastifyReply, message: string) => reply.status(400).send({ error: 'Bad Request', message });

export async function xpPolicyRoutes(fastify: FastifyInstance) {
  // ---------- Boosts ----------
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/boosts', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const data = await db.select().from(xpBoosts).where(eq(xpBoosts.projectId, projectId)).orderBy(desc(xpBoosts.createdAt));
    return reply.send({ data });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/boosts', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = boostBase.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid boost');
    const problem = checkBoost(parsed.data);
    if (problem) return bad(reply, problem);

    const d = parsed.data;
    const [created] = await db
      .insert(xpBoosts)
      .values({
        id: `bst_${crypto.randomUUID()}`,
        projectId,
        name: d.name,
        multiplier: d.multiplier,
        enabled: d.enabled,
        startAt: d.startAt ? new Date(d.startAt) : null,
        endAt: d.endAt ? new Date(d.endAt) : null,
        daysOfWeek: d.daysOfWeek?.length ? d.daysOfWeek : null,
        fromHour: d.fromHour ?? null,
        toHour: d.toHour ?? null,
        timeZone: d.timeZone,
        eventTypes: d.eventTypes?.length ? d.eventTypes : null,
      })
      .returning();
    return reply.status(201).send(created);
  });

  fastify.patch<{ Params: { projectId: string; boostId: string } }>('/api/projects/:projectId/boosts/:boostId', async (request, reply) => {
    const { projectId, boostId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = boostBase.partial().safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid boost');
    const problem = checkBoost(parsed.data);
    if (problem) return bad(reply, problem);

    const d = parsed.data;
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['name', 'multiplier', 'enabled', 'fromHour', 'toHour', 'timeZone'] as const) if (d[key] !== undefined) changes[key] = d[key];
    if (d.startAt !== undefined) changes['startAt'] = d.startAt ? new Date(d.startAt) : null;
    if (d.endAt !== undefined) changes['endAt'] = d.endAt ? new Date(d.endAt) : null;
    if (d.daysOfWeek !== undefined) changes['daysOfWeek'] = d.daysOfWeek?.length ? d.daysOfWeek : null;
    if (d.eventTypes !== undefined) changes['eventTypes'] = d.eventTypes?.length ? d.eventTypes : null;

    const [updated] = await db.update(xpBoosts).set(changes).where(and(eq(xpBoosts.id, boostId), eq(xpBoosts.projectId, projectId))).returning();
    if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Boost not found' });
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; boostId: string } }>('/api/projects/:projectId/boosts/:boostId', async (request, reply) => {
    const { projectId, boostId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [gone] = await db.delete(xpBoosts).where(and(eq(xpBoosts.id, boostId), eq(xpBoosts.projectId, projectId))).returning({ id: xpBoosts.id });
    if (!gone) return reply.status(404).send({ error: 'Not Found', message: 'Boost not found' });
    return reply.status(204).send();
  });

  // ---------- Limits ----------
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/limits', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const since = new Date(Date.now() - 7 * 86_400_000);
    const [limits, hits] = await Promise.all([
      db.select().from(xpLimits).where(eq(xpLimits.projectId, projectId)).orderBy(desc(xpLimits.createdAt)),
      db
        .select({ limitId: xpLimitHits.limitId, total: sql<number>`COUNT(*)::int`, people: sql<number>`COUNT(DISTINCT ${xpLimitHits.userId})::int` })
        .from(xpLimitHits)
        .where(and(eq(xpLimitHits.projectId, projectId), sql`${xpLimitHits.createdAt} >= ${since.toISOString()}::timestamptz`))
        .groupBy(xpLimitHits.limitId),
    ]);
    const byLimit = new Map(hits.map((row) => [row.limitId, row]));
    return reply.send({ data: limits.map((limit) => ({ ...limit, hitsLastWeek: byLimit.get(limit.id)?.total ?? 0, peopleLastWeek: byLimit.get(limit.id)?.people ?? 0 })) });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/limits', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = limitBase.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid limit');
    const problem = checkLimit(parsed.data);
    if (problem) return bad(reply, problem);

    const d = parsed.data;
    if (d.ruleId) {
      const [rule] = await db.select({ id: rules.id }).from(rules).where(and(eq(rules.id, d.ruleId), eq(rules.projectId, projectId)));
      if (!rule) return bad(reply, 'That rule is not in this project');
    }
    const [created] = await db
      .insert(xpLimits)
      .values({
        id: `lim_${crypto.randomUUID()}`,
        projectId,
        name: d.name,
        kind: d.kind,
        period: d.kind === 'cooldown' ? null : (d.period ?? null),
        amount: d.amount,
        ruleId: d.ruleId || null,
        eventType: d.eventType || null,
        enabled: d.enabled,
      })
      .returning();
    return reply.status(201).send(created);
  });

  fastify.patch<{ Params: { projectId: string; limitId: string } }>('/api/projects/:projectId/limits/:limitId', async (request, reply) => {
    const { projectId, limitId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = z.object({ name: z.string().min(1).max(128).optional(), amount: z.number().int().min(1).max(10_000_000).optional(), enabled: z.boolean().optional() }).safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid limit');
    const [updated] = await db
      .update(xpLimits)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(xpLimits.id, limitId), eq(xpLimits.projectId, projectId)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Limit not found' });
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; limitId: string } }>('/api/projects/:projectId/limits/:limitId', async (request, reply) => {
    const { projectId, limitId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [gone] = await db.delete(xpLimits).where(and(eq(xpLimits.id, limitId), eq(xpLimits.projectId, projectId))).returning({ id: xpLimits.id });
    if (!gone) return reply.status(404).send({ error: 'Not Found', message: 'Limit not found' });
    return reply.status(204).send();
  });

  // Who is hitting limits, newest first. Optional `userId` narrows it to one person.
  fastify.get<{ Params: { projectId: string }; Querystring: { userId?: string; limit?: string } }>('/api/projects/:projectId/limits/hits', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 200);
    const data = await db
      .select({
        id: xpLimitHits.id,
        userId: xpLimitHits.userId,
        externalId: endUsers.externalId,
        name: endUsers.name,
        rankingHidden: endUsers.rankingHidden,
        limitName: xpLimitHits.limitName,
        wanted: xpLimitHits.wanted,
        given: xpLimitHits.given,
        createdAt: xpLimitHits.createdAt,
      })
      .from(xpLimitHits)
      .innerJoin(endUsers, eq(endUsers.id, xpLimitHits.userId))
      .where(and(eq(xpLimitHits.projectId, projectId), request.query.userId ? eq(xpLimitHits.userId, request.query.userId) : undefined))
      .orderBy(desc(xpLimitHits.createdAt))
      .limit(limit);
    return reply.send({ data });
  });

  // Shadow-ban: the user keeps playing but leaves every leaderboard.
  fastify.post<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/ranking', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = z.object({ hidden: z.boolean() }).safeParse(request.body);
    if (!parsed.success) return bad(reply, 'Send { "hidden": true } or { "hidden": false }');

    const [updated] = await db
      .update(endUsers)
      .set({ rankingHidden: parsed.data.hidden, updatedAt: new Date() })
      .where(and(eq(endUsers.id, userId), eq(endUsers.projectId, projectId)))
      .returning({ id: endUsers.id, rankingHidden: endUsers.rankingHidden });
    if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'User not found' });
    return reply.send(updated);
  });
}
