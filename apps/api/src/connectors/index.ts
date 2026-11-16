import crypto from 'crypto';
import { connectors, db, endUsers, featuresFor, organizations, policyFor, projects } from '@gami/database';
import { decryptSecret, encryptSecret } from '@gami/webhooks';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../audit-logs/index.js';
import { requireProjectAccess } from '../authorization/index.js';
import { featureDisabledBody } from '../authorization/features.js';
import { checkPolicyRateLimit, checkRateLimit } from '../middleware/rate-limiter.js';
import { ingestEvents } from '../services/event-ingestion.js';
import { CONNECTOR_TYPES, mapConnectorPayload, verifyConnectorRequest, type ConnectorSettings, type ConnectorType } from './mappers.js';

const settingsSchema = z
  .object({
    userMetadataKey: z.string().min(1).max(64).optional(),
    includeAnonymous: z.boolean().optional(),
    allowedEvents: z.array(z.string().min(1).max(128)).max(200).optional(),
  })
  .strict();

const createSchema = z.object({
  type: z.enum(CONNECTOR_TYPES as [ConnectorType, ...ConnectorType[]]),
  name: z.string().min(1).max(128),
  /** Stripe and GitHub give you a signing secret; paste it here. Segment and RudderStack get one made for them. */
  secret: z.string().min(8).max(256).optional(),
  settings: settingsSchema.default({}),
});

const shape = (row: typeof connectors.$inferSelect) => {
  const rest: Partial<typeof row> = { ...row };
  delete rest.secretEncrypted;
  return { ...rest, path: `/v1/connectors/${row.id}` };
};

type Access = NonNullable<Awaited<ReturnType<typeof requireProjectAccess>>>;

/** Connectors hold shared secrets, so every change to one is recorded. */
const audit = (access: Access, projectId: string, action: string, connector: { id: string; type: string; name: string }, metadata: Record<string, unknown> = {}) =>
  createAuditLog(db, {
    organizationId: access.project.organizationId,
    projectId,
    actorType: 'user',
    actorId: access.membership.userId,
    action,
    severity: action === 'connector.deleted' || action === 'connector.secret_rotated' ? 'warning' : 'info',
    resourceType: 'connector',
    resourceId: connector.id,
    metadata: { type: connector.type, name: connector.name, ...metadata },
  });

