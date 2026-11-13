/**
 * Design files (WEB-30): a project's game design, without any player data, saved as a file and
 * imported into another project on this install or another one. The live demo's "Keep this
 * setup" button downloads one.
 *
 *   GET  /api/projects/:projectId/design          the project's design, as a file
 *   POST /api/projects/:projectId/design/preview  what importing a file would add or change
 *   POST /api/projects/:projectId/design          imports it: adds and updates, never deletes
 */
import { validateChallengeInput } from '@gami/challenges';
import { achievements, db } from '@gami/database';
import { validateLevelDefinitions } from '@gami/progression';
import { validateRuleForSave } from '@gami/rules';
import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../audit-logs/index.js';
import { requireProjectAccess } from '../authorization/index.js';
import { actorOf } from '../rules/versions.js';
import { applyDesign, DESIGN_FORMAT, diffDesign, exportDesign, PROMOTABLE_KINDS, type DesignDocument, type PromotableKind } from './promotion.js';

/** Designs are small, but larger than the API's usual 64 KB request limit. */
const DESIGN_BODY_LIMIT = 4 * 1024 * 1024;
const MAX_ITEMS_PER_KIND = 2000;

const itemsSchema = z.object(
  Object.fromEntries(PROMOTABLE_KINDS.map((kind) => [kind, z.array(z.record(z.string(), z.unknown())).max(MAX_ITEMS_PER_KIND).optional()])) as Record<
    PromotableKind,
    z.ZodOptional<z.ZodArray<z.ZodRecord<z.ZodString, z.ZodUnknown>>>
  >
);

const documentSchema = z.object({
  format: z.literal(DESIGN_FORMAT),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  project: z.object({ name: z.string().max(256) }).partial().optional(),
  items: itemsSchema,
});

/** What identifies each kind of item in a file; it must be there for the item to be matched. */
const IDENTITY_FIELD: Record<PromotableKind, string> = {
  currencies: 'key',
  achievements: 'key',
  levels: 'level',
  streaks: 'key',
  segments: 'key',
  leagues: 'key',
  rules: 'name',
  challenges: 'key',
  boosts: 'name',
  limits: 'name',
  rewards: 'key',
};

export interface DesignCheck {
  design: DesignDocument | null;
  errors: string[];
}

/**
 * Checks a file the way saving each item would: rules, challenges and levels go through the same
 * validators as the dashboard. Returns every problem, not just the first.
 */
export function checkDesign(input: unknown): DesignCheck {
  const parsed = documentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const message =
      issue?.path[0] === 'format' ? `This is not a Gami.Fied design file. Its "format" must be "${DESIGN_FORMAT}".` : `The file is not valid: ${issue?.path.join('.') ?? ''} ${issue?.message ?? ''}`.trim();
    return { design: null, errors: [message] };
  }
  const design = parsed.data as DesignDocument;
  const errors: string[] = [];
  for (const kind of PROMOTABLE_KINDS) {
    for (const [index, item] of (design.items[kind] ?? []).entries()) {
      const field = IDENTITY_FIELD[kind];
      if (item[field] === undefined || item[field] === null || item[field] === '') errors.push(`${kind} item ${index + 1} has no ${field}.`);
    }
  }
  for (const rule of design.items.rules ?? []) {
    try {
      validateRuleForSave({ trigger: rule['trigger'], conditions: rule['conditions'] ?? undefined, actions: rule['actions'] });
    } catch (err) {
      errors.push(`Rule "${String(rule['name'])}": ${(err as Error).message}`);
    }
  }
  for (const challenge of design.items.challenges ?? []) {
    const result = validateChallengeInput(challenge);
    if (!result.valid) errors.push(`Challenge "${String(challenge['key'])}": ${result.errors.join(' ')}`);
  }
  const levels = design.items.levels ?? [];
  if (levels.length) {
    const result = validateLevelDefinitions(levels as never);
    if (!result.valid) errors.push(...result.errors.map((error) => `Levels: ${error}`));
  }
  return { design: errors.length ? null : design, errors };
}

