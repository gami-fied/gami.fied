import crypto from 'crypto';
import {
  apiKeys,
  clearFeatureCache,
  db,
  featureSettings,
  invitation,
  member,
  organizationPolicies,
  organizations,
  policyFor,
  POLICY_FIELDS,
  projects,
  session,
  users,
} from '@gami/database';
import { and, count, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { isIP } from 'net';
import { z } from 'zod';
import { createAuditLog } from '../../audit-logs/index.js';
import { requirePlatformAdmin } from '../../authorization/index.js';
import { describeFeatures, planFeatureChange } from './plan.js';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function storedSettings(orgId?: string) {
  const rows = await db.select().from(featureSettings).where(orgId ? sql`${featureSettings.organizationId} IS NULL OR ${featureSettings.organizationId} = ${orgId}` : isNull(featureSettings.organizationId));
  return {
    instance: new Map(rows.filter((row) => row.organizationId === null).map((row) => [row.feature, row.enabled])),
    org: new Map(rows.filter((row) => row.organizationId !== null).map((row) => [row.feature, row.enabled])),
  };
}

async function writeInstance(tx: Tx, feature: string, enabled: boolean, actor: string) {
  await tx
    .insert(featureSettings)
    .values({ id: `fs_${crypto.randomUUID()}`, organizationId: null, feature, enabled, updatedBy: actor })
    .onConflictDoUpdate({ target: featureSettings.feature, targetWhere: sql`organization_id IS NULL`, set: { enabled, updatedBy: actor, updatedAt: new Date() } });
}

/** At organization level "on" means "as the instance has it", so turning on removes the override. */
async function writeOrg(tx: Tx, orgId: string, feature: string, enabled: boolean, actor: string) {
  if (enabled) {
    await tx.delete(featureSettings).where(and(eq(featureSettings.organizationId, orgId), eq(featureSettings.feature, feature)));
    return;
  }
  await tx
    .insert(featureSettings)
    .values({ id: `fs_${crypto.randomUUID()}`, organizationId: orgId, feature, enabled: false, updatedBy: actor })
    .onConflictDoUpdate({ target: [featureSettings.organizationId, featureSettings.feature], targetWhere: sql`organization_id IS NOT NULL`, set: { enabled: false, updatedBy: actor, updatedAt: new Date() } });
}

const changeSchema = z.object({
  enabled: z.boolean(),
  /** Without it, a change that also affects other features is refused with the list, so the screen can ask first. */
  confirmCascade: z.boolean().optional(),
  dryRun: z.boolean().optional(),
});

const domain = z.string().trim().toLowerCase().regex(/^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/, 'Use a domain such as example.com');
const cidr = z
  .string()
  .trim()
  .refine((value) => {
    const [base, bits] = value.split('/');
    const family = isIP(base ?? '');
    if (!family) return false;
    if (bits === undefined) return true;
    const n = Number(bits);
    return Number.isInteger(n) && n >= 0 && n <= (family === 4 ? 32 : 128);
  }, 'Use an address such as 203.0.113.7 or a range such as 203.0.113.0/24');

const policySchema = z
  .object({
    maxProjects: z.number().int().min(1).max(10_000).nullable(),
    maxMembers: z.number().int().min(1).max(100_000).nullable(),
    allowedEmailDomains: z.array(domain).max(50).nullable(),
    apiKeyMaxLifetimeDays: z.number().int().min(1).max(3650).nullable(),
    apiIpAllowlist: z.array(cidr).max(100).nullable(),
    requireAllowedOrigins: z.boolean().nullable(),
    eventsPerMinute: z.number().int().min(1).max(1_000_000).nullable(),
    adminNotes: z.string().max(4000).nullable(),
  })
  .partial();

const bad = (reply: FastifyReply, message: string) => reply.status(400).send({ error: 'Bad Request', message });

export async function adminControlRoutes(fastify: FastifyInstance) {
  // ---------- Features for the whole instance ----------
  fastify.get('/api/admin/features', async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    const { instance } = await storedSettings();
    const overrides = await db
      .select({ feature: featureSettings.feature, total: count() })
      .from(featureSettings)
      .where(and(isNotNull(featureSettings.organizationId), eq(featureSettings.enabled, false)))
      .groupBy(featureSettings.feature);
    return reply.send({ data: describeFeatures(instance, undefined, new Map(overrides.map((row) => [row.feature, row.total]))) });
  });

  fastify.put<{ Params: { feature: string } }>('/api/admin/features/:feature', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const parsed = changeSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, 'Send enabled: true or false');
    const { instance } = await storedSettings();
    const plan = planFeatureChange(request.params.feature, parsed.data.enabled, instance);
    if (!plan.ok) return reply.status(plan.status).send({ code: plan.code, message: plan.message, blockedBy: plan.blockedBy });
    const cascades = plan.alsoOff.length + plan.alsoOn.length > 0;
    if (parsed.data.dryRun || (cascades && !parsed.data.confirmCascade)) {
      return reply.status(parsed.data.dryRun ? 200 : 409).send({ code: cascades ? 'CONFIRM_CASCADE' : 'OK', changes: plan.changes, alsoOff: plan.alsoOff, alsoOn: plan.alsoOn });
    }
    const actor = admin.session.user.id;
    await db.transaction(async (tx) => {
      for (const change of plan.changes) await writeInstance(tx, change.feature, change.enabled, actor);
      await createAuditLog(tx, {
        actorType: 'user',
        actorId: actor,
        action: parsed.data.enabled ? 'admin.feature_enabled' : 'admin.feature_disabled',
        severity: parsed.data.enabled ? 'info' : 'warning',
        resourceType: 'feature',
        resourceId: request.params.feature,
        metadata: { scope: 'instance', changes: plan.changes },
      });
    });
    clearFeatureCache();
    const after = await storedSettings();
    return reply.send({ changes: plan.changes, data: describeFeatures(after.instance) });
  });

  // ---------- Features for one organization ----------
  fastify.get<{ Params: { organizationId: string } }>('/api/admin/organizations/:organizationId/features', async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    const { instance, org } = await storedSettings(request.params.organizationId);
    return reply.send({ data: describeFeatures(instance, org) });
  });

  fastify.put<{ Params: { organizationId: string; feature: string } }>('/api/admin/organizations/:organizationId/features/:feature', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { organizationId, feature } = request.params;
    const [org] = await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, organizationId));
    if (!org) return reply.status(404).send({ error: 'Not Found', message: 'Organization not found' });
    const parsed = changeSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, 'Send enabled: true or false');
    const settings = await storedSettings(organizationId);
    const plan = planFeatureChange(feature, parsed.data.enabled, settings.instance, settings.org);
    if (!plan.ok) return reply.status(plan.status).send({ code: plan.code, message: plan.message, blockedBy: plan.blockedBy });
    const cascades = plan.alsoOff.length + plan.alsoOn.length > 0;
    if (parsed.data.dryRun || (cascades && !parsed.data.confirmCascade)) {
      return reply.status(parsed.data.dryRun ? 200 : 409).send({ code: cascades ? 'CONFIRM_CASCADE' : 'OK', changes: plan.changes, alsoOff: plan.alsoOff, alsoOn: plan.alsoOn });
    }
    const actor = admin.session.user.id;
    await db.transaction(async (tx) => {
      for (const change of plan.changes) await writeOrg(tx, organizationId, change.feature, change.enabled, actor);
      await createAuditLog(tx, {
        organizationId,
        actorType: 'user',
        actorId: actor,
        action: parsed.data.enabled ? 'admin.org_feature_enabled' : 'admin.org_feature_disabled',
        severity: parsed.data.enabled ? 'info' : 'warning',
        resourceType: 'feature',
        resourceId: feature,
        metadata: { scope: 'organization', organizationName: org.name, changes: plan.changes },
      });
    });
    clearFeatureCache();
    const after = await storedSettings(organizationId);
    return reply.send({ changes: plan.changes, data: describeFeatures(after.instance, after.org) });
  });

  // Puts an organization back on the instance settings.
  fastify.delete<{ Params: { organizationId: string } }>('/api/admin/organizations/:organizationId/features', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { organizationId } = request.params;
    await db.delete(featureSettings).where(eq(featureSettings.organizationId, organizationId));
    await createAuditLog(db, { organizationId, actorType: 'user', actorId: admin.session.user.id, action: 'admin.org_features_reset', resourceType: 'organization', resourceId: organizationId });
    clearFeatureCache();
    const after = await storedSettings(organizationId);
    return reply.send({ data: describeFeatures(after.instance, after.org) });
  });

  // ---------- Policies ----------
  const readPolicy = async (orgId: string | null) => {
    const [row] = await db.select().from(organizationPolicies).where(orgId ? eq(organizationPolicies.organizationId, orgId) : isNull(organizationPolicies.organizationId));
    const own = Object.fromEntries([...POLICY_FIELDS, 'adminNotes'].map((key) => [key, (row as Record<string, unknown> | undefined)?.[key] ?? null]));
    return { own, effective: await policyFor(orgId), defaults: orgId ? await policyFor(null) : null, updatedAt: row?.updatedAt ?? null };
  };

  const savePolicy = async (orgId: string | null, body: unknown, actor: string, reply: FastifyReply) => {
    const parsed = policySchema.safeParse(body);
    if (!parsed.success) return bad(reply, parsed.error.issues[0]?.message ?? 'Invalid policy');
    const values = { ...parsed.data, updatedBy: actor, updatedAt: new Date() };
    // Empty lists mean "no restriction", stored as null so an organization inherits the default.
    if (values.allowedEmailDomains?.length === 0) values.allowedEmailDomains = null;
    if (values.apiIpAllowlist?.length === 0) values.apiIpAllowlist = null;
    await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: organizationPolicies.id }).from(organizationPolicies).where(orgId ? eq(organizationPolicies.organizationId, orgId) : isNull(organizationPolicies.organizationId));
      if (existing) await tx.update(organizationPolicies).set(values).where(eq(organizationPolicies.id, existing.id));
      else await tx.insert(organizationPolicies).values({ id: `pol_${crypto.randomUUID()}`, organizationId: orgId, ...values });
      await createAuditLog(tx, {
        organizationId: orgId,
        actorType: 'user',
        actorId: actor,
        action: orgId ? 'admin.org_policy_updated' : 'admin.default_policy_updated',
        severity: 'warning',
        resourceType: orgId ? 'organization' : 'instance',
        resourceId: orgId ?? 'instance',
        metadata: { changes: parsed.data },
      });
    });
    clearFeatureCache();
    return reply.send(await readPolicy(orgId));
  };

  fastify.get('/api/admin/policies', async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    return reply.send(await readPolicy(null));
  });

  fastify.put('/api/admin/policies', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    return savePolicy(null, request.body, admin.session.user.id, reply);
  });

  fastify.get<{ Params: { organizationId: string } }>('/api/admin/organizations/:organizationId/policy', async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    return reply.send(await readPolicy(request.params.organizationId));
  });

  fastify.put<{ Params: { organizationId: string } }>('/api/admin/organizations/:organizationId/policy', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const [org] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, request.params.organizationId));
    if (!org) return reply.status(404).send({ error: 'Not Found', message: 'Organization not found' });
    return savePolicy(org.id, request.body, admin.session.user.id, reply);
  });

  // ---------- People and access in an organization ----------
  fastify.get<{ Params: { organizationId: string } }>('/api/admin/organizations/:organizationId/members', async (request, reply) => {
    if (!(await requirePlatformAdmin(request, reply))) return;
    const { organizationId } = request.params;
    const [people, pending, keys] = await Promise.all([
      db
        .select({ id: member.id, userId: users.id, name: users.name, email: users.email, role: member.role, joinedAt: member.createdAt, emailVerified: users.emailVerified })
        .from(member)
        .innerJoin(users, eq(users.id, member.userId))
        .where(eq(member.organizationId, organizationId))
        .orderBy(member.createdAt),
      db.select({ id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt }).from(invitation).where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, 'pending'))),
      db
        .select({ total: count() })
        .from(apiKeys)
        .innerJoin(projects, eq(projects.id, apiKeys.projectId))
        .where(and(eq(projects.organizationId, organizationId), isNull(apiKeys.revokedAt))),
    ]);
    const sessions = people.length
      ? await db.select({ userId: session.userId, total: count() }).from(session).where(and(inArray(session.userId, people.map((person) => person.userId)), sql`${session.expiresAt} > now()`)).groupBy(session.userId)
      : [];
    const sessionsOf = new Map(sessions.map((row) => [row.userId, row.total]));
    return reply.send({ members: people.map((person) => ({ ...person, activeSessions: sessionsOf.get(person.userId) ?? 0 })), invitations: pending, activeApiKeys: keys[0]?.total ?? 0 });
  });

  fastify.patch<{ Params: { organizationId: string; memberId: string } }>('/api/admin/organizations/:organizationId/members/:memberId', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const parsed = z.object({ role: z.enum(['owner', 'admin', 'member']) }).safeParse(request.body);
    if (!parsed.success) return bad(reply, 'role must be owner, admin or member');
    const { organizationId, memberId } = request.params;
    const [target] = await db.select().from(member).where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)));
    if (!target) return reply.status(404).send({ error: 'Not Found', message: 'Member not found' });
    if (target.role === 'owner' && parsed.data.role !== 'owner') {
      const [owners] = await db.select({ total: count() }).from(member).where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')));
      if ((owners?.total ?? 0) <= 1) return reply.status(409).send({ code: 'LAST_OWNER', message: 'An organization needs at least one owner. Make someone else owner first.' });
    }
    await db.update(member).set({ role: parsed.data.role }).where(eq(member.id, memberId));
    await createAuditLog(db, { organizationId, actorType: 'user', actorId: admin.session.user.id, action: 'admin.member_role_changed', severity: 'warning', resourceType: 'member', resourceId: memberId, metadata: { from: target.role, to: parsed.data.role } });
    return reply.send({ id: memberId, role: parsed.data.role });
  });

  fastify.delete<{ Params: { organizationId: string; memberId: string } }>('/api/admin/organizations/:organizationId/members/:memberId', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { organizationId, memberId } = request.params;
    const [target] = await db.select().from(member).where(and(eq(member.id, memberId), eq(member.organizationId, organizationId)));
    if (!target) return reply.status(404).send({ error: 'Not Found', message: 'Member not found' });
    if (target.role === 'owner') {
      const [owners] = await db.select({ total: count() }).from(member).where(and(eq(member.organizationId, organizationId), eq(member.role, 'owner')));
      if ((owners?.total ?? 0) <= 1) return reply.status(409).send({ code: 'LAST_OWNER', message: 'The last owner cannot be removed' });
    }
    await db.delete(member).where(eq(member.id, memberId));
    await createAuditLog(db, { organizationId, actorType: 'user', actorId: admin.session.user.id, action: 'admin.member_removed', severity: 'warning', resourceType: 'member', resourceId: memberId, metadata: { userId: target.userId, role: target.role } });
    return reply.send({ removed: true });
  });

  // For a suspected breach: every API key in the organization stops working at once.
  fastify.post<{ Params: { organizationId: string } }>('/api/admin/organizations/:organizationId/revoke-api-keys', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { organizationId } = request.params;
    const ids = (await db.select({ id: projects.id }).from(projects).where(eq(projects.organizationId, organizationId))).map((row) => row.id);
    const revoked = ids.length
      ? await db.update(apiKeys).set({ revokedAt: new Date() }).where(and(inArray(apiKeys.projectId, ids), isNull(apiKeys.revokedAt))).returning({ id: apiKeys.id })
      : [];
    await createAuditLog(db, { organizationId, actorType: 'user', actorId: admin.session.user.id, action: 'admin.org_api_keys_revoked', severity: 'critical', resourceType: 'organization', resourceId: organizationId, metadata: { revoked: revoked.length } });
    return reply.send({ revoked: revoked.length });
  });

  // Signs every member out everywhere. They can sign in again unless the organization is suspended.
  fastify.post<{ Params: { organizationId: string } }>('/api/admin/organizations/:organizationId/sign-out', async (request, reply) => {
    const admin = await requirePlatformAdmin(request, reply);
    if (!admin) return;
    const { organizationId } = request.params;
    const people = (await db.select({ userId: member.userId }).from(member).where(eq(member.organizationId, organizationId))).map((row) => row.userId).filter((id) => id !== admin.session.user.id);
    const ended = people.length ? await db.delete(session).where(inArray(session.userId, people)).returning({ id: session.id }) : [];
    await createAuditLog(db, { organizationId, actorType: 'user', actorId: admin.session.user.id, action: 'admin.org_sessions_ended', severity: 'warning', resourceType: 'organization', resourceId: organizationId, metadata: { sessions: ended.length } });
    return reply.send({ sessionsEnded: ended.length });
  });
}
