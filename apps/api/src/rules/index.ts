import crypto from 'crypto';
import { achievements, db, endUsers, events, measureAggregate, ruleExecutions, rules, xpLedger } from '@gami/database';
import {
  ActionDefinition,
  evaluateRule,
  EventData,
  collectAggregateSpecs,
  getReferencedAchievementKeys,
  resolveAggregates,
  validateRuleForSave,
} from '@gami/rules';
import { eq, and, asc, desc, gte, inArray, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const createRuleSchema = z.object({
  name: z.string().min(1).max(128),
  description: z.string().max(512).optional(),
  trigger: z.string().min(1).max(128),
  conditions: z.record(z.string(), z.unknown()).optional(),
  actions: z.array(z.record(z.string(), z.unknown())).min(1),
  enabled: z.boolean().default(true),
});

const patchRuleSchema = createRuleSchema.partial();

const previewRuleSchema = z.object({
  rule: z.record(z.string(), z.unknown()),
  event: z.object({
    id: z.string().optional(),
    type: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).default({}),
    userId: z.string().nullable().optional(),
    occurredAt: z.string().optional(),
  }),
});

/** Missing achievements block the save. Disabled ones only warn, because they can be re-enabled. */
async function checkAchievementReferences(
  projectId: string,
  actions: ActionDefinition[]
): Promise<{ error?: string; warnings: string[] }> {
  const keys = getReferencedAchievementKeys(actions);
  if (keys.length === 0) return { warnings: [] };

  const found = await db
    .select({ key: achievements.key, enabled: achievements.enabled })
    .from(achievements)
    .where(and(eq(achievements.projectId, projectId), inArray(achievements.key, keys)));

  const missing = keys.filter((key) => !found.some((row) => row.key === key));
  if (missing.length > 0) {
    return { error: `Unknown achievement keys: ${missing.join(', ')}`, warnings: [] };
  }

  return {
    warnings: found
      .filter((row) => !row.enabled)
      .map((row) => `Achievement "${row.key}" is disabled, so this rule will fail until it is enabled`),
  };
}

