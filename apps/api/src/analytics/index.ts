import {
  db,
  getEventAnalytics,
  getExportCsvData,
  getGamificationAnalytics,
  getIntegrationAnalytics,
  getNotificationAnalytics,
  getOverviewAnalytics,
  getUserAnalytics,
  type DateRangePreset,
} from '@gami/database';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';

interface AnalyticsQuery {
  range?: DateRangePreset;
  startDate?: string;
  endDate?: string;
  type?: 'overview' | 'users' | 'events' | 'xp' | 'achievements' | 'challenges';
}

export async function analyticsRoutes(fastify: FastifyInstance) {
  // 1. GET /api/projects/:projectId/analytics/overview
  fastify.get(
    '/api/projects/:projectId/analytics/overview',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: AnalyticsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const data = await getOverviewAnalytics(db, projectId, request.query);
      return reply.send(data);
    }
  );

  // 2. GET /api/projects/:projectId/analytics/users
  fastify.get(
    '/api/projects/:projectId/analytics/users',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: AnalyticsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const data = await getUserAnalytics(db, projectId, request.query);
      return reply.send(data);
    }
  );

  // 3. GET /api/projects/:projectId/analytics/events
  fastify.get(
    '/api/projects/:projectId/analytics/events',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: AnalyticsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const data = await getEventAnalytics(db, projectId, request.query);
      return reply.send(data);
    }
  );

  // 4. GET /api/projects/:projectId/analytics/gamification
  fastify.get(
    '/api/projects/:projectId/analytics/gamification',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: AnalyticsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const data = await getGamificationAnalytics(db, projectId, request.query);
      return reply.send(data);
    }
  );

  // 5. GET /api/projects/:projectId/analytics/notifications
  fastify.get(
    '/api/projects/:projectId/analytics/notifications',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: AnalyticsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const data = await getNotificationAnalytics(db, projectId, request.query);
      return reply.send(data);
    }
  );

  // 6. GET /api/projects/:projectId/analytics/integrations
  fastify.get(
    '/api/projects/:projectId/analytics/integrations',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: AnalyticsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const data = await getIntegrationAnalytics(db, projectId, request.query);
      return reply.send(data);
    }
  );

  // 7. GET /api/projects/:projectId/analytics/export
  fastify.get(
    '/api/projects/:projectId/analytics/export',
    async (request: FastifyRequest<{ Params: { projectId: string }; Querystring: AnalyticsQuery }>, reply: FastifyReply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const exportType = request.query.type || 'overview';
      const csvContent = await getExportCsvData(db, projectId, exportType, request.query);

      const filename = `gami-analytics-${projectId}-${exportType}-${Date.now()}.csv`;

      return reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header('Content-Disposition', `attachment; filename="${filename}"`)
        .send(csvContent);
    }
  );
}
