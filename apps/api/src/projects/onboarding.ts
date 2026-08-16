import {
  achievements,
  apiKeys,
  challenges,
  db,
  endUsers,
  events,
  integrations,
  levels,
  notifications,
  rules,
  serverConfigs,
  webhookEndpoints,
} from '@gami/database';
import { count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';

export async function projectOnboardingRoutes(fastify: FastifyInstance) {
  // GET /api/projects/:projectId/onboarding - Backend-driven setup checklist detector
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/onboarding',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      const [
        [apiKeyRow],
        [endUserRow],
        [eventRow],
        [ruleRow],
        [levelsRow],
        [achRow],
        [challengeRow],
        [notifRow],
        [webhookRow],
        [integRow],
        [smtpConfigRow],
      ] = await Promise.all([
        db.select({ count: count() }).from(apiKeys).where(eq(apiKeys.projectId, projectId)),
        db.select({ count: count() }).from(endUsers).where(eq(endUsers.projectId, projectId)),
        db.select({ count: count() }).from(events).where(eq(events.projectId, projectId)),
        db.select({ count: count() }).from(rules).where(eq(rules.projectId, projectId)),
        db.select({ count: count() }).from(levels).where(eq(levels.projectId, projectId)),
        db.select({ count: count() }).from(achievements).where(eq(achievements.projectId, projectId)),
        db.select({ count: count() }).from(challenges).where(eq(challenges.projectId, projectId)),
        db.select({ count: count() }).from(notifications).where(eq(notifications.projectId, projectId)),
        db.select({ count: count() }).from(webhookEndpoints).where(eq(webhookEndpoints.projectId, projectId)),
        db.select({ count: count() }).from(integrations).where(eq(integrations.projectId, projectId)),
        db.select().from(serverConfigs).where(eq(serverConfigs.key, 'smtp_config')),
      ]);

      const smtpVal = smtpConfigRow?.value as Record<string, unknown> | undefined;
      const hasSmtpConfig =
        Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST !== 'localhost') ||
        Boolean(smtpVal && smtpVal.host && typeof smtpVal.host === 'string' && smtpVal.host.trim().length > 0);

      const steps = [
        {
          id: 'create_organization',
          label: 'Create Organization',
          description: 'Organization workspace initialized.',
          completed: true,
          href: '/dashboard',
        },
        {
          id: 'create_project',
          label: 'Create Project',
          description: `Active project "${authResult.project.name}" selected.`,
          completed: true,
          href: '/dashboard',
        },
        {
          id: 'create_api_key',
          label: 'Create API Key',
          description: 'Generate an API key for external event ingestion.',
          completed: (apiKeyRow?.count || 0) > 0,
          href: '/dashboard/api-keys',
        },
        {
          id: 'create_end_user',
          label: 'Provision End User',
          description: 'Provision application end users to track gamification.',
          completed: (endUserRow?.count || 0) > 0,
          href: '/dashboard/users',
        },
        {
          id: 'send_test_event',
          label: 'Send Test Event',
          description: 'Ingest raw test events via Playground or REST API.',
          completed: (eventRow?.count || 0) > 0,
          href: '/dashboard/events',
        },
        {
          id: 'create_rule',
          label: 'Configure Rules Engine',
          description: 'Define automated rules with conditional AST logic.',
          completed: (ruleRow?.count || 0) > 0,
          href: '/dashboard/rules',
        },
        {
          id: 'configure_levels',
          label: 'Configure Level Progression',
          description: 'Set XP thresholds and level milestone rewards.',
          completed: (levelsRow?.count || 0) > 0,
          href: '/dashboard/levels',
        },
        {
          id: 'create_achievement',
          label: 'Create Achievement',
          description: 'Design unlockable achievement badges and criteria.',
          completed: (achRow?.count || 0) > 0,
          href: '/dashboard/achievements',
        },
        {
          id: 'create_challenge',
          label: 'Create Challenge',
          description: 'Launch single or multi-event streak challenges.',
          completed: (challengeRow?.count || 0) > 0,
          href: '/dashboard/challenges',
        },
        {
          id: 'configure_notifications',
          label: 'Configure In-App Notifications',
          description: 'Trigger canonical in-app user notifications.',
          completed: (notifRow?.count || 0) > 0,
          href: '/dashboard/system',
        },
        {
          id: 'configure_smtp',
          label: 'Configure Outbound Email (SMTP)',
          description: 'Set up SMTP server configuration for transaction emails.',
          completed: hasSmtpConfig,
          href: '/admin/settings',
        },
        {
          id: 'configure_integrations',
          label: 'Configure Webhooks & Discord Channel',
          description: 'Connect HTTP webhooks or Discord integration channels.',
          completed: (webhookRow?.count || 0) > 0 || (integRow?.count || 0) > 0,
          href: '/dashboard/integrations',
        },
      ];

      const completedCount = steps.filter((s) => s.completed).length;
      const progressPercentage = Math.round((completedCount / steps.length) * 100);

      return reply.send({
        projectId,
        totalSteps: steps.length,
        completedCount,
        progressPercentage,
        steps,
      });
    }
  );
}
