import crypto from 'crypto';
import { db, ruleVersions, rules, type Rule } from '@gami/database';
import { validateRuleForSave, type ActionDefinition } from '@gami/rules';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

export interface RuleSnapshot {
  name: string;
  description: string | null;
  trigger: string;
  conditions: unknown;
  actions: unknown;
  enabled: boolean;
}

export const snapshotOf = (rule: Pick<Rule, 'name' | 'description' | 'trigger' | 'conditions' | 'actions' | 'enabled'>): RuleSnapshot => ({
  name: rule.name,
  description: rule.description ?? null,
  trigger: rule.trigger,
  conditions: rule.conditions ?? null,
  actions: rule.actions,
  enabled: rule.enabled,
});

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Saves the rule's current state as the next version. */
export async function recordVersion(handle: Db, rule: Rule, note: string | null, actor: string | null): Promise<number> {
  const [row] = await handle
    .select({ latest: sql<number>`COALESCE(MAX(${ruleVersions.version}), 0)::int` })
    .from(ruleVersions)
    .where(eq(ruleVersions.ruleId, rule.id));
  const version = (row?.latest ?? 0) + 1;
  await handle.insert(ruleVersions).values({
    id: `rv_${crypto.randomUUID()}`,
    ruleId: rule.id,
    projectId: rule.projectId,
    version,
    snapshot: snapshotOf(rule),
    note,
    actor,
  });
  return version;
}

/** Who is acting, for the history. */
export function actorOf(auth: unknown): string | null {
  const value = auth as { session?: { user?: { id?: string } } | null; membership?: { userId?: string } };
  return value.session?.user?.id ?? value.membership?.userId ?? null;
}

const draftSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(1000).nullable().optional(),
  trigger: z.string().min(1).max(128),
  conditions: z.unknown().optional(),
  actions: z.array(z.unknown()).min(1),
  enabled: z.boolean().optional(),
});

function validate(draft: { trigger: string; conditions?: unknown; actions: unknown[] }): string | null {
  try {
    validateRuleForSave({ trigger: draft.trigger, conditions: (draft.conditions as never) ?? undefined, actions: draft.actions as ActionDefinition[] });
    return null;
  } catch (err) {
    return (err as Error).message || 'Invalid rule definition';
  }
}

export async function ruleVersionRoutes(fastify: FastifyInstance) {
  const find = async (projectId: string, ruleId: string) =>
    (await db.select().from(rules).where(and(eq(rules.id, ruleId), eq(rules.projectId, projectId))))[0];

  // Save edits without changing what runs.
  fastify.put<{ Params: { projectId: string; ruleId: string } }>('/api/projects/:projectId/rules/:ruleId/draft', async (request, reply) => {
    const { projectId, ruleId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const rule = await find(projectId, ruleId);
    if (!rule) return reply.status(404).send({ error: 'Not Found', message: 'Rule not found' });

    const parsed = draftSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: 'Invalid draft', details: parsed.error.format() });
    const problem = validate(parsed.data);
    if (problem) return reply.status(400).send({ error: 'Bad Request', message: problem });

    const [updated] = await db
      .update(rules)
      .set({
        draft: {
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          trigger: parsed.data.trigger,
          conditions: parsed.data.conditions ?? null,
          actions: parsed.data.actions,
          enabled: parsed.data.enabled ?? rule.enabled,
        },
        updatedAt: new Date(),
      })
      .where(eq(rules.id, ruleId))
      .returning();
    return reply.send(updated);
  });

  fastify.delete<{ Params: { projectId: string; ruleId: string } }>('/api/projects/:projectId/rules/:ruleId/draft', async (request, reply) => {
    const { projectId, ruleId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const [updated] = await db.update(rules).set({ draft: null }).where(and(eq(rules.id, ruleId), eq(rules.projectId, projectId))).returning();
    if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Rule not found' });
    return reply.send(updated);
  });

  // Make the draft the live rule.
  fastify.post<{ Params: { projectId: string; ruleId: string } }>('/api/projects/:projectId/rules/:ruleId/publish', async (request, reply) => {
    const { projectId, ruleId } = request.params;
    const auth = await requireProjectAccess(request, reply, projectId);
    if (!auth) return;
    const rule = await find(projectId, ruleId);
    if (!rule) return reply.status(404).send({ error: 'Not Found', message: 'Rule not found' });
    if (!rule.draft) return reply.status(409).send({ error: 'Conflict', message: 'There is no draft to publish' });

    const note = z.object({ note: z.string().max(500).optional() }).safeParse(request.body ?? {});
    const draft = rule.draft as RuleSnapshot;
    const problem = validate({ trigger: draft.trigger, conditions: draft.conditions, actions: draft.actions as unknown[] });
    if (problem) return reply.status(400).send({ error: 'Bad Request', message: problem });

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(rules)
        .set({
          name: draft.name,
          description: draft.description,
          trigger: draft.trigger,
          conditions: draft.conditions ?? null,
          actions: draft.actions,
          enabled: draft.enabled,
          draft: null,
          updatedAt: new Date(),
        })
        .where(eq(rules.id, ruleId))
        .returning();
      const version = await recordVersion(tx, updated!, (note.success && note.data.note) || 'Published a draft', actorOf(auth));
      return { rule: updated!, version };
    });
    return reply.send(result);
  });

  fastify.get<{ Params: { projectId: string; ruleId: string } }>('/api/projects/:projectId/rules/:ruleId/versions', async (request, reply) => {
    const { projectId, ruleId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    if (!(await find(projectId, ruleId))) return reply.status(404).send({ error: 'Not Found', message: 'Rule not found' });
    const data = await db.select().from(ruleVersions).where(eq(ruleVersions.ruleId, ruleId)).orderBy(desc(ruleVersions.version)).limit(100);
    return reply.send({ data });
  });

  // Put an earlier version live again. History is kept: this becomes a new version.
  fastify.post<{ Params: { projectId: string; ruleId: string } }>('/api/projects/:projectId/rules/:ruleId/rollback', async (request, reply) => {
    const { projectId, ruleId } = request.params;
    const auth = await requireProjectAccess(request, reply, projectId);
    if (!auth) return;
    const rule = await find(projectId, ruleId);
    if (!rule) return reply.status(404).send({ error: 'Not Found', message: 'Rule not found' });

    const parsed = z.object({ version: z.number().int().min(1), note: z.string().max(500).optional() }).safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: 'Say which version to restore' });

    const [target] = await db.select().from(ruleVersions).where(and(eq(ruleVersions.ruleId, ruleId), eq(ruleVersions.version, parsed.data.version)));
    if (!target) return reply.status(404).send({ error: 'Not Found', message: 'That version does not exist' });

    const snapshot = target.snapshot as RuleSnapshot;
    const problem = validate({ trigger: snapshot.trigger, conditions: snapshot.conditions, actions: snapshot.actions as unknown[] });
    if (problem) return reply.status(409).send({ error: 'Conflict', message: `That version no longer passes validation: ${problem}` });

    const result = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(rules)
        .set({
          name: snapshot.name,
          description: snapshot.description,
          trigger: snapshot.trigger,
          conditions: snapshot.conditions ?? null,
          actions: snapshot.actions,
          enabled: snapshot.enabled,
          draft: null,
          updatedAt: new Date(),
        })
        .where(eq(rules.id, ruleId))
        .returning();
      const version = await recordVersion(tx, updated!, parsed.data.note || `Restored version ${parsed.data.version}`, actorOf(auth));
      return { rule: updated!, version };
    });
    return reply.send(result);
  });
}
