import {
  db,
  endUsers,
  events,
  ruleExecutions,
  rules,
  userXpBalances,
  xpLedger,
} from '@gami/database';
import { and, count, countDistinct, desc, eq, gte, sum } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';
import { getSetupProgress } from './onboarding.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Everything the Overview page shows, in one call. */
export async function projectOverviewRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/overview',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const dayAgo = new Date(Date.now() - DAY_MS);
      const weekAgo = new Date(Date.now() - 7 * DAY_MS);

      const [
        [eventsToday],
        [activeUsers],
        [totalUsers],
        [xpThisWeek],
        [failuresToday],
        [ruleCount],
        recentEvents,
        topUsers,
        setup,
      ] = await Promise.all([
        db
          .select({ total: count() })
          .from(events)
          .where(and(eq(events.projectId, projectId), gte(events.occurredAt, dayAgo))),
        db
          .select({ total: countDistinct(events.userId) })
          .from(events)
          .where(and(eq(events.projectId, projectId), gte(events.occurredAt, weekAgo))),
        db.select({ total: count() }).from(endUsers).where(eq(endUsers.projectId, projectId)),
        db
          .select({ total: sum(xpLedger.amount) })
          .from(xpLedger)
          .where(and(eq(xpLedger.projectId, projectId), gte(xpLedger.createdAt, weekAgo))),
        db
          .select({ total: count() })
          .from(ruleExecutions)
          .innerJoin(rules, eq(ruleExecutions.ruleId, rules.id))
          .where(
            and(
              eq(rules.projectId, projectId),
              eq(ruleExecutions.status, 'failed'),
              gte(ruleExecutions.updatedAt, dayAgo)
            )
          ),
        db.select({ total: count() }).from(rules).where(eq(rules.projectId, projectId)),
        db
          .select({
            id: events.id,
            type: events.type,
            occurredAt: events.occurredAt,
            externalId: endUsers.externalId,
            name: endUsers.name,
          })
          .from(events)
          .leftJoin(endUsers, eq(events.userId, endUsers.id))
          .where(eq(events.projectId, projectId))
          .orderBy(desc(events.occurredAt))
          .limit(8),
        db
          .select({
            id: endUsers.id,
            externalId: endUsers.externalId,
            name: endUsers.name,
            totalXp: userXpBalances.totalXp,
          })
          .from(userXpBalances)
          .innerJoin(endUsers, eq(userXpBalances.userId, endUsers.id))
          .where(and(eq(userXpBalances.projectId, projectId), eq(endUsers.active, true)))
          .orderBy(desc(userXpBalances.totalXp))
          .limit(5),
        getSetupProgress(projectId),
      ]);

      return reply.send({
        stats: {
          eventsToday: eventsToday?.total ?? 0,
          activeUsers: activeUsers?.total ?? 0,
          totalUsers: totalUsers?.total ?? 0,
          xpThisWeek: Number(xpThisWeek?.total ?? 0),
          failuresToday: failuresToday?.total ?? 0,
          ruleCount: ruleCount?.total ?? 0,
        },
        recentEvents,
        topUsers,
        setup,
      });
    }
  );
}
