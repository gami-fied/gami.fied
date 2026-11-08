import { db, invitation, member, policyFor, projects } from '@gami/database';
import { and, count, eq, gt } from 'drizzle-orm';

export interface PolicyDenial {
  status: number;
  code: string;
  message: string;
}

/** Refuses a new project when the organization has reached the number the administrator allows. */
export async function checkProjectQuota(organizationId: string): Promise<PolicyDenial | null> {
  const { maxProjects } = await policyFor(organizationId);
  if (maxProjects === null) return null;
  const [row] = await db.select({ total: count() }).from(projects).where(eq(projects.organizationId, organizationId));
  if ((row?.total ?? 0) < maxProjects) return null;
  return { status: 403, code: 'PROJECT_LIMIT', message: `This organization can have at most ${maxProjects} project${maxProjects === 1 ? '' : 's'}. Ask the platform administrator for more.` };
}

/** Refuses an invitation to someone outside the allowed email domains, or past the member limit. */
export async function checkMemberPolicy(organizationId: string, email: string): Promise<PolicyDenial | null> {
  const policy = await policyFor(organizationId);
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (policy.allowedEmailDomains.length > 0 && !policy.allowedEmailDomains.some((allowed) => domain === allowed.toLowerCase() || domain.endsWith(`.${allowed.toLowerCase()}`))) {
    return { status: 403, code: 'EMAIL_DOMAIN_NOT_ALLOWED', message: `Only addresses at ${policy.allowedEmailDomains.join(', ')} can join this organization` };
  }
  if (policy.maxMembers === null) return null;
  // Pending invitations hold a seat, so a burst of invites cannot get past the limit.
  const [[members], [pending]] = await Promise.all([
    db.select({ total: count() }).from(member).where(eq(member.organizationId, organizationId)),
    db
      .select({ total: count() })
      .from(invitation)
      .where(and(eq(invitation.organizationId, organizationId), eq(invitation.status, 'pending'), gt(invitation.expiresAt, new Date()))),
  ]);
  if ((members?.total ?? 0) + (pending?.total ?? 0) < policy.maxMembers) return null;
  return { status: 403, code: 'MEMBER_LIMIT', message: `This organization can have at most ${policy.maxMembers} members, counting pending invitations` };
}

/**
 * Works out an API key's expiry under the organization's rules. With a maximum lifetime, a key
 * with no expiry gets the longest allowed, and a longer one is refused.
 */
export async function apiKeyExpiry(organizationId: string, requested: Date | null): Promise<{ expiresAt: Date | null } | PolicyDenial> {
  const { apiKeyMaxLifetimeDays } = await policyFor(organizationId);
  if (apiKeyMaxLifetimeDays === null) return { expiresAt: requested };
  const latest = new Date(Date.now() + apiKeyMaxLifetimeDays * 86_400_000);
  if (!requested) return { expiresAt: latest };
  if (requested.getTime() > latest.getTime() + 60_000) {
    return { status: 400, code: 'KEY_LIFETIME_TOO_LONG', message: `API keys in this organization must expire within ${apiKeyMaxLifetimeDays} days` };
  }
  return { expiresAt: requested };
}
