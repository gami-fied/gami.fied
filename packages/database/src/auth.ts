import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { and, eq } from 'drizzle-orm';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from './client.js';
import { getPlatformSettings } from './platform-settings.js';
import * as schema from './schema/index.js';

const trustedOrigins = Array.from(
  new Set(
    [
      'http://localhost:3000',
      'http://localhost:3001',
      process.env['NEXT_PUBLIC_APP_URL'],
      process.env['BETTER_AUTH_URL'],
      ...(process.env['TRUSTED_ORIGINS'] ? process.env['TRUSTED_ORIGINS'].split(',').map((s) => s.trim()) : []),
    ].filter(Boolean) as string[]
  )
);

const DEV_AUTH_SECRET = 'local-development-only-auth-secret';

export function getAuthSecret(): string {
  const secret = process.env['BETTER_AUTH_SECRET'];
  if (secret) return secret;
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('BETTER_AUTH_SECRET is required in production');
  }
  return DEV_AUTH_SECRET;
}

type PasswordResetSender = (params: { email: string; url: string }) => Promise<void>;
let passwordResetSender: PasswordResetSender | null = null;

/** The API registers the sender, because email delivery lives above this package. */
export function setPasswordResetSender(sender: PasswordResetSender): void {
  passwordResetSender = sender;
}

export const auth = betterAuth({
  secret: getAuthSecret(),
  baseURL: process.env['BETTER_AUTH_URL'] || 'http://localhost:3001',
  trustedOrigins,
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: {
      user: schema.users,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  user: {
    // Lets the dashboard see the flag. It can only be set by the bootstrap and admin tools.
    additionalFields: {
      isPlatformAdmin: { type: 'boolean', required: false, input: false },
    },
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        const owned = await db
          .select({ organizationId: schema.member.organizationId })
          .from(schema.member)
          .where(and(eq(schema.member.userId, user.id), eq(schema.member.role, 'owner')));
        if (owned.length > 0) {
          throw new APIError('BAD_REQUEST', {
            message: 'Transfer or delete the organizations you own before deleting your account.',
          });
        }
      },
    },
  },
  session: {
    // The lifetime is fixed at sign-in, so the admin limit is a real limit.
    disableSessionRefresh: true,
  },
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const { maxSessionLifetimeHours } = await getPlatformSettings('security');
          const expiresAt = new Date(Date.now() + maxSessionLifetimeHours * 60 * 60 * 1000);
          return { data: { ...session, expiresAt } };
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    // The real minimum comes from the admin password policy, enforced in the API's auth route.
    minPasswordLength: 6,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await passwordResetSender?.({ email: user.email, url });
    },
  },
});
