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
  webhookEndpoints,
} from '@gami/database';
import { count, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { requireProjectAccess } from '../authorization/index.js';
import { ServerConfigService } from '../services/server-config.service.js';

/** Which setup steps a project has finished. Overview shares this with the route below. */
export async function getSetupProgress(projectId: string) {
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
    hasSmtpConfig,
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
    ServerConfigService.isSmtpConfigured(),
  ]);

  const steps = [
    {
      id: 'create_organization',
      label: 'Create an organization',
      description: 'Your workspace is ready.',
      completed: true,
      href: '/dashboard',
    },
    {
      id: 'create_project',
      label: 'Create a project',
      description: 'Your project is ready.',
      completed: true,
      href: '/dashboard',
    },
    {
      id: 'create_api_key',
      label: 'Create an API key',
      description: 'Your app uses this key to send events to Gami.Fied.',
      completed: (apiKeyRow?.count || 0) > 0,
      href: '/dashboard/api-keys',
    },
    {
      id: 'create_end_user',
      label: 'Add a user',
      description: 'Users are created when your app sends their first event, or add one by hand.',
      completed: (endUserRow?.count || 0) > 0,
      href: '/dashboard/users',
    },
    {
      id: 'send_test_event',
      label: 'Send a test event',
      description: 'Try it from the Events page, or send one from your app.',
      completed: (eventRow?.count || 0) > 0,
      href: '/dashboard/events',
    },
    {
      id: 'create_rule',
      label: 'Create a rule',
      description: 'Rules decide when users earn XP and rewards.',
      completed: (ruleRow?.count || 0) > 0,
      href: '/dashboard/rules',
    },
    {
      id: 'configure_levels',
      label: 'Set up levels',
      description: 'Choose how much XP each level takes.',
      completed: (levelsRow?.count || 0) > 0,
      href: '/dashboard/levels',
    },
    {
      id: 'create_achievement',
      label: 'Create an achievement',
      description: 'Add badges users can unlock.',
      completed: (achRow?.count || 0) > 0,
      href: '/dashboard/achievements',
    },
    {
      id: 'create_challenge',
      label: 'Create a challenge',
      description: 'Set a goal for users to reach within a time period.',
      completed: (challengeRow?.count || 0) > 0,
      href: '/dashboard/challenges',
    },
    {
      id: 'configure_notifications',
      label: 'Send a notification',
      description: 'Tell users when they earn something.',
      completed: (notifRow?.count || 0) > 0,
      href: '/dashboard/system',
    },
    {
      id: 'configure_smtp',
      label: 'Set up email',
      description: 'Add mail server details so the platform can send email.',
      completed: hasSmtpConfig,
      href: '/admin/settings',
    },
    {
      id: 'configure_integrations',
      label: 'Connect another service',
      description: 'Send updates to your systems with webhooks, or to Discord.',
      completed: (webhookRow?.count || 0) > 0 || (integRow?.count || 0) > 0,
      href: '/dashboard/integrations',
    },
  ];

  const completedCount = steps.filter((s) => s.completed).length;
  const progressPercentage = Math.round((completedCount / steps.length) * 100);

  return {
    projectId,
    totalSteps: steps.length,
    completedCount,
    progressPercentage,
    steps,
  };
}

export async function projectOnboardingRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/onboarding',
    async (request, reply) => {
      const { projectId } = request.params;
      const authResult = await requireProjectAccess(request, reply, projectId);
      if (!authResult) return;

      return reply.send(await getSetupProgress(projectId));
    }
  );
}
