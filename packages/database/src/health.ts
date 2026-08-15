import { sql } from 'drizzle-orm';
import { db } from './client.js';

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await db.execute(sql`SELECT 1`);
    return true;
  } catch (error) {
    console.error('[database] Health check failed:', error);
    return false;
  }
}
