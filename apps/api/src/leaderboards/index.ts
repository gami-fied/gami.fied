import { FastifyInstance } from 'fastify';
import { getLeaderboard, getUserRank, LeaderboardPeriod } from '@gami/leaderboards';
import { requireProjectAccess } from '../authorization/index.js';

export async function leaderboardRoutes(fastify: FastifyInstance) {
  // GET /api/projects/:projectId/leaderboard
  fastify.get<{
    Params: { projectId: string };
    Querystring: {
      period?: string;
      page?: string;
      limit?: string;
      search?: string;
    };
  }>('/api/projects/:projectId/leaderboard', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    const periodStr = request.query.period || 'all_time';
    const validPeriods: LeaderboardPeriod[] = ['all_time', 'daily', 'weekly', 'monthly'];
    const period: LeaderboardPeriod = validPeriods.includes(periodStr as LeaderboardPeriod)
      ? (periodStr as LeaderboardPeriod)
      : 'all_time';

    const page = Number(request.query.page) || 1;
    const limit = Number(request.query.limit) || 20;
    const search = request.query.search;

    const leaderboard = await getLeaderboard(projectId, {
      period,
      page,
      limit,
      search,
    });

    return reply.status(200).send(leaderboard);
  });

  // GET /api/projects/:projectId/leaderboard/:userId
  fastify.get<{
    Params: { projectId: string; userId: string };
    Querystring: {
      period?: string;
    };
  }>('/api/projects/:projectId/leaderboard/:userId', async (request, reply) => {
    const { projectId, userId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    const periodStr = request.query.period || 'all_time';
    const validPeriods: LeaderboardPeriod[] = ['all_time', 'daily', 'weekly', 'monthly'];
    const period: LeaderboardPeriod = validPeriods.includes(periodStr as LeaderboardPeriod)
      ? (periodStr as LeaderboardPeriod)
      : 'all_time';

    const userRank = await getUserRank(projectId, userId, { period });

    if (!userRank.entry) {
      return reply.status(404).send({
        message: `End-user '${userId}' not found in project leaderboard`,
        error: 'Not Found',
        statusCode: 404,
      });
    }

    return reply.status(200).send(userRank);
  });
}
