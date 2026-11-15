import { product } from '@gami/config';
import { db, integrations, isUniqueViolation, organizations, policyFor, projects, webhookEndpoints } from '@gami/database';
import { count, eq, inArray } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createAuditLog } from '../audit-logs/index.js';
import { requireOrgRole } from '../authorization/index.js';
import {
  dropInvalidDesign,
  EXPORT_FORMAT,
  EXPORT_VERSION,
  readOrganizationTables,
  readPackage,
  writeOrganizationTables,
  type TableRows,
} from './data-package.js';

interface Refusal {
  status: number;
  code: string;
  message: string;
}

const refuse = (reply: FastifyReply, refusal: Refusal) =>
  reply.status(refusal.status).send({
    error: { code: refusal.code, message: refusal.message },
    message: refusal.message,
    code: refusal.code,
  });

const INVALID_PACKAGE: Refusal = {
  status: 400,
  code: 'BAD_REQUEST',
  message: `Invalid or incompatible organization export. Expected format "${EXPORT_FORMAT}", version 1 or ${EXPORT_VERSION}.`,
};

/** The organization's own limits, which an import must respect like any other way of adding projects. */
async function checkImportAllowed(organizationId: string, newProjects: number): Promise<Refusal | null> {
  const [org] = await db.select({ demoExpiresAt: organizations.demoExpiresAt }).from(organizations).where(eq(organizations.id, organizationId));
  if (!org) return { status: 404, code: 'NOT_FOUND', message: 'Organization not found' };
  if (org.demoExpiresAt) {
    return { status: 403, code: 'DEMO_IMPORT_DISABLED', message: 'A demo cannot import data. Install Gami.Fied to bring your own.' };
  }

  const { maxProjects } = await policyFor(organizationId);
  if (maxProjects !== null) {
    const [existing] = await db.select({ total: count() }).from(projects).where(eq(projects.organizationId, organizationId));
    if ((existing?.total ?? 0) + newProjects > maxProjects) {
      return {
        status: 403,
        code: 'PROJECT_LIMIT',
        message: `This organization can have at most ${maxProjects} project${maxProjects === 1 ? '' : 's'}, and this file would add ${newProjects}. Ask the platform administrator for more.`,
      };
    }
  }
  return null;
}

const size = (tables: TableRows, name: string) => tables[name]?.length ?? 0;

export async function organizationDataRoutes(fastify: FastifyInstance) {
  const exportHandler = async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const [org] = await db.select().from(organizations).where(eq(organizations.id, organizationId));
    if (!org) {
      return refuse(reply, { status: 404, code: 'NOT_FOUND', message: 'Organization not found' });
    }

    const tables = await readOrganizationTables(organizationId);
    const projectIds = (tables['projects'] ?? []).map((project) => String(project['id']));

    // Webhooks and integrations are listed so they can be set up again, never with their secrets.
    const [orgWebhooks, orgIntegrations] =
      projectIds.length === 0
        ? [[], []]
        : await Promise.all([
            db.select().from(webhookEndpoints).where(inArray(webhookEndpoints.projectId, projectIds)),
            db.select().from(integrations).where(inArray(integrations.projectId, projectIds)),
          ]);

    const exportPackage = {
      format: EXPORT_FORMAT,
      version: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      manifest: {
        organizationId: org.id,
        organizationName: org.name,
        appVersion: product.version,
        projectCount: size(tables, 'projects'),
        userCount: size(tables, 'endUsers'),
        eventCount: size(tables, 'events'),
        ruleCount: size(tables, 'rules'),
        achievementCount: size(tables, 'achievements'),
        challengeCount: size(tables, 'challenges'),
        rows: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
      },
      organization: {
        name: org.name,
        slug: org.slug,
      },
      tables,
      webhooks: orgWebhooks.map((w) => ({
        id: w.id,
        projectId: w.projectId,
        name: w.name,
        url: w.url,
        active: w.active,
        description: w.description,
        secretConfigured: true,
        createdAt: w.createdAt,
      })),
      integrations: orgIntegrations.map((i) => ({
        id: i.id,
        projectId: i.projectId,
        type: i.provider,
        name: i.name,
        enabled: i.enabled,
        credentialsConfigured: true,
        createdAt: i.createdAt,
      })),
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

    const parsed = readPackage(request.body);
    if (!parsed) return refuse(reply, INVALID_PACKAGE);

    const { tables } = parsed;
    const warnings = dropInvalidDesign(tables);
    const refusal = await checkImportAllowed(organizationId, size(tables, 'projects'));

    return reply.send({
      valid: !refusal,
      ...(refusal ? { errors: [refusal.message] } : {}),
      manifest: (request.body as { manifest?: unknown }).manifest || {},
      targetOrganizationId: organizationId,
      remappingPlan: {
        projectsToCreate: size(tables, 'projects'),
        usersToImport: size(tables, 'endUsers'),
        eventsToImport: size(tables, 'events'),
        achievementsToImport: size(tables, 'achievements'),
        challengesToImport: size(tables, 'challenges'),
        rulesToImport: size(tables, 'rules'),
        rows: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
      },
      warnings,
    });
  };

  const importHandler = async (request: FastifyRequest<{ Params: { organizationId: string } }>, reply: FastifyReply) => {
    const { organizationId } = request.params;
    const authResult = await requireOrgRole(request, reply, organizationId, ['owner', 'admin']);
    if (!authResult) return;

    const parsed = readPackage(request.body);
    if (!parsed) return refuse(reply, INVALID_PACKAGE);

    const { tables } = parsed;
    const refusal = await checkImportAllowed(organizationId, size(tables, 'projects'));
    if (refusal) return refuse(reply, refusal);

    const warnings = dropInvalidDesign(tables);

    let result;
    try {
      result = await db.transaction((tx) => writeOrganizationTables(tx, organizationId, tables));
    } catch (err) {
      // The file disagrees with itself, such as two players with one ID. Nothing was written.
      const code = (err as { cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
      if (isUniqueViolation(err) || (typeof code === 'string' && code.startsWith('23'))) {
        return refuse(reply, {
          status: 422,
          code: 'IMPORT_INVALID',
          message: 'The file could not be imported because its rows do not fit together. Nothing was changed.',
        });
      }
      throw err;
    }

    await createAuditLog(db, {
      organizationId,
      actorType: 'user',
      actorId: authResult.user.id,
      action: 'organization.imported',
      severity: 'warning',
      resourceType: 'organization',
      resourceId: organizationId,
      metadata: {
        formatVersion: parsed.version,
        importedProjectsCount: result.projectIds.length,
        importedUsersCount: result.counts['endUsers'] ?? 0,
        skipped: result.skipped,
        leftOut: warnings.length,
      },
    });

    return reply.send({
      success: true,
      message: 'Organization data imported',
      projectIds: result.projectIds,
      importedCount: {
        ...result.counts,
        users: result.counts['endUsers'] ?? 0,
      },
      skipped: result.skipped,
      warnings,
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
