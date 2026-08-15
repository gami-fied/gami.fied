import crypto from 'crypto';
import { db, rules } from '@gami/database';
import { evaluateRule, validateRuleDefinition, EventData } from '@gami/rules';
import { eq, and, asc } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const createRuleSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  trigger: z.string().min(1).max(128),
  conditions: z.record(z.unknown()).optional(),
  actions: z.array(z.record(z.unknown())).min(1),
  enabled: z.boolean().default(true),
});

const patchRuleSchema = createRuleSchema.partial();

const previewRuleSchema = z.object({
  rule: z.record(z.unknown()),
  event: z.object({
    id: z.string().optional(),
    type: z.string().min(1),
    payload: z.record(z.unknown()).default({}),
    userId: z.string().nullable().optional(),
    occurredAt: z.string().optional(),
  }),
});

export async function ruleRoutes(fastify: FastifyInstance) {
  // 1. Create Rule
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/rules',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const parseResult = createRuleSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid rule schema',
          details: parseResult.error.format(),
        });
      }

      const ruleData = parseResult.data;

      // Validate Rule Definition via @gami/rules
      try {
        validateRuleDefinition({
          trigger: ruleData.trigger,
          conditions: ruleData.conditions,
          actions: ruleData.actions,
        });
      } catch (err: unknown) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: (err as Error).message || 'Invalid rule definition',
        });
      }

      const ruleId = `r_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

      const [newRule] = await db
        .insert(rules)
        .values({
          id: ruleId,
          projectId,
          name: ruleData.name,
          description: ruleData.description || null,
          trigger: ruleData.trigger,
          conditions: ruleData.conditions || null,
          actions: ruleData.actions,
          enabled: ruleData.enabled,
        })
        .returning();

      return reply.status(201).send(newRule);
    }
  );

  // 2. List Rules for Project
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/rules',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const projectRules = await db
        .select()
        .from(rules)
        .where(eq(rules.projectId, projectId))
        .orderBy(asc(rules.createdAt), asc(rules.id));

      return reply.send({ data: projectRules });
    }
  );

  // 3. Get Single Rule Details
  fastify.get<{ Params: { projectId: string; ruleId: string } }>(
    '/api/projects/:projectId/rules/:ruleId',
    async (request, reply) => {
      const { projectId, ruleId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [rule] = await db
        .select()
        .from(rules)
        .where(and(eq(rules.id, ruleId), eq(rules.projectId, projectId)));

      if (!rule) {
        return reply.status(404).send({ error: 'Not Found', message: 'Rule not found' });
      }

      return reply.send(rule);
    }
  );

  // 4. Update Rule
  fastify.patch<{ Params: { projectId: string; ruleId: string } }>(
    '/api/projects/:projectId/rules/:ruleId',
    async (request, reply) => {
      const { projectId, ruleId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [existingRule] = await db
        .select()
        .from(rules)
        .where(and(eq(rules.id, ruleId), eq(rules.projectId, projectId)));

      if (!existingRule) {
        return reply.status(404).send({ error: 'Not Found', message: 'Rule not found' });
      }

      const parseResult = patchRuleSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid patch payload',
          details: parseResult.error.format(),
        });
      }

      const patch = parseResult.data;

      // Validate merged rule definition if trigger/conditions/actions are updated
      try {
        validateRuleDefinition({
          trigger: patch.trigger ?? existingRule.trigger,
          conditions: patch.conditions ?? existingRule.conditions ?? undefined,
          actions: patch.actions ?? (existingRule.actions as unknown[]),
        });
      } catch (err: unknown) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: (err as Error).message || 'Invalid rule definition',
        });
      }

      const [updatedRule] = await db
        .update(rules)
        .set({
          name: patch.name ?? existingRule.name,
          description:
            patch.description !== undefined ? patch.description : existingRule.description,
          trigger: patch.trigger ?? existingRule.trigger,
          conditions: patch.conditions !== undefined ? patch.conditions : existingRule.conditions,
          actions: patch.actions ?? existingRule.actions,
          enabled: patch.enabled ?? existingRule.enabled,
          updatedAt: new Date(),
        })
        .where(eq(rules.id, ruleId))
        .returning();

      return reply.send(updatedRule);
    }
  );

  // 5. Delete Rule
  fastify.delete<{ Params: { projectId: string; ruleId: string } }>(
    '/api/projects/:projectId/rules/:ruleId',
    async (request, reply) => {
      const { projectId, ruleId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [deleted] = await db
        .delete(rules)
        .where(and(eq(rules.id, ruleId), eq(rules.projectId, projectId)))
        .returning();

      if (!deleted) {
        return reply.status(404).send({ error: 'Not Found', message: 'Rule not found' });
      }

      return reply.send({ success: true, message: 'Rule deleted successfully' });
    }
  );

  // 6. Rule Preview / Testing (In-Memory Only)
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/rules/preview',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const parseResult = previewRuleSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid preview payload',
          details: parseResult.error.format(),
        });
      }

      const { rule: rawRule, event: rawEvent } = parseResult.data;

      const sampleEvent: EventData = {
        id: rawEvent.id || 'preview_event_id',
        projectId,
        userId: rawEvent.userId || null,
        type: rawEvent.type,
        payload: rawEvent.payload,
        occurredAt: rawEvent.occurredAt || new Date().toISOString(),
      };

      const result = evaluateRule(rawRule, sampleEvent);
      return reply.send(result);
    }
  );
}
