import { publishRealtime } from '@gami/queue';
import { awardXp, InsufficientXpError } from '@gami/rewards';
import { db, endUsers, userXpBalances, xpLedger } from '@gami/database';
import { eq, and, desc, or, sql, count } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireProjectAccess } from '../authorization/index.js';

const adjustXpSchema = z.object({
  amount: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((val) => val !== 0, { message: 'Adjustment amount cannot be zero' }),
  reason: z.string().min(1).max(256),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().max(128).optional(),
});

export async function xpRoutes(fastify: FastifyInstance) {
  // 1. Get User XP Balance
  fastify.get<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/xp',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [balance] = await db
        .select()
        .from(userXpBalances)
        .where(and(eq(userXpBalances.projectId, projectId), eq(userXpBalances.userId, userId)));

      return reply.send({
        projectId,
        userId,
        totalXp: balance?.totalXp ?? 0,
      });
    }
  );

  // 2. Get User XP Ledger History (Paginated)
  fastify.get<{
    Params: { projectId: string; userId: string };
    Querystring: { page?: string; limit?: string };
  }>('/api/projects/:projectId/users/:userId/xp/ledger', async (request, reply) => {
    const { projectId, userId } = request.params;
    const authResult = await requireProjectAccess(request, reply, projectId);
    if (!authResult) return;

    const page = Math.max(1, Number(request.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(request.query.limit) || 20));
    const offset = (page - 1) * limit;

    const ledgerEntries = await db
      .select({
        id: xpLedger.id,
        projectId: xpLedger.projectId,
        userId: xpLedger.userId,
        eventId: xpLedger.eventId,
        ruleId: xpLedger.ruleId,
        ruleExecutionId: xpLedger.ruleExecutionId,
        idempotencyKey: xpLedger.idempotencyKey,
        amount: xpLedger.amount,
        reason: xpLedger.reason,
        metadata: xpLedger.metadata,
        createdAt: xpLedger.createdAt,
      })
      .from(xpLedger)
      .where(and(eq(xpLedger.projectId, projectId), eq(xpLedger.userId, userId)))
      .orderBy(desc(xpLedger.createdAt))
      .limit(limit)
      .offset(offset);

    const [totalCountResult] = await db
      .select({ total: count() })
      .from(xpLedger)
      .where(and(eq(xpLedger.projectId, projectId), eq(xpLedger.userId, userId)));

    const total = totalCountResult?.total || 0;

    return reply.send({
      projectId,
      userId,
      page,
      limit,
      total,
      entries: ledgerEntries,
      data: ledgerEntries,
    });
  });

  // 3. Project XP Summary & Metrics
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/xp/summary',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [txCount] = await db
        .select({ total: count() })
        .from(xpLedger)
        .where(eq(xpLedger.projectId, projectId));

      const [userCount] = await db
        .select({ total: count() })
        .from(userXpBalances)
        .where(eq(userXpBalances.projectId, projectId));

      const [totalXpResult] = await db
        .select({
          total: sql<number>`COALESCE(SUM(${userXpBalances.totalXp}), 0)`,
        })
        .from(userXpBalances)
        .where(eq(userXpBalances.projectId, projectId));

      const topUsers = await db
        .select({
          userId: userXpBalances.userId,
          externalId: endUsers.externalId,
          totalXp: userXpBalances.totalXp,
        })
        .from(userXpBalances)
        .innerJoin(endUsers, eq(userXpBalances.userId, endUsers.id))
        .where(eq(userXpBalances.projectId, projectId))
        .orderBy(desc(userXpBalances.totalXp))
        .limit(5);

      return reply.send({
        projectId,
        totalXpAwarded: Number(totalXpResult?.total || 0),
        totalTransactions: txCount?.total || 0,
        totalUsersWithXp: userCount?.total || 0,
        topUsers,
      });
    }
  );

  // 4. Manual XP Adjustment (Owner/Admin Only with Idempotency-Key support)
  fastify.post<{ Params: { projectId: string; userId: string } }>(
    '/api/projects/:projectId/users/:userId/xp/adjust',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;


      const [targetUser] = await db
        .select({ id: endUsers.id })
        .from(endUsers)
        .where(
          and(
            eq(endUsers.projectId, projectId),
            or(eq(endUsers.id, userId), eq(endUsers.externalId, userId))
          )
        );

      if (!targetUser) {
        return reply.status(404).send({ error: 'Not Found', message: 'End user not found' });
      }

      const parseResult = adjustXpSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'Invalid adjustment payload',
          details: parseResult.error.format(),
        });
      }

      const headerIdempotencyKey = request.headers['idempotency-key'] as string;
      const { amount, reason, metadata, idempotencyKey: bodyIdempotencyKey } = parseResult.data;
      const idempotencyKey = headerIdempotencyKey || bodyIdempotencyKey || null;

      const fullReason = `manual_adjustment: ${reason}`;

      try {
        const createdEntry = await db.transaction(async (tx) => {
          const findExisting = async () => {
            if (!idempotencyKey) return undefined;
            const [existing] = await tx
              .select()
              .from(xpLedger)
              .where(
                and(eq(xpLedger.projectId, projectId), eq(xpLedger.idempotencyKey, idempotencyKey))
              );
            return existing;
          };

          const existing = await findExisting();
          if (existing) return { ...existing, duplicate: true };

          const result = await awardXp(tx, {
            projectId,
            userId: targetUser.id,
            amount,
            reason: fullReason,
            metadata,
            idempotencyKey,
          });

          if (result.duplicate) {
            // A concurrent request with the same key won the insert.
            const winner = await findExisting();
            if (!winner) throw new Error('XP ledger conflict without a matching entry');
            return { ...winner, duplicate: true };
          }

          return { ...result.entry, duplicate: false };
        });

        if (!createdEntry.duplicate) {
          void publishRealtime({ projectId, userId: targetUser.id });
          const { createAuditLog } = await import('../audit-logs/index.js');
          await createAuditLog(db, {
            projectId,
            actorType: 'user',
            actorId: authResult.membership.userId,
            action: 'xp.manually_adjusted',
            resourceType: 'user',
            resourceId: targetUser.id,
            metadata: { amount, reason, idempotencyKey },
          });
        }

        const statusCode = createdEntry.duplicate ? 200 : 201;
        return reply.status(statusCode).send(createdEntry);
      } catch (err: unknown) {
        if (err instanceof InsufficientXpError) {
          return reply.status(422).send({
            error: 'Unprocessable Entity',
            code: 'INSUFFICIENT_XP',
            message: 'This adjustment would take the balance below zero',
          });
        }
        throw err;
      }
    }
  );
}
