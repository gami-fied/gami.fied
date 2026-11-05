import { db, eventOutbox, events, ruleExecutions, rules, webhookEndpoints } from '@gami/database';
import { and, count, eq, gte, isNotNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Problems in a project that need someone's attention, for the dashboard bell. */
export async function projectAlertRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/alerts',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [[failedEvents], [failedRules], disabledWebhooks] = await Promise.all([
        db
          .select({ total: count() })
          .from(eventOutbox)
          .innerJoin(events, eq(eventOutbox.eventId, events.id))
          .where(and(eq(events.projectId, projectId), eq(eventOutbox.status, 'failed'))),
        db
          .select({ total: count() })
          .from(ruleExecutions)
          .innerJoin(rules, eq(ruleExecutions.ruleId, rules.id))
          .where(
            and(
              eq(rules.projectId, projectId),
              eq(ruleExecutions.status, 'failed'),
              gte(ruleExecutions.updatedAt, new Date(Date.now() - DAY_MS))
            )
          ),
        db
          .select({
            id: webhookEndpoints.id,
            name: webhookEndpoints.name,
            reason: webhookEndpoints.disabledReason,
          })
          .from(webhookEndpoints)
          .where(
            and(eq(webhookEndpoints.projectId, projectId), isNotNull(webhookEndpoints.disabledReason))
          ),
      ]);

      const alerts = [
        ...(failedEvents?.total
          ? [
              {
                id: 'failed-events',
                title: `${failedEvents.total} failed events`,
                href: '/dashboard/events',
              },
            ]
          : []),
        ...(failedRules?.total
          ? [
              {
                id: 'failed-rules',
                title: `${failedRules.total} rule failures in the last day`,
                href: '/dashboard/rules',
              },
            ]
          : []),
        ...disabledWebhooks.map((hook) => ({
          id: hook.id,
          title: `Webhook "${hook.name}" was disabled`,
          href: '/dashboard/webhooks',
        })),
      ];

      return reply.send({ data: alerts });
    }
  );
}