/** Achievements that rules award but neither the file nor the project has. */
async function missingAchievements(design: DesignDocument, projectId: string): Promise<string[]> {
  const inFile = new Set((design.items.achievements ?? []).map((item) => String(item['key'])));
  const inProject = new Set((await db.select({ key: achievements.key }).from(achievements).where(eq(achievements.projectId, projectId))).map((row) => row.key));
  const awarded = (design.items.rules ?? []).flatMap((rule) =>
    ((rule['actions'] as { type: string; params?: Record<string, unknown> }[] | undefined) ?? []).filter((a) => a.type === 'award_achievement').map((a) => String(a.params?.['achievementKey'] ?? ''))
  );
  return [...new Set(awarded.filter((key) => key && !inFile.has(key) && !inProject.has(key)))];
}

async function requireAdmin(request: FastifyRequest, reply: FastifyReply, projectId: string) {
  const access = await requireProjectAccess(request, reply, projectId);
  if (!access) return null;
  if (!['owner', 'admin'].includes(access.membership.role)) {
    reply.status(403).send({ error: 'Forbidden', message: 'Only owners and admins can export or import a design' });
    return null;
  }
  return access;
}

const fileName = (name: string) =>
  `${
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'project'
  }-design.json`;

export async function designRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/design', async (request, reply) => {
    const access = await requireAdmin(request, reply, request.params.projectId);
    if (!access) return;
    const design = await exportDesign(request.params.projectId, access.project.name);
    return reply.header('Content-Disposition', `attachment; filename="${fileName(access.project.name)}"`).send(design);
  });

  fastify.post<{ Params: { projectId: string }; Body: { design?: unknown } }>(
    '/api/projects/:projectId/design/preview',
    { bodyLimit: DESIGN_BODY_LIMIT },
    async (request, reply) => {
      const access = await requireAdmin(request, reply, request.params.projectId);
      if (!access) return;
      const { design, errors } = checkDesign(request.body?.design);
      if (!design) return reply.status(400).send({ error: 'Bad Request', message: errors[0], errors });
      const items = await diffDesign(design, request.params.projectId);
      const missing = await missingAchievements(design, request.params.projectId);
      return reply.send({
        project: design.project?.name ?? null,
        summary: {
          new: items.filter((item) => item.status === 'new').length,
          changed: items.filter((item) => item.status === 'changed').length,
          same: items.filter((item) => item.status === 'same').length,
          // Importing never deletes, so these stay as they are.
          onlyInProject: items.filter((item) => item.status === 'only_in_target').length,
        },
        warnings: missing.map((key) => `A rule awards the achievement "${key}", which is in neither the file nor this project.`),
        data: items,
      });
    }
  );

  fastify.post<{ Params: { projectId: string }; Body: { design?: unknown; items?: unknown } }>(
    '/api/projects/:projectId/design',
    { bodyLimit: DESIGN_BODY_LIMIT },
    async (request, reply) => {
      const access = await requireAdmin(request, reply, request.params.projectId);
      if (!access) return;
      const { design, errors } = checkDesign(request.body?.design);
      if (!design) return reply.status(400).send({ error: 'Bad Request', message: errors[0], errors });
      const selected = z
        .array(z.object({ kind: z.enum(PROMOTABLE_KINDS as unknown as [PromotableKind, ...PromotableKind[]]), identity: z.string().min(1).max(256) }))
        .max(MAX_ITEMS_PER_KIND * PROMOTABLE_KINDS.length)
        .optional()
        .safeParse(request.body?.items);
      if (!selected.success) return reply.status(400).send({ error: 'Bad Request', message: 'The items to import are not valid' });

      try {
        const result = await applyDesign(design, request.params.projectId, selected.data ?? null, actorOf(access), 'Imported from a design file');
        await createAuditLog(db, {
          organizationId: access.project.organizationId,
          projectId: request.params.projectId,
          actorType: 'user',
          actorId: actorOf(access) ?? 'unknown',
          action: 'project.design_imported',
          severity: 'warning',
          resourceType: 'project',
          resourceId: request.params.projectId,
          metadata: { from: design.project?.name ?? null, ...result },
        });
        return reply.send(result);
      } catch (err) {
        return reply.status(409).send({ error: 'Conflict', message: (err as Error).message });
      }
    }
  );
}
