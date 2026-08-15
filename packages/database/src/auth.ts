import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { organization } from 'better-auth/plugins';
import { db } from './client.js';
import * as schema from './schema/index.js';

export const auth = betterAuth({
  secret:
    process.env['BETTER_AUTH_SECRET'] || 'super-secret-auth-key-123456789-default-key-for-dev',
  baseURL: process.env['BETTER_AUTH_URL'] || 'http://localhost:3001',
  trustedOrigins: ['http://localhost:3000', 'http://localhost:3001'],
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
  },
  plugins: [organization()],
});
