import crypto from 'crypto';
import { db, endUsers, levels, userXpBalances, xpLedger } from '@gami/database';
import { createNotificationIntent, generateLevelUpSourceId } from '@gami/notifications';
import { getLevelsCrossed } from '@gami/progression';
import { createWebhookDelivery } from '@gami/webhooks';
import { eq, and, desc, sql, count } from 'drizzle-orm';
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
  metadata: z.record(z.unknown()).optional(),
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

      if (!['owner', 'admin'].includes(authResult.membership.role)) {
        return reply
          .status(403)
          .send({ error: 'Forbidden', message: 'Insufficient role permissions' });
      }

      // Auto-ensure end-user exists in this project
      await db
        .insert(endUsers)
        .values({
          id: userId,
          projectId,
          externalId: userId,
        })
        .onConflictDoNothing();

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

      const ledgerId = `xpl_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const balanceId = `xpb_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      const fullReason = `manual_adjustment: ${reason}`;

      try {
        const createdEntry = await db.transaction(async (tx) => {
          // Idempotency check if idempotencyKey provided
          if (idempotencyKey) {
            const [existing] = await tx
              .select()
              .from(xpLedger)
              .where(
                and(eq(xpLedger.projectId, projectId), eq(xpLedger.idempotencyKey, idempotencyKey))
              );

            if (existing) {
              return { ...existing, duplicate: true };
            }
          }

          const [newEntry] = await tx
            .insert(xpLedger)
            .values({
              id: ledgerId,
              projectId,
              userId,
              idempotencyKey,
              amount,
              reason: fullReason,
              metadata: metadata || {},
            })
            .returning();

          const [upsertedBalance] = await tx
            .insert(userXpBalances)
            .values({
              id: balanceId,
              projectId,
              userId,
              totalXp: amount,
            })
            .onConflictDoUpdate({
              target: [userXpBalances.projectId, userXpBalances.userId],
              set: {
                totalXp: sql`user_xp_balances.total_xp + ${amount}`,
                updatedAt: new Date(),
              },
            })
            .returning();

          const newXp = upsertedBalance ? upsertedBalance.totalXp : amount;
          const previousXp = Math.max(0, newXp - amount);

          // 1. Create xp_awarded notification intent & webhook outbox intent
          await createNotificationIntent(tx, {
            projectId,
            userId,
            type: 'xp_awarded',
            data: { amount, reason: fullReason },
            sourceType: 'xp_awarded',
            sourceId: ledgerId,
          });

          await createWebhookDelivery(tx, {
            projectId,
            eventId: ledgerId,
            eventType: 'xp.awarded',
            userId,
            data: { amount, newBalance: newXp, reason: fullReason },
          });

          // 2. Calculate and create level_up notification intents if levels crossed
          const projectLevels = await tx
            .select()
            .from(levels)
            .where(eq(levels.projectId, projectId));

          if (projectLevels.length > 0) {
            const crossed = getLevelsCrossed(previousXp, newXp, projectLevels);
            const activeLevelsSorted = projectLevels
              .filter((l) => l.enabled !== false)
              .sort((a, b) => a.level - b.level);

            for (const lvlNumber of crossed) {
              const lvlDef = activeLevelsSorted.find((l) => l.level === lvlNumber);
              const levelName = lvlDef ? lvlDef.name : `Level ${lvlNumber}`;
              const sourceId = generateLevelUpSourceId(projectId, userId, lvlNumber);

              await createNotificationIntent(tx, {
                projectId,
                userId,
                type: 'level_up',
                data: {
                  previousLevel: lvlNumber - 1,
                  newLevel: lvlNumber,
                  levelName,
                },
                sourceType: 'level_up',
                sourceId,
              });

              await createWebhookDelivery(tx, {
                projectId,
                eventId: sourceId,
                eventType: 'level.up',
                userId,
                data: {
                  previousLevel: lvlNumber - 1,
                  newLevel: lvlNumber,
                  levelName,
                  xp: newXp,
                },
              });
            }
          }

          return { ...newEntry, duplicate: false };
        });

        if (!createdEntry.duplicate) {
          const { createAuditLog } = await import('../audit-logs/index.js');
          await createAuditLog(db, {
            projectId,
            actorType: 'user',
            actorId: authResult.membership.userId,
            action: 'xp.manually_adjusted',
            resourceType: 'user',
            resourceId: userId,
            metadata: { amount, reason, idempotencyKey },
          });
        }

        const statusCode = createdEntry.duplicate ? 200 : 201;
        return reply.status(statusCode).send(createdEntry);
      } catch (err: unknown) {
        const error = err as { code?: string };
        if (error.code === '23505' && idempotencyKey) {
          const [existing] = await db
            .select()
            .from(xpLedger)
            .where(
              and(eq(xpLedger.projectId, projectId), eq(xpLedger.idempotencyKey, idempotencyKey))
            );

          if (existing) {
            return reply.status(200).send({ ...existing, duplicate: true });
          }
        }
        throw err;
      }
    }
  );
}
