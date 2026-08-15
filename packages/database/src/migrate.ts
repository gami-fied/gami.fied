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

if (process.argv[1]?.endsWith('migrate.ts')) {
  runMigrations()
    .then(() => closeDatabaseConnection())
    .catch((err) => {
      console.error('[database] Migration failed:', err);
      process.exit(1);
    });
}
