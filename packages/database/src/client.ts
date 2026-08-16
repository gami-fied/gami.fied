import '@gami/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const isTestEnv = process.env['NODE_ENV'] === 'test' || process.env['VITEST'] === 'true';

const defaultTestUrl = 'postgresql://gami:gami_dev_password@localhost:5432/gami_community_test';
const defaultDevUrl = 'postgresql://gami:gami_dev_password@localhost:5432/gami_community';

const connectionString = isTestEnv
  ? process.env['DATABASE_URL_TEST'] || defaultTestUrl
  : process.env['DATABASE_URL'] || defaultDevUrl;

export const queryClient = postgres(connectionString, {
  max: isTestEnv ? 5 : 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(queryClient, { schema });

export async function closeDatabaseConnection(): Promise<void> {
  await queryClient.end();
}
