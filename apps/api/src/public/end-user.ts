import crypto, { createHmac, timingSafeEqual } from 'crypto';
import {
  achievements,
  challenges,
  db,
  endUsers,
  getAuthSecret,
  levels,
  notifications,
  projects,
  pushDevices,
  streakDefinitions,
  userAchievements,
  userStreaks,
  userChallengeProgress,
  userXpBalances,
} from '@gami/database';
import { periodEnd, periodKey, type ChallengeRecurrence, type ChallengeStep } from '@gami/challenges';
import { getLeaderboard, getUserRank, type LeaderboardPeriod } from '@gami/leaderboards';
import { calculateLevel, streakStatus, type StreakCadence } from '@gami/progression';
import { and, desc, eq, or } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { hasScope } from '../authorization/permissions.js';
import { authenticateApiKey } from '../services/api-key.service.js';
import { loadAchievementProgress } from '../achievements/progress.js';
import { MAX_STREAMS_PER_PROCESS, MAX_STREAMS_PER_USER, realtimeHub, startPlayerStream } from '../realtime/index.js';

const TOKEN_PREFIX = 'geu_';
const DEFAULT_TOKEN_SECONDS = 900;
const MAX_TOKEN_SECONDS = 3600;

interface EndUserContext {
  projectId: string;
  userId: string;
}

const createTokenSchema = z.object({
  userId: z.string().min(1).max(128),
  expiresInSeconds: z.number().int().min(60).max(MAX_TOKEN_SECONDS).default(DEFAULT_TOKEN_SECONDS),
});

function sign(payload: string): string {
  return createHmac('sha256', getAuthSecret()).update(`end-user:${payload}`).digest('base64url');
}

