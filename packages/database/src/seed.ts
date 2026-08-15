import { closeDatabaseConnection, db } from './client.js';
import { apiKeys, endUsers, organizations, projects, rules } from './schema/index.js';

export async function seedDatabase() {
  console.log('[database] Starting seed process...');

  const [org] = await db
    .insert(organizations)
    .values({
      id: 'org_dev_01',
      name: 'Development Organization',
      slug: 'dev-org',
    })
    .onConflictDoNothing()
    .returning();

  const orgId = org?.id || 'org_dev_01';

  const [prj] = await db
    .insert(projects)
    .values({
      id: 'prj_dev_01',
      organizationId: orgId,
      name: 'Development Project',
      slug: 'default-project',
    })
    .onConflictDoNothing()
    .returning();

  const prjId = prj?.id || 'prj_dev_01';

  await db
    .insert(endUsers)
    .values({
      id: 'usr_dev_01',
      projectId: prjId,
      externalId: 'user_dev_01',
      name: 'Development User',
      metadata: { role: 'tester', initial: true },
    })
    .onConflictDoNothing();

  await db
    .insert(apiKeys)
    .values({
      id: 'key_dev_01',
      projectId: prjId,
      name: 'Development API Key',
      keyPrefix: 'gami_dev',
      keyHash: 'hash_dev_placeholder_123456789',
    })
    .onConflictDoNothing();

  await db
    .insert(rules)
    .values({
      id: 'rul_dev_01',
      projectId: prjId,
      name: 'Development Rule',
      description: 'Default placeholder rule for development',
      trigger: 'user.onboarding',
      conditions: { operator: 'AND', rules: [] },
      actions: { awardXp: 100 },
      enabled: true,
    })
    .onConflictDoNothing();

  console.log('[database] Seed completed successfully.');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .then(() => closeDatabaseConnection())
    .catch((err) => {
      console.error('[database] Seed failed:', err);
      process.exit(1);
    });
}
