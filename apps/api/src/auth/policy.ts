import crypto from 'crypto';
import { auth, db, getPlatformSettings, invitation, users } from '@gami/database';
import { getRedisConnection } from '@gami/queue';
import { and, eq, gt, sql } from 'drizzle-orm';
import { consumeRateLimit } from '../middleware/rate-limiter.js';
import { createLogger } from '@gami/config';

const log = createLogger('Auth');

export interface AuthPolicyDenial {
  status: number;
  code: string;
  message: string;
}

interface AuthRequest {
  path: string;
  ip: string;
  body: { email?: string; password?: string; newPassword?: string } | undefined;
  headers: Headers;
}

const emailHash = (email: string) => crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');

/**
 * Failures are counted for an email and an address together, so a stranger sending wrong
 * passwords locks out only their own address, not the account's owner.
 */
const failedLoginKey = (email: string, ip: string) => `login_failures:${emailHash(email)}:${ip}`;

/** Failures for an email from every address, which catches guessing spread over many addresses. */
const failedLoginTotalKey = (email: string) => `login_failures_all:${emailHash(email)}`;

/** The account as a whole locks only after far more failures than one address is allowed. */
const totalFailureLimit = (perAddress: number) => Math.max(perAddress * 10, 50);

export async function checkPasswordPolicy(password: string): Promise<AuthPolicyDenial | null> {
  const { passwordMinLength, requireNumbers, requireSpecialChars } =
    await getPlatformSettings('security');

  const problem =
    password.length < passwordMinLength
      ? `at least ${passwordMinLength} characters`
      : requireNumbers && !/\d/.test(password)
        ? 'a number'
        : requireSpecialChars && !/[^A-Za-z0-9]/.test(password)
          ? 'a special character'
          : null;

  return problem
    ? { status: 400, code: 'PASSWORD_POLICY', message: `Password must contain ${problem}` }
    : null;
}

async function canRegister(email: string | undefined): Promise<boolean> {
  const { allowPublicRegistration } = await getPlatformSettings('registration');
  if (allowPublicRegistration) return true;

  // The first account has to be possible, or a closed instance could never be set up.
  const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
  if (!anyUser) return true;
  if (!email) return false;

  const [invited] = await db
    .select({ id: invitation.id })
    .from(invitation)
    .where(
      and(
        sql`lower(${invitation.email}) = ${email.trim().toLowerCase()}`,
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date())
      )
    )
    .limit(1);
  return Boolean(invited);
}

async function canCreateOrganization(headers: Headers): Promise<boolean> {
  const { allowOrgCreation } = await getPlatformSettings('registration');
  if (allowOrgCreation) return true;

  const session = await auth.api.getSession({ headers });
  if (!session) return false;
  const [user] = await db
    .select({ isPlatformAdmin: users.isPlatformAdmin })
    .from(users)
    .where(eq(users.id, session.user.id));
  return Boolean(user?.isPlatformAdmin);
}

async function checkSignIn(ip: string, email: string | undefined): Promise<AuthPolicyDenial | null> {
  const { loginRateLimit, maxFailedLoginAttempts } = await getPlatformSettings('security');

  const bucket = Math.floor(Date.now() / 60_000);
  if (!(await consumeRateLimit(`login:${ip}:${bucket}`, loginRateLimit, 60))) {
    return { status: 429, code: 'TOO_MANY_REQUESTS', message: 'Too many sign-in attempts' };
  }

  if (email) {
    const [failures, total] = await getRedisConnection()
      .mget(failedLoginKey(email, ip), failedLoginTotalKey(email))
      .catch(() => [null, null]);
    if (Number(failures) >= maxFailedLoginAttempts || Number(total) >= totalFailureLimit(maxFailedLoginAttempts)) {
      return {
        status: 429,
        code: 'ACCOUNT_LOCKED',
        message: 'Too many failed sign-in attempts. Try again later.',
      };
    }
  }
  return null;
}

/** Applies the admin settings that Better Auth cannot read per request. Null means allowed. */
export async function checkAuthPolicy(request: AuthRequest): Promise<AuthPolicyDenial | null> {
  const { path, ip, body, headers } = request;

  if (path.endsWith('/sign-up/email')) {
    if (!(await canRegister(body?.email))) {
      return { status: 403, code: 'REGISTRATION_CLOSED', message: 'Registration is closed' };
    }
    return body?.password ? checkPasswordPolicy(body.password) : null;
  }

  if (path.endsWith('/sign-in/email')) return checkSignIn(ip, body?.email);

  if (path.endsWith('/reset-password') || path.endsWith('/change-password')) {
    return body?.newPassword ? checkPasswordPolicy(body.newPassword) : null;
  }

  if (path.endsWith('/organization/create') && !(await canCreateOrganization(headers))) {
    return {
      status: 403,
      code: 'ORG_CREATION_DISABLED',
      message: 'Organization creation is disabled on this instance',
    };
  }

  return null;
}

/**
 * Counts failed sign-ins, and clears this address's count on success. Without Redis nothing can be
 * counted, so the lockout is off until it is back; the warning below says so.
 */
export async function recordSignInResult(email: string, ip: string, succeeded: boolean): Promise<void> {
  const key = failedLoginKey(email, ip);
  try {
    const redis = getRedisConnection();
    if (succeeded) {
      await redis.del(key);
      return;
    }
    const { lockoutDurationMinutes } = await getPlatformSettings('security');
    const seconds = lockoutDurationMinutes * 60;
    await redis.multi().incr(key).expire(key, seconds).incr(failedLoginTotalKey(email)).expire(failedLoginTotalKey(email), seconds).exec();
  } catch (err) {
    log.warn('Could not record sign-in result:', (err as Error).message);
  }
}
