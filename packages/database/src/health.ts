import { sql } from 'drizzle-orm';
import { db } from './client.js';
import { createLogger } from '@gami/config';

const log = createLogger('database');

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    log.error('Health check failed:', error);
    return false;
  }
}
