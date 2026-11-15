import crypto from 'crypto';
import { challenges, db, isUniqueViolation, journeyCompletions, journeys, type Journey } from '@gami/database';
import { journeyStates, type Prize } from '@gami/rewards';
import { and, count, eq, inArray, ne, or } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';
import { bad, firstIssue, keySchema, notFound, optionalText, prizeProblems, prizesSchema, requirePlayer, sendMechanicError } from './shared.js';

const journeySchema = z.object({
  key: keySchema,
  name: z.string().min(1).max(128),
  description: optionalText(2000),
  /** Challenge keys, in the order they open. */
  steps: z.array(keySchema).min(2, 'A journey needs at least two steps').max(50),
  rewards: prizesSchema.default([]),
  enabled: z.boolean().default(true),
});

/** A player's journeys, with each step's progress and whether it is open yet. */
export async function journeysForPlayer(projectId: string, userId: string) {
  const states = await journeyStates(projectId, userId);
  return states.map(({ journey, steps, completed }) => ({
    key: journey.key,
    name: journey.name,
    description: journey.description,
    completed,
    stepsDone: steps.filter((step) => step.completed).length,
    rewards: journey.rewards as Prize[],
    steps: steps.map((step) => ({ challenge: step.key, name: step.name, description: step.description, target: step.target, progress: step.progress, completed: step.completed, locked: step.locked })),
  }));
}

/** Checks the steps: each is a challenge that runs once, used once, and in no other journey. */
async function stepProblem(projectId: string, steps: string[], journeyId?: string): Promise<string | null> {
  if (new Set(steps).size !== steps.length) return 'A challenge can be a step only once';
  const found = await db
    .select({ key: challenges.key, recurrence: challenges.recurrence })
    .from(challenges)
    .where(and(eq(challenges.projectId, projectId), inArray(challenges.key, steps)));
  const byKey = new Map(found.map((challenge) => [challenge.key, challenge]));
  for (const key of steps) {
    const challenge = byKey.get(key);
    if (!challenge) return `There is no challenge "${key}"`;
    if (challenge.recurrence) return `"${key}" repeats ${challenge.recurrence}. A journey step must be a challenge that runs once.`;
  }
  const others = await db
    .select({ key: journeys.key, steps: journeys.steps })
    .from(journeys)
    .where(and(eq(journeys.projectId, projectId), journeyId ? ne(journeys.id, journeyId) : undefined));
  for (const other of others) {
    const shared = (other.steps as string[]).find((key) => steps.includes(key));
    if (shared) return `"${shared}" is already a step in the journey "${other.key}"`;
  }
  return null;
}

export async function journeyRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/journeys', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [list, finished] = await Promise.all([
      db.select().from(journeys).where(eq(journeys.projectId, projectId)).orderBy(journeys.createdAt, journeys.id),
      db.select({ journeyId: journeyCompletions.journeyId, total: count() }).from(journeyCompletions).where(eq(journeyCompletions.projectId, projectId)).groupBy(journeyCompletions.journeyId),
    ]);
    const done = new Map(finished.map((row) => [row.journeyId, row.total]));
    return reply.send({ data: list.map((journey) => ({ ...journey, completions: done.get(journey.id) ?? 0 })) });
  });

  const save = async (projectId: string, body: unknown, existing?: Journey) => {
    const parsed = journeySchema.safeParse(existing ? { ...existing, ...(body as Record<string, unknown>), key: existing.key } : body);
    if (!parsed.success) return { problem: firstIssue(parsed.error, 'Invalid journey') };
    const problem = (await stepProblem(projectId, parsed.data.steps, existing?.id)) ?? (await prizeProblems(projectId, parsed.data.rewards))[0];
    if (problem) return { problem };
    return { values: { ...parsed.data, description: parsed.data.description ?? null } };
  };

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/journeys', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const row = await save(projectId, request.body);
    if ('problem' in row) return bad(reply, row.problem!);
    try {
      const [created] = await db
        .insert(journeys)
        .values({ id: `jrn_${crypto.randomUUID()}`, projectId, ...row.values })
        .returning();
      return reply.status(201).send(created);
    } catch (err) {
      if (isUniqueViolation(err)) return bad(reply, `A journey with the key "${row.values.key}" already exists`);
      throw err;
    }
  });

  fastify.patch<{ Params: { projectId: string; journeyId: string } }>('/api/projects/:projectId/journeys/:journeyId', async (request, reply) => {
    const { projectId, journeyId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [existing] = await db
      .select()
      .from(journeys)
      .where(and(eq(journeys.projectId, projectId), or(eq(journeys.id, journeyId), eq(journeys.key, journeyId))));
    if (!existing) return notFound(reply, 'Journey');
    if (typeof request.body !== 'object' || request.body === null) return bad(reply, 'Invalid journey');
    const row = await save(projectId, request.body, existing);
    if ('problem' in row) return bad(reply, row.problem!);
    const [updated] = await db
      .update(journeys)
      .set({ ...row.values, updatedAt: new Date() })
      .where(eq(journeys.id, existing.id))
      .returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; journeyId: string } }>('/api/projects/:projectId/journeys/:journeyId', async (request, reply) => {
    const { projectId, journeyId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [deleted] = await db
      .delete(journeys)
      .where(and(eq(journeys.projectId, projectId), eq(journeys.id, journeyId)))
      .returning({ id: journeys.id });
    if (!deleted) return notFound(reply, 'Journey');
    return reply.status(204).send();
  });

  fastify.get<{ Params: { projectId: string; userId: string } }>('/api/projects/:projectId/users/:userId/journeys', async (request, reply) => {
    const { projectId, userId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    try {
      const player = await requirePlayer(db, projectId, userId);
      return reply.send({ data: await journeysForPlayer(projectId, player.id) });
    } catch (err) {
      return sendMechanicError(reply, err);
    }
  });
}