export function createEndUserToken(context: EndUserContext, expiresAt: Date): string {
  const claims = [context.projectId, context.userId, Math.floor(expiresAt.getTime() / 1000)];
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${TOKEN_PREFIX}${payload}.${sign(payload)}`;
}

export function verifyEndUserToken(token: string): EndUserContext | null {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const [payload, signature] = token.slice(TOKEN_PREFIX.length).split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const [projectId, userId, expiry] = JSON.parse(
    Buffer.from(payload, 'base64url').toString()
  ) as [string, string, number];
  return expiry * 1000 > Date.now() ? { projectId, userId } : null;
}

/** Tokens only read one user's data. A project's allowlist also limits which sites can use them. */
async function authenticateEndUser(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<EndUserContext | null> {
  const header = request.headers.authorization ?? '';
  const context = header.startsWith('Bearer ') ? verifyEndUserToken(header.slice(7)) : null;
  if (!context) {
    await reply
      .status(401)
      .send({ code: 'UNAUTHORIZED', message: 'A valid end-user token is required' });
    return null;
  }

  const [project] = await db
    .select({ allowedOrigins: projects.allowedOrigins })
    .from(projects)
    .where(eq(projects.id, context.projectId));

  const origin = request.headers.origin;
  const allowed = (project?.allowedOrigins ?? []) as string[];
  if (origin && allowed.length > 0 && !allowed.includes(origin)) {
    await reply
      .status(403)
      .send({ code: 'ORIGIN_NOT_ALLOWED', message: 'This site is not allowed for this project' });
    return null;
  }

  return context;
}

export async function endUserRoutes(fastify: FastifyInstance) {
  fastify.post('/v1/end-user-tokens', async (request, reply) => {
    const auth = await authenticateApiKey(String(request.headers['x-api-key'] ?? ''));
    if (!auth || auth.isSuspended) {
      return reply
        .status(401)
        .send({ code: 'UNAUTHORIZED', message: 'A valid x-api-key header is required' });
    }
    if (!hasScope((auth.key.scopes as string[]) ?? [], 'users:write')) {
      return reply
        .status(403)
        .send({ code: 'FORBIDDEN', message: 'API key lacks required scope "users:write"' });
    }

    const parsed = createTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        code: 'BAD_REQUEST',
        message: 'Invalid token request',
        details: parsed.error.format(),
      });
    }

    const { userId, expiresInSeconds } = parsed.data;
    const [user] = await db
      .select({ id: endUsers.id, active: endUsers.active })
      .from(endUsers)
      .where(
        and(
          eq(endUsers.projectId, auth.project.id),
          or(eq(endUsers.id, userId), eq(endUsers.externalId, userId))
        )
      );
    if (!user?.active) {
      return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' });
    }

    const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
    const token = createEndUserToken({ projectId: auth.project.id, userId: user.id }, expiresAt);
    return reply.status(201).send({ token, expiresAt });
  });

  fastify.get('/v1/me', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;
    const { projectId, userId } = context;

    const [[user], [balance], projectLevels] = await Promise.all([
      db
        .select({ externalId: endUsers.externalId, name: endUsers.name })
        .from(endUsers)
        .where(and(eq(endUsers.id, userId), eq(endUsers.projectId, projectId))),
      db
        .select({ totalXp: userXpBalances.totalXp })
        .from(userXpBalances)
        .where(and(eq(userXpBalances.userId, userId), eq(userXpBalances.projectId, projectId))),
      db
        .select()
        .from(levels)
        .where(and(eq(levels.projectId, projectId), eq(levels.enabled, true))),
    ]);
    if (!user) return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' });

    const totalXp = balance?.totalXp ?? 0;
    const level = projectLevels.length > 0 ? calculateLevel(totalXp, projectLevels) : null;
    return reply.send({
      externalId: user.externalId,
      name: user.name,
      totalXp,
      level: level && { number: level.level, name: level.name },
      xpToNextLevel: level?.xpToNextLevel ?? null,
      progressPercent: level?.progressPercent ?? null,
    });
  });

  fastify.get('/v1/me/achievements', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    const data = await db
      .select({
        key: achievements.key,
        name: achievements.name,
        description: achievements.description,
        iconUrl: achievements.iconUrl,
        awardedAt: userAchievements.awardedAt,
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(
        and(
          eq(userAchievements.projectId, context.projectId),
          eq(userAchievements.userId, context.userId)
        )
      )
      .orderBy(desc(userAchievements.awardedAt));
    return reply.send({ data });
  });

  // A live stream of this player's notifications and XP. Browsers' EventSource cannot send an
  // Authorization header, so the short-lived token may also come as ?access_token=.
  fastify.get<{ Querystring: { access_token?: string } }>('/v1/me/stream', async (request, reply) => {
    const queryToken = request.query.access_token;
    if (queryToken && !request.headers.authorization) {
      request.headers.authorization = `Bearer ${queryToken}`;
    }
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    if (realtimeHub.count() >= MAX_STREAMS_PER_PROCESS || realtimeHub.count(context.userId) >= MAX_STREAMS_PER_USER) {
      return reply.status(429).send({ code: 'TOO_MANY_STREAMS', message: 'Too many live connections for this user' });
    }
    startPlayerStream(request, reply, context);
  });

  // Phones register themselves here so the server can send them push notifications.
  fastify.post<{ Body: { token?: string; platform?: string } }>('/v1/me/devices', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    const parsed = z
      .object({ token: z.string().min(16).max(4096), platform: z.enum(['ios', 'android']) })
      .safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ code: 'BAD_REQUEST', message: 'Send a device token and a platform of ios or android' });
    }

    // A token belongs to one player. If the phone changed hands, it follows the new signed-in player.
    await db
      .insert(pushDevices)
      .values({
        id: `pdv_${crypto.randomUUID()}`,
        projectId: context.projectId,
        userId: context.userId,
        platform: parsed.data.platform,
        token: parsed.data.token,
      })
      .onConflictDoUpdate({
        target: [pushDevices.projectId, pushDevices.token],
        set: { userId: context.userId, platform: parsed.data.platform, active: true, lastSeenAt: new Date() },
      });
    return reply.status(201).send({ registered: true });
  });

  fastify.delete<{ Params: { token: string } }>('/v1/me/devices/:token', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    await db
      .delete(pushDevices)
      .where(
        and(
          eq(pushDevices.projectId, context.projectId),
          eq(pushDevices.userId, context.userId),
          eq(pushDevices.token, request.params.token)
        )
      );
    return reply.send({ removed: true });
  });

  fastify.get('/v1/me/achievements/progress', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    // Players never see a secret achievement, or how close they are to it, until they earn it.
    const entries = await loadAchievementProgress(context.projectId, context.userId, { includeHidden: false });
    const data = entries.map((entry) => ({
      key: entry.key,
      name: entry.name,
      description: entry.description,
      iconUrl: entry.iconUrl,
      earned: entry.earned,
      tier: entry.tier,
      tierCount: entry.tierCount,
      tierName: entry.tierName,
      value: entry.value,
      nextTarget: entry.nextTarget,
      fraction: entry.fraction,
      complete: entry.complete,
    }));
    return reply.send({ data });
  });

  fastify.get('/v1/me/streaks', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    const [definitions, states, [user]] = await Promise.all([
      db
        .select()
        .from(streakDefinitions)
        .where(and(eq(streakDefinitions.projectId, context.projectId), eq(streakDefinitions.enabled, true)))
        .orderBy(streakDefinitions.createdAt, streakDefinitions.id),
      db
        .select()
        .from(userStreaks)
        .where(and(eq(userStreaks.projectId, context.projectId), eq(userStreaks.userId, context.userId))),
      db.select({ id: endUsers.id }).from(endUsers).where(eq(endUsers.id, context.userId)),
    ]);
    if (!user) return reply.status(404).send({ code: 'NOT_FOUND', message: 'User not found' });

    const byDefinition = new Map(states.map((state) => [state.definitionId, state]));
    const now = new Date();
    const data = definitions.map((definition) => {
      const row = byDefinition.get(definition.id);
      const zone = row?.timeZone ?? definition.timeZone;
      const status = row
        ? streakStatus(
            { current: row.current, longest: row.longest, lastPeriod: row.lastPeriod, freezes: row.freezes },
            now,
            {
              cadence: definition.cadence as StreakCadence,
              timeZone: definition.timeZone,
              freezeEvery: definition.freezeEvery,
              maxFreezes: definition.maxFreezes,
            },
            zone
          )
        : { alive: false, atRisk: false, current: 0 };
      return {
        key: definition.key,
        name: definition.name,
        cadence: definition.cadence,
        current: status.current,
        longest: row?.longest ?? 0,
        freezes: row?.freezes ?? 0,
        atRisk: status.atRisk,
        timeZone: zone,
        lastActivityAt: row?.lastActivityAt ?? null,
      };
    });
    return reply.send({ data });
  });

  fastify.get('/v1/me/challenges', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    // Open challenges, started or not, so a daily quest shows up before the player begins it.
    const now = new Date();
    const [open, rows] = await Promise.all([
      db
        .select()
        .from(challenges)
        .where(and(eq(challenges.projectId, context.projectId), eq(challenges.enabled, true)))
        .orderBy(challenges.createdAt, challenges.id),
      db
        .select()
        .from(userChallengeProgress)
        .where(
          and(
            eq(userChallengeProgress.projectId, context.projectId),
            eq(userChallengeProgress.userId, context.userId)
          )
        ),
    ]);

    const data = open
      .filter((challenge) => !(challenge.startAt && challenge.startAt > now) && !(challenge.endAt && challenge.endAt <= now))
      .map((challenge) => {
        const recurrence = challenge.recurrence as ChallengeRecurrence | null;
        const period = periodKey(recurrence, now);
        const current = rows.find((row) => row.challengeId === challenge.id && row.periodKey === period);
        const progress = current?.progress ?? 0;
        const steps = (challenge.steps as ChallengeStep[] | null) ?? null;
        return {
          key: challenge.key,
          name: challenge.name,
          description: challenge.description,
          iconUrl: challenge.iconUrl,
          type: challenge.type,
          recurrence,
          target: challenge.target,
          progress,
          completed: current?.completed ?? false,
          periodEndsAt: recurrence ? periodEnd(recurrence, now) : challenge.endAt,
          steps: steps?.map((step, index) => ({ name: step.name, done: index < progress })) ?? null,
        };
      });
    return reply.send({ data });
  });

  fastify.get('/v1/me/notifications', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    const data = await db
      .select({
        id: notifications.id,
        type: notifications.type,
        title: notifications.title,
        message: notifications.message,
        createdAt: notifications.createdAt,
      })
      .from(notifications)
      .where(
        and(
          eq(notifications.projectId, context.projectId),
          eq(notifications.userId, context.userId)
        )
      )
      .orderBy(desc(notifications.createdAt))
      .limit(50);
    return reply.send({ data });
  });

  // A board a player can be shown. It leaves out the project's own IDs and any email address.
  fastify.get<{ Querystring: { period?: string; limit?: string } }>('/v1/me/leaderboard', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    const periods = ['all_time', 'daily', 'weekly', 'monthly'];
    const period = (periods.includes(request.query.period ?? '') ? request.query.period : 'all_time') as LeaderboardPeriod;
    const limit = Math.min(50, Math.max(1, Number(request.query.limit) || 10));

    const [board, mine] = await Promise.all([
      getLeaderboard(context.projectId, { period, page: 1, limit }),
      getUserRank(context.projectId, context.userId, { period }),
    ]);

    const shape = (entry: { rank: number; name: string | null; avatarUrl: string | null; xp: number; levelName?: string; userId: string }) => ({
      rank: entry.rank,
      name: entry.name,
      avatarUrl: entry.avatarUrl,
      xp: entry.xp,
      levelName: entry.levelName ?? null,
      isMe: entry.userId === context.userId,
    });

    return reply.send({
      period,
      total: board.total,
      entries: board.entries.map(shape),
      me: mine.entry ? shape(mine.entry) : null,
    });
  });

  fastify.get('/v1/me/rank', async (request, reply) => {
    const context = await authenticateEndUser(request, reply);
    if (!context) return;

    const { rank, totalUsers } = await getUserRank(context.projectId, context.userId);
    return reply.send({ rank, totalUsers });
  });
}
