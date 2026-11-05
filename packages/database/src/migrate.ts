import fs from 'fs';
import { sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import path from 'path';
import { fileURLToPath } from 'url';
import { closeDatabaseConnection, db } from './client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runMigrations() {
  console.log('[database] Running migrations...');
  const migrationsFolder = path.resolve(__dirname, '../drizzle/migrations');
  await migrate(db, { migrationsFolder });
  console.log('[database] Migrations applied successfully.');
}

export interface MigrationStatus {
  status: 'current' | 'pending' | 'unknown';
  pending: number;
}

/** Compares the migrations shipped with this build against the ones the database has applied. */
export async function getMigrationStatus(): Promise<MigrationStatus> {
  try {
    const journalPath = path.resolve(__dirname, '../drizzle/migrations/meta/_journal.json');
    const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as {
      entries: { when: number }[];
    };
    const rows = await db.execute<{ created_at: string }>(
      sql`SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`
    );
    const latestApplied = Number(rows[0]?.created_at ?? 0);
    const pending = journal.entries.filter((entry) => entry.when > latestApplied).length;
    return { status: pending > 0 ? 'pending' : 'current', pending };
  } catch {
    return { status: 'unknown', pending: 0 };
  }
}

if (process.argv[1]?.includes('migrate')) {
  runMigrations()
    .then(() => closeDatabaseConnection())
    .catch((err) => {
      console.error('[database] Migration failed:', err);
      process.exit(1);
    });
}
