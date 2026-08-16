import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
import { closeDatabaseConnection, db } from '../client.js';
import { auditLogs, users } from '../schema/index.js';

export async function promoteUserToPlatformAdmin(email: string): Promise<boolean> {
  const targetEmail = email.trim().toLowerCase();

  const [targetUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, targetEmail));

  if (!targetUser) {
    console.error(`Error: User with email "${targetEmail}" does not exist in database.`);
    return false;
  }

  if (targetUser.isPlatformAdmin) {
    console.log(`Info: User "${targetEmail}" (${targetUser.id}) is already a Platform Administrator.`);
    return true;
  }

  await db
    .update(users)
    .set({ isPlatformAdmin: true, updatedAt: new Date() })
    .where(eq(users.id, targetUser.id));

  // Log system audit event for CLI promotion
  try {
    await db.insert(auditLogs).values({
      id: `aud_cli_${Date.now()}`,
      organizationId: null,
      projectId: null,
      actorType: 'system',
      actorId: 'cli_emergency',
      action: 'admin.promoted_via_cli',
      severity: 'critical',
      resourceType: 'user',
      resourceId: targetUser.id,
      metadata: { email: targetEmail, promotedAt: new Date().toISOString() },
      createdAt: new Date(),
    });
  } catch {}

  console.log(`Success: User "${targetEmail}" (${targetUser.id}) has been promoted to Platform Administrator.`);
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const emailIdx = args.indexOf('--email');
  const email = emailIdx !== -1 && args[emailIdx + 1] ? args[emailIdx + 1] : null;

  if (!email) {
    console.error('Error: Please specify target user email via --email <email>');
    process.exit(1);
  }

  try {
    const success = await promoteUserToPlatformAdmin(email);
    process.exit(success ? 0 : 1);
  } catch (err: unknown) {
    console.error('Error promoting user:', (err as Error).message || err);
    process.exit(1);
  } finally {
    await closeDatabaseConnection().catch(() => {});
  }
}

const isDirectRun = Boolean(
  process.argv[1] &&
    (process.argv[1].endsWith('promote-admin.ts') ||
      process.argv[1].endsWith('promote-admin.js') ||
      fileURLToPath(import.meta.url) === process.argv[1])
);

if (process.env.NODE_ENV !== 'test' && isDirectRun) {
  main();
}
