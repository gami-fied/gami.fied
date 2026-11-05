import {
  achievements,
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
  userXpBalances,
  webhookEndpoints,
  xpLedger,
} from '@gami/database';
import { eq, inArray } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createAuditLog } from '../audit-logs/index.js';
import { requireOrgRole } from '../authorization/index.js';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Postgres limits the parameters in one statement, so large imports go in chunks. */
async function insertChunks<T extends PgTable>(
  tx: Transaction,
  table: T,
  rows: T['$inferInsert'][]
): Promise<void> {
  const CHUNK_SIZE = 500;
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    await tx.insert(table).values(rows.slice(i, i + CHUNK_SIZE));
  }
}

/** The fields of an organization export that validation and import read. */
interface OrgImportPackage {
  format?: string;
  version?: number;
  manifest?: unknown;
  projects?: { id: string; name: string; slug: string }[];
  users?: {
    id: string;
    projectId: string;
    externalId: string;
    name?: string | null;
    email?: string | null;
  }[];
  events?: {
    id: string;
    projectId: string;
    userId?: string | null;
    type: string;
    payload?: Record<string, unknown>;
    occurredAt: string;
  }[];
  xpLedger?: {
    projectId: string;
    userId: string;
    eventId?: string | null;
    amount: number;
    reason: string;
    metadata?: Record<string, unknown> | null;
    createdAt?: string;
  }[];
  levels?: {
    projectId: string;
    level: number;
    name: string;
    requiredXp?: number;
    minXp?: number;
  }[];
  userAchievements?: {
    projectId: string;
    userId: string;
    achievementId: string;
    awardedAt?: string;
  }[];
  userChallengeProgress?: {
    projectId: string;
    userId: string;
    challengeId: string;
    progress: number;
    completed: boolean;
    completedAt?: string | null;
  }[];
  achievements?: {
    id: string;
    projectId: string;
    key: string;
    name: string;
    description?: string | null;
    iconUrl?: string | null;
    enabled?: boolean;
  }[];
  challenges?: {
    id: string;
    projectId: string;
    key: string;
    name: string;
    trigger: string;
    target?: number;
    description?: string | null;
    rewards?: unknown[];
    enabled?: boolean;
  }[];
  rules?: {
    projectId: string;
    name: string;
    trigger: string;
    conditions?: unknown;
    actions?: unknown[];
    enabled?: boolean;
  }[];
}

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

    const [
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
    ] = await Promise.all([
      db.select().from(endUsers).where(inArray(endUsers.projectId, projectIds)),
      db.select().from(events).where(inArray(events.projectId, projectIds)),
      db.select().from(xpLedger).where(inArray(xpLedger.projectId, projectIds)),
      db.select().from(levels).where(inArray(levels.projectId, projectIds)),
      db.select().from(achievements).where(inArray(achievements.projectId, projectIds)),
      db.select().from(userAchievements).where(inArray(userAchievements.projectId, projectIds)),
      db.select().from(challenges).where(inArray(challenges.projectId, projectIds)),
      db
        .select()
        .from(userChallengeProgress)
        .where(inArray(userChallengeProgress.projectId, projectIds)),
      db.select().from(rules).where(inArray(rules.projectId, projectIds)),
      db.select().from(notifications).where(inArray(notifications.projectId, projectIds)),
      db.select().from(webhookEndpoints).where(inArray(webhookEndpoints.projectId, projectIds)),
      db.select().from(integrations).where(inArray(integrations.projectId, projectIds)),
    ]);

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
      type: i.provider,
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
      events: orgEvents.map((e) => ({ id: e.id, projectId: e.projectId, userId: e.userId, type: e.type, payload: e.payload, occurredAt: e.occurredAt })),
      xpLedger: orgXp.map((x) => ({ id: x.id, projectId: x.projectId, userId: x.userId, eventId: x.eventId, amount: x.amount, reason: x.reason, metadata: x.metadata, createdAt: x.createdAt })),
      levels: orgLevels.map((l) => ({ id: l.id, projectId: l.projectId, level: l.level, name: l.name, requiredXp: l.requiredXp })),
      achievements: orgAchievements.map((a) => ({ id: a.id, projectId: a.projectId, key: a.key, name: a.name, description: a.description, iconUrl: a.iconUrl, enabled: a.enabled })),
      userAchievements: orgUserAchievements.map((ua) => ({ id: ua.id, projectId: ua.projectId, userId: ua.userId, achievementId: ua.achievementId, awardedAt: ua.awardedAt })),
      challenges: orgChallenges.map((c) => ({ id: c.id, projectId: c.projectId, key: c.key, name: c.name, description: c.description, trigger: c.trigger, target: c.target, rewards: c.rewards, enabled: c.enabled })),
      userChallengeProgress: orgChallengeProgress.map((ucp) => ({ id: ucp.id, projectId: ucp.projectId, userId: ucp.userId, challengeId: ucp.challengeId, progress: ucp.progress, completed: ucp.completed, completedAt: ucp.completedAt })),
      rules: orgRules.map((r) => ({ id: r.id, projectId: r.projectId, name: r.name, trigger: r.trigger, conditions: r.conditions, actions: r.actions, enabled: r.enabled })),
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

  const validateHandler = async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const payload = request.body as OrgImportPackage | null;
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

  const importHandler = async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const payload = request.body as OrgImportPackage | null;

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
    const eventIdMap = new Map<string, string>();
    const counts: Record<string, number> = {};

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
              iconUrl: a.iconUrl ?? null,
              enabled: a.enabled ?? true,
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
              description: c.description ?? null,
              rewards: c.rewards ?? [],
              enabled: c.enabled ?? true,
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
              conditions: r.conditions ?? null,
              actions: r.actions ?? [],
              enabled: r.enabled ?? true,
            });
          }
        }
      }

      // 6. Remap Levels
      await insertChunks(
        tx,
        levels,
        (payload.levels ?? []).flatMap((l, idx) => {
          const projectId = projectIdMap.get(l.projectId);
          return projectId
            ? [{
                id: `lvl_imp_${timestamp}_${idx}`,
                projectId,
                level: l.level,
                name: l.name,
                requiredXp: l.requiredXp ?? l.minXp ?? 0,
              }]
            : [];
        })
      );
      counts.levels = payload.levels?.length ?? 0;

      // 7. Remap Events. Outbox rows are not created, so history is not processed a second time.
      const importedEvents = (payload.events ?? []).flatMap((e, idx) => {
        const projectId = projectIdMap.get(e.projectId);
        if (!projectId) return [];
        const id = `evt_imp_${timestamp}_${idx}`;
        eventIdMap.set(e.id, id);
        return [{
          id,
          projectId,
          userId: e.userId ? (userIdMap.get(e.userId) ?? null) : null,
          type: e.type,
          payload: e.payload ?? {},
          occurredAt: new Date(e.occurredAt),
        }];
      });
      await insertChunks(tx, events, importedEvents);
      counts.events = importedEvents.length;

      // 8. Remap XP, and rebuild balances from the ledger so the two always agree
      const totals = new Map<string, { projectId: string; userId: string; totalXp: number }>();
      const importedXp = (payload.xpLedger ?? []).flatMap((x, idx) => {
        const projectId = projectIdMap.get(x.projectId);
        const userId = userIdMap.get(x.userId);
        if (!projectId || !userId) return [];
        const total = totals.get(userId) ?? { projectId, userId, totalXp: 0 };
        total.totalXp += x.amount;
        totals.set(userId, total);
        return [{
          id: `xpl_imp_${timestamp}_${idx}`,
          projectId,
          userId,
          eventId: x.eventId ? (eventIdMap.get(x.eventId) ?? null) : null,
          amount: x.amount,
          reason: x.reason,
          metadata: x.metadata ?? {},
          createdAt: x.createdAt ? new Date(x.createdAt) : new Date(),
        }];
      });
      await insertChunks(tx, xpLedger, importedXp);
      await insertChunks(
        tx,
        userXpBalances,
        [...totals.values()].map((total, idx) => ({ id: `xpb_imp_${timestamp}_${idx}`, ...total }))
      );
      counts.xpLedger = importedXp.length;

      // 9. Remap awarded badges
      const importedBadges = (payload.userAchievements ?? []).flatMap((ua, idx) => {
        const projectId = projectIdMap.get(ua.projectId);
        const userId = userIdMap.get(ua.userId);
        const achievementId = achievementIdMap.get(ua.achievementId);
        return projectId && userId && achievementId
          ? [{
              id: `uach_imp_${timestamp}_${idx}`,
              projectId,
              userId,
              achievementId,
              awardedAt: ua.awardedAt ? new Date(ua.awardedAt) : new Date(),
            }]
          : [];
      });
      await insertChunks(tx, userAchievements, importedBadges);
      counts.userAchievements = importedBadges.length;

      // 10. Remap challenge progress
      const importedProgress = (payload.userChallengeProgress ?? []).flatMap((ucp, idx) => {
        const projectId = projectIdMap.get(ucp.projectId);
        const userId = userIdMap.get(ucp.userId);
        const challengeId = challengeIdMap.get(ucp.challengeId);
        return projectId && userId && challengeId
          ? [{
              id: `ucp_imp_${timestamp}_${idx}`,
              projectId,
              userId,
              challengeId,
              progress: ucp.progress,
              completed: ucp.completed,
              completedAt: ucp.completedAt ? new Date(ucp.completedAt) : null,
            }]
          : [];
      });
      await insertChunks(tx, userChallengeProgress, importedProgress);
      counts.userChallengeProgress = importedProgress.length;
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
        ...counts,
      },
    });
  };

  // Register /api/, /v1/, and /api/v1/ route aliases
  fastify.post('/api/organizations/:organizationId/export', exportHandler);
  fastify.post('/v1/organizations/:organizationId/export', exportHandler);
  fastify.post('/api/v1/organizations/:organizationId/export', exportHandler);

  // Exports are far larger than the API's normal 64 KB body limit.
  const largeBody = { bodyLimit: Number(process.env.ORG_IMPORT_MAX_BYTES) || 100 * 1024 * 1024 };

  fastify.post('/api/organizations/:organizationId/import/validate', largeBody, validateHandler);
  fastify.post('/v1/organizations/:organizationId/import/validate', largeBody, validateHandler);
  fastify.post('/api/v1/organizations/:organizationId/import/validate', largeBody, validateHandler);

  fastify.post('/api/organizations/:organizationId/import', largeBody, importHandler);
  fastify.post('/v1/organizations/:organizationId/import', largeBody, importHandler);
  fastify.post('/api/v1/organizations/:organizationId/import', largeBody, importHandler);
}
