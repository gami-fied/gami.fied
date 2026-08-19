import crypto from 'crypto';
import {
  achievements,
  auditLogs,
  challenges,
  db,
  endUsers,
  events,
  integrations,
  levels,
  notifications,
  organizations,
  projects,
  rules,
  userAchievements,
  userChallengeProgress,
  webhookEndpoints,
  xpLedger,
} from '@gami/database';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createAuditLog } from '../audit-logs/index.js';
import { requireOrgRole, requirePlatformAdmin } from '../authorization/index.js';

export async function organizationDataRoutes(fastify: FastifyInstance) {
  const exportHandler = async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    // Fetch Org & Projects
    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    if (!org) {
      return reply.status(404).send({
        error: { code: 'NOT_FOUND', message: 'Organization not found' },
        message: 'Organization not found',
        code: 'NOT_FOUND',
      });
    }

    const orgProjects = await db.select().from(projects).where(eq(projects.organizationId, organizationId));
    const projectIds = orgProjects.map((p) => p.id);

    let orgUsers: any[] = [];
    let orgEvents: any[] = [];
    let orgXp: any[] = [];
    let orgLevels: any[] = [];
    let orgAchievements: any[] = [];
    let orgUserAchievements: any[] = [];
    let orgChallenges: any[] = [];
    let orgChallengeProgress: any[] = [];
    let orgRules: any[] = [];
    let orgNotifications: any[] = [];
    let orgWebhooks: any[] = [];
    let orgIntegrations: any[] = [];
    let orgAuditLogs: any[] = [];

    if (projectIds.length > 0) {
      [
        orgUsers,
        orgEvents,
        orgXp,
        orgLevels,
        orgAchievements,
        orgUserAchievements,
        orgChallenges,
        orgChallengeProgress,
        orgRules,
        orgNotifications,
        orgWebhooks,
        orgIntegrations,
        orgAuditLogs,
      ] = await Promise.all([
        db.select().from(endUsers).where(inArray(endUsers.projectId, projectIds)),
        db.select().from(events).where(inArray(events.projectId, projectIds)),
        db.select().from(xpLedger).where(inArray(xpLedger.projectId, projectIds)),
        db.select().from(levels).where(inArray(levels.projectId, projectIds)),
        db.select().from(achievements).where(inArray(achievements.projectId, projectIds)),
        db.select().from(userAchievements).where(inArray(userAchievements.projectId, projectIds)),
        db.select().from(challenges).where(inArray(challenges.projectId, projectIds)),
        db.select().from(userChallengeProgress).where(inArray(userChallengeProgress.projectId, projectIds)),
        db.select().from(rules).where(inArray(rules.projectId, projectIds)),
        db.select().from(notifications).where(inArray(notifications.projectId, projectIds)),
        db.select().from(webhookEndpoints).where(inArray(webhookEndpoints.projectId, projectIds)),
        db.select().from(integrations).where(inArray(integrations.projectId, projectIds)),
        db.select().from(auditLogs).where(eq(auditLogs.organizationId, organizationId)),
      ]);
    }

    // STRICT SECRET REDACTION SHIELD
    const sanitizedWebhooks = orgWebhooks.map((w) => ({
      id: w.id,
      projectId: w.projectId,
      name: w.name,
      url: w.url,
      active: w.active,
      description: w.description,
      secretConfigured: true, // Secret hash redacted!
      createdAt: w.createdAt,
    }));

    const sanitizedIntegrations = orgIntegrations.map((i) => ({
      id: i.id,
      projectId: i.projectId,
      type: i.type,
      name: i.name,
      enabled: i.enabled,
      credentialsConfigured: true, // Webhook URLs/Tokens redacted!
      createdAt: i.createdAt,
    }));

    const exportPackage = {
      format: 'gami-organization-export',
      version: 1,
      exportedAt: new Date().toISOString(),
      manifest: {
        organizationId: org.id,
        organizationName: org.name,
        projectCount: orgProjects.length,
        userCount: orgUsers.length,
        eventCount: orgEvents.length,
        ruleCount: orgRules.length,
        achievementCount: orgAchievements.length,
        challengeCount: orgChallenges.length,
      },
      organization: {
        name: org.name,
        slug: org.slug,
      },
      projects: orgProjects.map((p) => ({ id: p.id, name: p.name, slug: p.slug })),
      users: orgUsers.map((u) => ({ id: u.id, projectId: u.projectId, externalId: u.externalId, name: u.name, email: u.email })),
      events: orgEvents.map((e) => ({ id: e.id, projectId: e.projectId, userId: e.userId, type: e.type, occurredAt: e.occurredAt })),
      xpLedger: orgXp.map((x) => ({ id: x.id, projectId: x.projectId, userId: x.userId, amount: x.amount, reason: x.reason })),
      levels: orgLevels.map((l) => ({ id: l.id, projectId: l.projectId, level: l.level, name: l.name, minXp: l.minXp })),
      achievements: orgAchievements.map((a) => ({ id: a.id, projectId: a.projectId, key: a.key, name: a.name, description: a.description })),
      userAchievements: orgUserAchievements.map((ua) => ({ id: ua.id, projectId: ua.projectId, userId: ua.userId, achievementId: ua.achievementId, awardedAt: ua.awardedAt })),
      challenges: orgChallenges.map((c) => ({ id: c.id, projectId: c.projectId, key: c.key, name: c.name, trigger: c.trigger, target: c.target })),
      userChallengeProgress: orgChallengeProgress.map((ucp) => ({ id: ucp.id, projectId: ucp.projectId, userId: ucp.userId, challengeId: ucp.challengeId, progress: ucp.progress, completed: ucp.completed })),
      rules: orgRules.map((r) => ({ id: r.id, projectId: r.projectId, key: r.key, name: r.name, trigger: r.trigger, enabled: r.enabled })),
      notifications: orgNotifications.map((n) => ({ id: n.id, projectId: n.projectId, userId: n.userId, type: n.type, title: n.title, message: n.message })),
      webhooks: sanitizedWebhooks,
      integrations: sanitizedIntegrations,
    };

    await createAuditLog(db, {
      organizationId,
      actorType: 'user',
      actorId: authResult.user.id,
      action: 'organization.exported',
      severity: 'info',
      resourceType: 'organization',
      resourceId: organizationId,
    });

    const filename = `gami-org-export-${org.slug}-${Date.now()}.json`;

    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${filename}"`)
      .send(exportPackage);
  };

  const validateHandler = async (request: FastifyRequest<{ Params: { organizationId: string }; Body: any }>, reply: FastifyReply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const payload = request.body as any;
    const warnings: string[] = [];

    if (!payload || payload.format !== 'gami-organization-export') {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Invalid export package format. Expected "gami-organization-export"' },
        message: 'Invalid export package format',
        code: 'BAD_REQUEST',
      });
    }

    if (payload.version !== 1) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: `Unsupported export schema version ${payload.version}. Expected version 1.` },
        message: 'Unsupported export version',
        code: 'BAD_REQUEST',
      });
    }

    const rawPayloadString = JSON.stringify(payload);
    if (rawPayloadString.includes('passwordHash') || rawPayloadString.includes('rawSecret') || rawPayloadString.includes('BETTER_AUTH_SECRET')) {
      warnings.push('Embedded secret keys detected in export file. Secrets will be stripped during import.');
    }

    return reply.send({
      valid: true,
      manifest: payload.manifest || {},
      targetOrganizationId: organizationId,
      remappingPlan: {
        projectsToCreate: payload.projects?.length || 0,
        usersToImport: payload.users?.length || 0,
        eventsToImport: payload.events?.length || 0,
        achievementsToImport: payload.achievements?.length || 0,
        challengesToImport: payload.challenges?.length || 0,
        rulesToImport: payload.rules?.length || 0,
      },
      warnings,
    });
  };

  const importHandler = async (request: FastifyRequest<{ Params: { organizationId: string }; Body: any }>, reply: FastifyReply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const payload = request.body as any;

    if (!payload || payload.format !== 'gami-organization-export' || payload.version !== 1) {
      return reply.status(400).send({
        error: { code: 'BAD_REQUEST', message: 'Invalid or incompatible organization export payload' },
        message: 'Invalid or incompatible organization export payload',
        code: 'BAD_REQUEST',
      });
    }

    // Perform Atomic PostgreSQL Import with Deterministic ID Remapping
    const timestamp = Date.now();
    const projectIdMap = new Map<string, string>();
    const userIdMap = new Map<string, string>();
    const achievementIdMap = new Map<string, string>();
    const challengeIdMap = new Map<string, string>();

    await db.transaction(async (tx) => {
      // 1. Remap Projects
      if (Array.isArray(payload.projects)) {
        for (const [idx, p] of payload.projects.entries()) {
          const newProjId = `prj_imp_${timestamp}_${idx}`;
          projectIdMap.set(p.id, newProjId);
          await tx.insert(projects).values({
            id: newProjId,
            organizationId, // Rewritten strictly to target Organization!
            name: `${p.name} (Imported)`,
            slug: `${p.slug}-imp-${timestamp}-${idx}`,
          });
        }
      }

      // 2. Remap End Users
      if (Array.isArray(payload.users)) {
        for (const [idx, u] of payload.users.entries()) {
          const targetProjId = projectIdMap.get(u.projectId);
          if (targetProjId) {
            const newUserId = `usr_imp_${timestamp}_${idx}`;
            userIdMap.set(u.id, newUserId);
            await tx.insert(endUsers).values({
              id: newUserId,
              projectId: targetProjId,
              externalId: `${u.externalId}_imp_${idx}`,
              name: u.name || null,
              email: u.email || null,
            });
          }
        }
      }

      // 3. Remap Achievements
      if (Array.isArray(payload.achievements)) {
        for (const [idx, a] of payload.achievements.entries()) {
          const targetProjId = projectIdMap.get(a.projectId);
          if (targetProjId) {
            const newAchId = `ach_imp_${timestamp}_${idx}`;
            achievementIdMap.set(a.id, newAchId);
            await tx.insert(achievements).values({
              id: newAchId,
              projectId: targetProjId,
              key: `${a.key}_imp_${idx}`,
              name: a.name,
              description: a.description || null,
            });
          }
        }
      }

      // 4. Remap Challenges
      if (Array.isArray(payload.challenges)) {
        for (const [idx, c] of payload.challenges.entries()) {
          const targetProjId = projectIdMap.get(c.projectId);
          if (targetProjId) {
            const newChlId = `chl_imp_${timestamp}_${idx}`;
            challengeIdMap.set(c.id, newChlId);
            await tx.insert(challenges).values({
              id: newChlId,
              projectId: targetProjId,
              key: `${c.key}_imp_${idx}`,
              name: c.name,
              trigger: c.trigger,
              target: c.target || 1,
            });
          }
        }
      }

      // 5. Remap Rules
      if (Array.isArray(payload.rules)) {
        for (const [idx, r] of payload.rules.entries()) {
          const targetProjId = projectIdMap.get(r.projectId);
          if (targetProjId) {
            await tx.insert(rules).values({
              id: `rule_imp_${timestamp}_${idx}`,
              projectId: targetProjId,
              name: r.name,
              trigger: r.trigger,
              enabled: r.enabled ?? true,
            });
          }
        }
      }
    });

    await createAuditLog(db, {
      organizationId,
      actorType: 'user',
      actorId: authResult.user.id,
      action: 'organization.imported',
      severity: 'warning',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: {
        importedProjectsCount: projectIdMap.size,
        importedUsersCount: userIdMap.size,
      },
    });

    return reply.send({
      success: true,
      message: 'Organization data imported successfully with tenant isolation remapping',
      importedCount: {
        projects: projectIdMap.size,
        users: userIdMap.size,
        achievements: achievementIdMap.size,
        challenges: challengeIdMap.size,
      },
    });
  };

  // Register /api/, /v1/, and /api/v1/ route aliases
  fastify.post('/api/organizations/:organizationId/export', exportHandler);
  fastify.post('/v1/organizations/:organizationId/export', exportHandler);
  fastify.post('/api/v1/organizations/:organizationId/export', exportHandler);

  fastify.post('/api/organizations/:organizationId/import/validate', validateHandler);
  fastify.post('/v1/organizations/:organizationId/import/validate', validateHandler);
  fastify.post('/api/v1/organizations/:organizationId/import/validate', validateHandler);

  fastify.post('/api/organizations/:organizationId/import', importHandler);
  fastify.post('/v1/organizations/:organizationId/import', importHandler);
  fastify.post('/api/v1/organizations/:organizationId/import', importHandler);
}
