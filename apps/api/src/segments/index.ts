import crypto from 'crypto';
import { db, endUsers, isUniqueViolation, segments, userXpBalances } from '@gami/database';
import { segmentWhere, validateSegmentFilter, type SegmentFilter } from '@gami/leaderboards';
import { and, eq, or, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const key = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'Use letters, numbers, dashes and underscores');

const segmentSchema = z.object({
  key,
  name: z.string().min(1).max(128),
  description: z.string().max(1000).nullable().optional(),
  filter: z.unknown(),
});

const bad = (reply: FastifyReply, message: string) => reply.status(400).send({ error: 'Bad Request', message });

/** A segment's filter, found by its ID or key. Null when there is no such segment. */
export async function loadSegmentFilter(projectId: string, ref: string): Promise<SegmentFilter | null> {
  const [row] = await db
    .select({ filter: segments.filter })
    .from(segments)
    .where(and(eq(segments.projectId, projectId), or(eq(segments.id, ref), eq(segments.key, ref))));
  return row ? (row.filter as SegmentFilter) : null;
}

/** How many people match, and a few of them, so a segment can be checked before it is used. */
async function preview(projectId: string, filter: SegmentFilter) {
  const where = segmentWhere(filter);
  const rows = (await db.execute(sql`
    SELECT eu.id AS "id", eu.external_id AS "externalId", eu.name AS "name", COALESCE(b.total_xp, 0)::int AS "totalXp",
      COUNT(*) OVER()::int AS "total"
    FROM ${endUsers} eu
    LEFT JOIN ${userXpBalances} b ON b.project_id = eu.project_id AND b.user_id = eu.id
    WHERE eu.project_id = ${projectId} AND eu.active = true AND ${where}
    ORDER BY COALESCE(b.total_xp, 0) DESC, eu.id ASC
    LIMIT 10
  `)) as unknown as { id: string; externalId: string; name: string | null; totalXp: number; total: number }[];
  const list = Array.isArray(rows) ? rows : ((rows as unknown as { rows: typeof rows }).rows ?? []);
  return { count: list[0]?.total ?? 0, sample: list.map((row) => ({ id: row.id, externalId: row.externalId, name: row.name, totalXp: row.totalXp })) };
}

export async function segmentRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/segments', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const data = await db.select().from(segments).where(eq(segments.projectId, projectId)).orderBy(segments.name);
    return reply.send({ data });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/segments', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = segmentSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid segment');
    let filter: SegmentFilter;
    try {
      filter = validateSegmentFilter(parsed.data.filter);
    } catch (err) {
      return bad(reply, (err as Error).message);
    }
    try {
      const [created] = await db
        .insert(segments)
        .values({ id: `seg_${crypto.randomUUID()}`, projectId, key: parsed.data.key, name: parsed.data.name, description: parsed.data.description ?? null, filter })
        .returning();
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A segment with the key "${parsed.data.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; segmentId: string } }>('/api/projects/:projectId/segments/:segmentId', async (request, reply) => {
    const { projectId, segmentId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = segmentSchema.omit({ key: true }).partial().safeParse(request.body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid segment');
    const changes: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.name !== undefined) changes['name'] = parsed.data.name;
    if (parsed.data.description !== undefined) changes['description'] = parsed.data.description;
    if (parsed.data.filter !== undefined) {
      try {
        changes['filter'] = validateSegmentFilter(parsed.data.filter);
      } catch (err) {
        return bad(reply, (err as Error).message);
      }
    }
    const [updated] = await db.update(segments).set(changes).where(and(eq(segments.id, segmentId), eq(segments.projectId, projectId))).returning();
    if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Segment not found' });
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; segmentId: string } }>('/api/projects/:projectId/segments/:segmentId', async (request, reply) => {
    const { projectId, segmentId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [gone] = await db.delete(segments).where(and(eq(segments.id, segmentId), eq(segments.projectId, projectId))).returning({ id: segments.id });
    if (!gone) return reply.status(404).send({ error: 'Not Found', message: 'Segment not found' });
    return reply.status(204).send();
  });

  // Try a filter without saving it, so the builder can show who would be in it.
  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/segments/preview', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      const filter = validateSegmentFilter((request.body as { filter?: unknown } | undefined)?.filter);
      return reply.send(await preview(projectId, filter));
    } catch (err) {
      return bad(reply, (err as Error).message);
    }
  });

  fastify.get<{ Params: { projectId: string; segmentId: string } }>('/api/projects/:projectId/segments/:segmentId/members', async (request, reply) => {
    const { projectId, segmentId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const filter = await loadSegmentFilter(projectId, segmentId);
    if (!filter) return reply.status(404).send({ error: 'Not Found', message: 'Segment not found' });
    return reply.send(await preview(projectId, filter));
  });
}
