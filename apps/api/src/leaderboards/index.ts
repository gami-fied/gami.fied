import { FastifyInstance, FastifyReply } from 'fastify';
import { db, endUsers, friendships } from '@gami/database';
import {
  getGroupLeaderboard,
  getLeaderboard,
  getUserRank,
  isSegmentField,
  LeaderboardPeriod,
  segmentWhere,
  usersWhere,
} from '@gami/leaderboards';
import { and, eq, or, type SQL } from 'drizzle-orm';
import { requireProjectAccess } from '../authorization/index.js';
import { loadSegmentFilter } from '../segments/index.js';

const PERIODS: LeaderboardPeriod[] = ['all_time', 'daily', 'weekly', 'monthly'];

export const periodOf = (value: string | undefined): LeaderboardPeriod =>
  PERIODS.includes(value as LeaderboardPeriod) ? (value as LeaderboardPeriod) : 'all_time';

/** A player and everyone they are friends with. */
export async function friendCircle(projectId: string, userId: string): Promise<string[]> {
  const rows = await db.select({ friendId: friendships.friendId }).from(friendships).where(and(eq(friendships.projectId, projectId), eq(friendships.userId, userId)));
  return [userId, ...rows.map((row) => row.friendId)];
}

export async function resolveEndUserId(projectId: string, ref: string): Promise<string | null> {
  const [user] = await db
    .select({ id: endUsers.id })
    .from(endUsers)
    .where(and(eq(endUsers.projectId, projectId), or(eq(endUsers.id, ref), eq(endUsers.externalId, ref))));
  return user?.id ?? null;
}

export interface BoardQuery {
  period?: string;
  page?: string;
  limit?: string;
  search?: string;
  /** A segment's key or ID. */
  segment?: string;
  /** Rank only this user and their friends. */
  friendsOf?: string;
  /** Rank teams, countries or another attribute instead of people. */
  groupBy?: string;
  score?: string;
}

/**
 * Turns the board options into a filter. Replies with an error and returns `false` when an option
 * names something that does not exist.
 */
export async function boardFilter(projectId: string, query: BoardQuery, reply: FastifyReply): Promise<SQL | undefined | false> {
  const parts: SQL[] = [];
  if (query.segment) {
    const filter = await loadSegmentFilter(projectId, query.segment);
    if (!filter) {
      reply.status(404).send({ error: 'Not Found', message: `There is no segment "${query.segment}"` });
      return false;
    }
    parts.push(segmentWhere(filter));
  }
  if (query.friendsOf) {
    const userId = await resolveEndUserId(projectId, query.friendsOf);
    if (!userId) {
      reply.status(404).send({ error: 'Not Found', message: 'User not found' });
      return false;
    }
    parts.push(usersWhere(await friendCircle(projectId, userId)));
  }
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts);
}

export async function leaderboardRoutes(fastify: FastifyInstance) {
  // GET /api/projects/:projectId/leaderboard
  fastify.get<{ Params: { projectId: string }; Querystring: BoardQuery }>('/api/projects/:projectId/leaderboard', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    const period = periodOf(request.query.period);
    const filter = await boardFilter(projectId, request.query, reply);
    if (filter === false) return;

    if (request.query.groupBy) {
      if (!isSegmentField(request.query.groupBy) || request.query.groupBy === 'totalXp' || request.query.groupBy === 'createdAt') {
        return reply.status(400).send({ error: 'Bad Request', message: 'groupBy must be a field such as metadata.team or metadata.country' });
      }
      const board = await getGroupLeaderboard(projectId, {
        groupBy: request.query.groupBy,
        period,
        score: request.query.score === 'average' ? 'average' : 'total',
        limit: Number(request.query.limit) || 20,
        filter,
      });
      return reply.send(board);
    }

    const leaderboard = await getLeaderboard(projectId, {
      period,
      page: Number(request.query.page) || 1,
      limit: Number(request.query.limit) || 20,
      search: request.query.search,
      filter,
    });

    return reply.status(200).send(leaderboard);
  });

  // GET /api/projects/:projectId/leaderboard/:userId
  fastify.get<{ Params: { projectId: string; userId: string }; Querystring: Pick<BoardQuery, 'period' | 'segment' | 'friendsOf'> }>(
    '/api/projects/:projectId/leaderboard/:userId',
    async (request, reply) => {
      const { projectId, userId } = request.params;
      const access = await requireProjectAccess(request, reply, projectId);
      if (!access) return;

      const filter = await boardFilter(projectId, request.query, reply);
      if (filter === false) return;
      const userRank = await getUserRank(projectId, userId, { period: periodOf(request.query.period), filter });

      if (!userRank.entry) {
        return reply.status(404).send({
          message: `End-user '${userId}' not found in project leaderboard`,
          error: 'Not Found',
          statusCode: 404,
        });
      }

      return reply.status(200).send(userRank);
    }
  );
}