/** How many past events a backtest reads. Totals over time need extra queries per event, so they read fewer. */
const MAX_SIMULATED_EVENTS = 5000;
const MAX_SIMULATED_WITH_TOTALS = 400;

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
        validateRuleForSave({
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

      const references = await checkAchievementReferences(
        projectId,
        ruleData.actions as unknown as ActionDefinition[]
      );
      if (references.error) {
        return reply.status(400).send({ error: 'Bad Request', message: references.error });
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

      return reply
        .status(201)
        .send(references.warnings.length > 0 ? { ...newRule, warnings: references.warnings } : newRule);
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
        validateRuleForSave({
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

      const references = await checkAchievementReferences(
        projectId,
        (patch.actions ?? existingRule.actions) as unknown as ActionDefinition[]
      );
      if (references.error) {
        return reply.status(400).send({ error: 'Bad Request', message: references.error });
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

      return reply.send(
        references.warnings.length > 0
          ? { ...updatedRule, warnings: references.warnings }
          : updatedRule
      );
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

  // Shows why a rule did or did not fire, using its current definition against recent events.
  fastify.get<{ Params: { projectId: string; ruleId: string } }>(
    '/api/projects/:projectId/rules/:ruleId/trace',
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

      const recent = await db
        .select()
        .from(events)
        .where(and(eq(events.projectId, projectId), eq(events.type, rule.trigger)))
        .orderBy(desc(events.occurredAt))
        .limit(20);

      const executions =
        recent.length === 0
          ? []
          : await db
              .select()
              .from(ruleExecutions)
              .where(
                and(
                  eq(ruleExecutions.ruleId, ruleId),
                  inArray(
                    ruleExecutions.eventId,
                    recent.map((event) => event.id)
                  )
                )
              );

      const data = await Promise.all(recent.map(async (event) => {
        const eventData: EventData = {
          id: event.id,
          projectId,
          userId: event.userId,
          type: event.type,
          payload: (event.payload as Record<string, unknown>) || {},
          occurredAt: event.occurredAt,
        };
        const aggregates = await resolveAggregates(rule.conditions, eventData, (query) =>
          measureAggregate({
            projectId,
            userId: event.userId as string,
            metric: query.spec.metric,
            eventType: query.event,
            field: query.spec.field,
            start: query.start,
            end: query.at,
            excludeEventId: query.excludeEventId,
          })
        );
        const result = evaluateRule(
          {
            trigger: rule.trigger,
            conditions: rule.conditions || undefined,
            actions: rule.actions || [],
          },
          eventData,
          rule.id,
          aggregates
        );
        const execution = executions.find((row) => row.eventId === event.id);

        return {
          eventId: event.id,
          occurredAt: event.occurredAt,
          matched: result.matched,
          reason: result.error ?? (result.matched ? null : 'The conditions did not match this event'),
          execution: execution ? { status: execution.status, error: execution.error } : null,
        };
      }));

      return reply.send({ data });
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

  // 7. Backtest a rule against the events already stored, without giving anyone anything.
  fastify.post<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/rules/simulate',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const parsed = z
        .object({
          rule: z.object({ trigger: z.string().min(1), conditions: z.unknown().optional(), actions: z.array(z.unknown()).min(1) }),
          days: z.number().int().min(1).max(90).default(30),
        })
        .safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: 'Bad Request', message: 'Send a rule and how many days to look back' });
      }
      const { rule, days } = parsed.data;
      try {
        validateRuleForSave({ trigger: rule.trigger, conditions: rule.conditions || undefined, actions: rule.actions });
      } catch (err) {
        return reply.status(400).send({ error: 'Bad Request', message: (err as Error).message });
      }

      const hasTotals = collectAggregateSpecs(rule.conditions as never, rule.trigger).size > 0;
      // Totals need queries per event, so they look at fewer.
      const cap = hasTotals ? MAX_SIMULATED_WITH_TOTALS : MAX_SIMULATED_EVENTS;
      const since = new Date(Date.now() - days * 86_400_000);

      const past = await db
        .select()
        .from(events)
        .where(and(eq(events.projectId, projectId), eq(events.type, rule.trigger), gte(events.occurredAt, since)))
        .orderBy(asc(events.occurredAt))
        .limit(cap + 1);
      const truncated = past.length > cap;
      const considered = past.slice(0, cap);

      const matches: { eventId: string; userId: string | null; at: Date; xp: number }[] = [];
      const badges = new Map<string, number>();
      for (const event of considered) {
        const eventData: EventData = {
          id: event.id,
          projectId,
          userId: event.userId,
          type: event.type,
          payload: (event.payload as Record<string, unknown>) || {},
          occurredAt: event.occurredAt,
        };
        const aggregates = hasTotals
          ? await resolveAggregates(rule.conditions, eventData, (query) =>
              measureAggregate({
                projectId,
                userId: event.userId as string,
                metric: query.spec.metric,
                eventType: query.event,
                field: query.spec.field,
                start: query.start,
                end: query.at,
                excludeEventId: query.excludeEventId,
              })
            )
          : undefined;
        const result = evaluateRule({ trigger: rule.trigger, conditions: rule.conditions || undefined, actions: rule.actions }, eventData, undefined, aggregates);
        if (!result.matched) continue;

        let xp = 0;
        for (const action of result.actions) {
          const params = (action.params ?? {}) as { amount?: number; achievementKey?: string };
          if (action.type === 'award_xp' && typeof params.amount === 'number') xp += params.amount;
          if (action.type === 'award_achievement' && params.achievementKey) badges.set(params.achievementKey, (badges.get(params.achievementKey) ?? 0) + 1);
        }
        matches.push({ eventId: event.id, userId: event.userId, at: event.occurredAt, xp });
      }

      const byDay = new Map<string, { matched: number; xp: number }>();
      const byUser = new Map<string, number>();
      for (const match of matches) {
        const day = match.at.toISOString().slice(0, 10);
        const bucket = byDay.get(day) ?? { matched: 0, xp: 0 };
        bucket.matched++;
        bucket.xp += match.xp;
        byDay.set(day, bucket);
        if (match.userId) byUser.set(match.userId, (byUser.get(match.userId) ?? 0) + match.xp);
      }

      const [existing] = await db
        .select({ xp: sql<number>`COALESCE(SUM(${xpLedger.amount}) FILTER (WHERE ${xpLedger.amount} > 0), 0)::int` })
        .from(xpLedger)
        .where(and(eq(xpLedger.projectId, projectId), gte(xpLedger.createdAt, since)));

      const totalXp = matches.reduce((sum, match) => sum + match.xp, 0);
      const topIds = [...byUser.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      const names = topIds.length
        ? await db.select({ id: endUsers.id, externalId: endUsers.externalId, name: endUsers.name }).from(endUsers).where(inArray(endUsers.id, topIds.map(([id]) => id)))
        : [];

      return reply.send({
        days,
        eventsConsidered: considered.length,
        truncated,
        matched: matches.length,
        usersAffected: byUser.size,
        xpTotal: totalXp,
        xpPerMatch: matches.length > 0 ? Math.round(totalXp / matches.length) : 0,
        // How much this rule alone would have added on top of what was really given over the same days.
        existingXp: existing?.xp ?? 0,
        inflationPercent: (existing?.xp ?? 0) > 0 ? Math.round((totalXp / (existing?.xp as number)) * 100) : null,
        achievements: [...badges.entries()].map(([key, count]) => ({ key, count })),
        byDay: [...byDay.entries()].sort().map(([date, value]) => ({ date, ...value })),
        topUsers: topIds.map(([id, xp]) => ({ userId: id, externalId: names.find((n) => n.id === id)?.externalId ?? id, name: names.find((n) => n.id === id)?.name ?? null, xp })),
        note: 'XP is what the rule gives before any boost or limit.',
      });
    }
  );
}
