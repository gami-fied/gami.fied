import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from './client.js';
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
      organization: schema.organizations,
      member: schema.member,
      invitation: schema.invitation,
    },
  }),
  emailAndPassword: {
    enabled: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await passwordResetSender?.({ email: user.email, url });
    },
  },
  plugins: [organization()],
});
