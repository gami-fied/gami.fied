import { abuseFlags, abuseSettings, db, endUsers } from '@gami/database';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const settingsSchema = z.object({
  enabled: z.boolean(),
  xpPerHour: z.number().int().min(1).max(100_000_000).nullable(),
  eventsPerHour: z.number().int().min(1).max(1_000_000).nullable(),
  autoHide: z.boolean(),
});

/** Velocity flags: who is earning faster than the project expects, for a person to review. */
export async function abuseRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/abuse/settings', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [row] = await db.select().from(abuseSettings).where(eq(abuseSettings.projectId, projectId));
    return reply.send(row ?? { projectId, enabled: false, xpPerHour: null, eventsPerHour: null, autoHide: false });
  });

  fastify.put<{ Params: { projectId: string } }>('/api/projects/:projectId/abuse/settings', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = settingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Invalid settings' });
    if (parsed.data.enabled && !parsed.data.xpPerHour && !parsed.data.eventsPerHour) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Set an XP or event threshold to turn flags on' });
    }
    const values = { ...parsed.data, updatedAt: new Date() };
    const [saved] = await db.insert(abuseSettings).values({ projectId, ...values }).onConflictDoUpdate({ target: abuseSettings.projectId, set: values }).returning();
    return reply.send(saved);
  });

  fastify.get<{ Params: { projectId: string }; Querystring: { status?: string } }>('/api/projects/:projectId/abuse/flags', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const status = (['open', 'dismissed', 'confirmed'] as const).find((value) => value === request.query.status) ?? 'open';
    const data = await db
      .select({ flag: abuseFlags, externalId: endUsers.externalId, name: endUsers.name, rankingHidden: endUsers.rankingHidden })
      .from(abuseFlags)
      .innerJoin(endUsers, eq(endUsers.id, abuseFlags.userId))
      .where(and(eq(abuseFlags.projectId, projectId), eq(abuseFlags.status, status)))
      .orderBy(desc(abuseFlags.createdAt))
      .limit(100);
    return reply.send({ data: data.map(({ flag, ...person }) => ({ ...flag, ...person })) });
  });

  // Confirming keeps (or puts) the person off the rankings. Dismissing undoes an automatic hide.
  fastify.post<{ Params: { projectId: string; flagId: string } }>('/api/projects/:projectId/abuse/flags/:flagId', async (request, reply) => {
    const { projectId, flagId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const parsed = z.object({ action: z.enum(['dismiss', 'confirm']) }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: 'action must be dismiss or confirm' });
    const updated = await db.transaction(async (tx) => {
      const [flag] = await tx.select().from(abuseFlags).where(and(eq(abuseFlags.id, flagId), eq(abuseFlags.projectId, projectId))).for('update');
      if (!flag) return null;
      if (parsed.data.action === 'confirm') {
        await tx.update(endUsers).set({ rankingHidden: true, updatedAt: new Date() }).where(eq(endUsers.id, flag.userId));
      } else if (flag.autoHidden) {
        await tx.update(endUsers).set({ rankingHidden: false, updatedAt: new Date() }).where(eq(endUsers.id, flag.userId));
      }
      const [row] = await tx
        .update(abuseFlags)
        .set({ status: parsed.data.action === 'confirm' ? 'confirmed' : 'dismissed', resolvedAt: new Date() })
        .where(eq(abuseFlags.id, flagId))
        .returning();
      return row;
    });
    if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Flag not found' });
    return reply.send(updated);
  });
}