export async function connectorRoutes(fastify: FastifyInstance) {
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/connectors', async (request, reply) => {
    const { projectId } = request.params;
    if (!(await requireProjectAccess(request, reply, projectId))) return;
    const rows = await db.select().from(connectors).where(eq(connectors.projectId, projectId)).orderBy(connectors.createdAt);
    return reply.send({ data: rows.map(shape) });
  });

  fastify.post<{ Params: { projectId: string } }>('/api/projects/:projectId/connectors', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;
    const parsed = createSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Invalid connector' });
    const signs = parsed.data.type === 'stripe' || parsed.data.type === 'github';
    if (signs && !parsed.data.secret) {
      return reply.status(400).send({ error: 'Bad Request', message: `Paste the signing secret ${parsed.data.type === 'stripe' ? 'Stripe shows for the endpoint (whsec_...)' : 'you set on the GitHub webhook'}` });
    }
    const secret = parsed.data.secret ?? `gcs_${crypto.randomBytes(24).toString('hex')}`;
    const [created] = await db
      .insert(connectors)
      .values({ id: `con_${crypto.randomUUID()}`, projectId, type: parsed.data.type, name: parsed.data.name, secretEncrypted: encryptSecret(secret), settings: parsed.data.settings })
      .returning();
    await audit(access, projectId, 'connector.created', created!);
    // The secret is shown once. Afterwards only a new one can be made.
    return reply.status(201).send({ ...shape(created!), secret: signs ? undefined : secret });
  });

  fastify.patch<{ Params: { projectId: string; connectorId: string } }>('/api/projects/:projectId/connectors/:connectorId', async (request, reply) => {
    const { projectId, connectorId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;
    const parsed = z.object({ name: z.string().min(1).max(128), enabled: z.boolean(), settings: settingsSchema, secret: z.string().min(8).max(256) }).partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'Bad Request', message: parsed.error.issues[0]?.message ?? 'Invalid connector' });
    const { secret, ...rest } = parsed.data;
    const [updated] = await db
      .update(connectors)
      .set({ ...rest, ...(secret ? { secretEncrypted: encryptSecret(secret) } : {}), updatedAt: new Date() })
      .where(and(eq(connectors.id, connectorId), eq(connectors.projectId, projectId)))
      .returning();
    if (!updated) return reply.status(404).send({ error: 'Not Found', message: 'Connector not found' });
    await audit(access, projectId, secret ? 'connector.secret_rotated' : 'connector.updated', updated, { changed: Object.keys(rest), secretReplaced: Boolean(secret) });
    return reply.send(shape(updated));
  });

  // Makes a new shared secret for Segment or RudderStack. The old one stops working at once.
  fastify.post<{ Params: { projectId: string; connectorId: string } }>('/api/projects/:projectId/connectors/:connectorId/rotate', async (request, reply) => {
    const { projectId, connectorId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;
    const [row] = await db.select().from(connectors).where(and(eq(connectors.id, connectorId), eq(connectors.projectId, projectId)));
    if (!row) return reply.status(404).send({ error: 'Not Found', message: 'Connector not found' });
    if (row.type === 'stripe' || row.type === 'github') return reply.status(400).send({ error: 'Bad Request', message: 'Make a new secret in that service, then paste it here' });
    const secret = `gcs_${crypto.randomBytes(24).toString('hex')}`;
    await db.update(connectors).set({ secretEncrypted: encryptSecret(secret), updatedAt: new Date() }).where(eq(connectors.id, row.id));
    await audit(access, projectId, 'connector.secret_rotated', row);
    return reply.send({ secret });
  });

  fastify.delete<{ Params: { projectId: string; connectorId: string } }>('/api/projects/:projectId/connectors/:connectorId', async (request, reply) => {
    const { projectId, connectorId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;
    const [gone] = await db
      .delete(connectors)
      .where(and(eq(connectors.id, connectorId), eq(connectors.projectId, projectId)))
      .returning({ id: connectors.id, type: connectors.type, name: connectors.name });
    if (!gone) return reply.status(404).send({ error: 'Not Found', message: 'Connector not found' });
    await audit(access, projectId, 'connector.deleted', gone);
    return reply.status(204).send();
  });

  // The receiving end. It lives in its own scope so it can read the exact bytes that were signed.
  await fastify.register(async (scope) => {
    scope.removeAllContentTypeParsers();
    scope.addContentTypeParser('*', { parseAs: 'string', bodyLimit: 1024 * 1024 }, (_request, body, done) => done(null, body));

    scope.post<{ Params: { connectorId: string } }>('/v1/connectors/:connectorId', async (request, reply) => {
      const [connector] = await db.select().from(connectors).where(eq(connectors.id, request.params.connectorId));
      if (!connector || !connector.enabled) return reply.status(404).send({ code: 'NOT_FOUND', message: 'Unknown connector' });

      // The same gate as POST /v1/events: an active organization, the feature switched on, and both event limits.
      const [owner] = await db
        .select({ organizationId: organizations.id, status: organizations.status })
        .from(projects)
        .innerJoin(organizations, eq(organizations.id, projects.organizationId))
        .where(eq(projects.id, connector.projectId));
      if (!owner || owner.status === 'suspended') return reply.status(403).send({ code: 'FORBIDDEN', message: 'Organization account is suspended' });
      if (!(await featuresFor(owner.organizationId)).connectors) return reply.status(403).send(featureDisabledBody('connectors'));
      const policy = await policyFor(owner.organizationId);
      if (!(await checkPolicyRateLimit(request, reply, connector.projectId, policy.eventsPerMinute))) return reply;
      if (!(await checkRateLimit(request, reply, connector.projectId))) return reply;

      const raw = typeof request.body === 'string' ? request.body : '';
      let secret: string;
      try {
        secret = decryptSecret(connector.secretEncrypted);
      } catch {
        return reply.status(500).send({ code: 'SECRET_UNREADABLE', message: 'The connector secret could not be read. Save it again.' });
      }
      if (!verifyConnectorRequest(connector.type, secret, raw, request.headers)) {
        await db.update(connectors).set({ lastError: 'A request had a missing or wrong signature' }).where(eq(connectors.id, connector.id));
        return reply.status(401).send({ code: 'BAD_SIGNATURE', message: 'The request signature does not match' });
      }

      let body: unknown;
      try {
        const contentType = String(request.headers['content-type'] ?? '');
        // GitHub can send form posts with the JSON in a `payload` field.
        body = contentType.includes('application/x-www-form-urlencoded') ? JSON.parse(new URLSearchParams(raw).get('payload') ?? '{}') : JSON.parse(raw || '{}');
      } catch {
        return reply.status(400).send({ code: 'BAD_JSON', message: 'The body is not valid JSON' });
      }

      const { items, skipped } = mapConnectorPayload(connector.type, body, request.headers, connector.settings as ConnectorSettings);
      // Profiles first, then every event of the batch in one transaction.
      for (const item of items) {
        if (item.kind === 'identify') await identify(connector.projectId, item.userId, item.name, item.email, item.traits);
      }
      const results = await ingestEvents(
        items.flatMap((item) =>
          item.kind === 'identify'
            ? []
            : [{ projectId: connector.projectId, eventType: item.type, externalUserId: item.userId, payload: item.payload, occurredAt: item.occurredAt, idempotencyKey: item.idempotencyKey }]
        )
      );
      const failed = results.find((result) => result.outcome === 'failed');
      if (failed && failed.outcome === 'failed') throw failed.error;
      const accepted = results.filter((result) => result.outcome === 'accepted' && !result.duplicate).length;
      const duplicates = results.filter((result) => result.outcome === 'accepted' && result.duplicate).length;

      await db
        .update(connectors)
        .set({ receivedCount: sql`${connectors.receivedCount} + ${items.length}`, lastReceivedAt: new Date(), lastError: null })
        .where(eq(connectors.id, connector.id));
      return reply.status(202).send({ accepted, duplicates, skipped, identified: items.filter((item) => item.kind === 'identify').length });
    });
  });
}

/** An `identify` call fills in the person's name and email and keeps their traits in metadata. */
async function identify(projectId: string, externalId: string, name: string | null, email: string | null, traits: Record<string, unknown>) {
  const clean = Object.fromEntries(Object.entries(traits).filter(([key, value]) => key.length <= 64 && (value === null || ['string', 'number', 'boolean'].includes(typeof value))).slice(0, 50));
  await db
    .insert(endUsers)
    .values({ id: `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`, projectId, externalId, name, email, metadata: clean })
    .onConflictDoUpdate({
      target: [endUsers.projectId, endUsers.externalId],
      set: {
        name: sql`COALESCE(${name}, ${endUsers.name})`,
        email: sql`COALESCE(${email}, ${endUsers.email})`,
        metadata: sql`COALESCE(${endUsers.metadata}, '{}'::jsonb) || ${JSON.stringify(clean)}::jsonb`,
        updatedAt: new Date(),
      },
    });
}
