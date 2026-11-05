import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { auth } from './auth.js';
import { closeDatabaseConnection, db } from './client.js';
import {
  achievements,
  apiKeys,
  challenges,
  endUsers,
  eventOutbox,
  events,
  levels,
  member,
  organizations,
  projects,
  rules,
  users,
} from './schema/index.js';
import {
  DEMO_ACHIEVEMENTS,
  DEMO_CHALLENGE,
  DEMO_END_USERS,
  DEMO_LEVELS,
  DEMO_RULES,
  DEMO_USER,
} from './seed-data.js';

const ORG_ID = 'org_dev_01';
const PROJECT_ID = 'prj_dev_01';
const API_KEY_ID = 'key_dev_01';
const DAY_MS = 24 * 60 * 60 * 1000;

async function ensureDemoUser(): Promise<string> {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DEMO_USER.email));
  if (existing) return existing.id;

  const created = await auth.api.signUpEmail({ body: { ...DEMO_USER } });
  return created.user.id;
}

/** Issues a new key on every run, because only its hash is stored. */
async function rotateDemoApiKey(): Promise<string> {
  const rawKey = `gami_live_${crypto.randomBytes(32).toString('hex')}`;
  const keyPrefix = rawKey.substring(0, 18);
  const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

  await db
    .insert(apiKeys)
    .values({ id: API_KEY_ID, projectId: PROJECT_ID, name: 'Demo API Key', keyPrefix, keyHash })
    .onConflictDoUpdate({
      target: apiKeys.id,
      set: { keyPrefix, keyHash, revokedAt: null, updatedAt: new Date() },
    });

  return rawKey;
}

export async function seedDatabase(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('Refusing to seed demo data while NODE_ENV=production');
  }

  console.log('[database] Starting seed process...');

  await db
    .insert(organizations)
    .values({ id: ORG_ID, name: 'Demo Organization', slug: 'demo-org' })
    .onConflictDoNothing();

  await db
    .insert(projects)
    .values({
      id: PROJECT_ID,
      organizationId: ORG_ID,
      name: 'Demo Learning App',
      slug: 'demo-learning-app',
    })
    .onConflictDoNothing();

  const demoUserId = await ensureDemoUser();
  await db
    .insert(member)
    .values({
      id: 'mem_dev_01',
      organizationId: ORG_ID,
      userId: demoUserId,
      role: 'owner',
      createdAt: new Date(),
    })
    .onConflictDoNothing();

  await db
    .insert(levels)
    .values(DEMO_LEVELS.map((l) => ({ ...l, id: `lvl_dev_${l.level}`, projectId: PROJECT_ID })))
    .onConflictDoNothing();

  await db
    .insert(achievements)
    .values(
      DEMO_ACHIEVEMENTS.map((a) => ({ ...a, id: `ach_dev_${a.key}`, projectId: PROJECT_ID }))
    )
    .onConflictDoNothing();

  await db
    .insert(challenges)
    .values({ ...DEMO_CHALLENGE, id: 'chl_dev_01', projectId: PROJECT_ID })
    .onConflictDoNothing();

  // Updates rather than skips, so databases seeded before this format get a working rule.
  for (const rule of DEMO_RULES) {
    const { id, ...definition } = rule;
    await db
      .insert(rules)
      .values({ ...rule, id, projectId: PROJECT_ID, enabled: true })
      .onConflictDoUpdate({
        target: rules.id,
        set: { ...definition, enabled: true, updatedAt: new Date() },
      });
  }

  for (const [userIndex, endUser] of DEMO_END_USERS.entries()) {
    const userId = `usr_dev_0${userIndex + 1}`;
    await db
      .insert(endUsers)
      .values({
        id: userId,
        projectId: PROJECT_ID,
        externalId: endUser.externalId,
        name: endUser.name,
      })
      .onConflictDoNothing();

    for (const [eventIndex, score] of endUser.scores.entries()) {
      const eventId = `evt_dev_${userIndex + 1}_${eventIndex + 1}`;
      const [createdEvent] = await db
        .insert(events)
        .values({
          id: eventId,
          projectId: PROJECT_ID,
          userId,
          type: 'lesson_completed',
          payload: { lessonId: `lesson_${eventIndex + 1}`, score },
          idempotencyKey: eventId,
          occurredAt: new Date(Date.now() - (endUser.scores.length - eventIndex) * DAY_MS),
        })
        .onConflictDoNothing()
        .returning({ id: events.id });

      if (createdEvent) {
        await db.insert(eventOutbox).values({
          id: `out_dev_${userIndex + 1}_${eventIndex + 1}`,
          eventId: createdEvent.id,
          status: 'pending',
        });
      }
    }
  }

  const rawApiKey = await rotateDemoApiKey();

  console.log('[database] Seed completed successfully.');
  console.log('');
  console.log(`  Dashboard login: ${DEMO_USER.email} / ${DEMO_USER.password}`);
  console.log(`  API key:         ${rawApiKey}`);
  console.log('');
  console.log('  Start the worker (pnpm dev) to process the demo events.');
}

if (process.argv[1]?.endsWith('seed.ts')) {
  seedDatabase()
    .then(() => closeDatabaseConnection())
    .catch((err) => {
      console.error('[database] Seed failed:', err);
      process.exit(1);
    });
}
