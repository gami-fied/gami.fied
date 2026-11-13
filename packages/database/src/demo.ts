/**
 * Throwaway demo workspaces, for a demo instance only (`GAMI_DEMO_MODE=true`).
 *
 * A demo is an organization with one project, seeded with the setup in `demo-data.ts` and a month
 * of player activity. Its events are queued like any others, so the worker works out XP, levels,
 * badges, wallets and leagues with the real engine. Streaks are written directly, because the
 * worker handles events in parallel and a month of history could arrive out of order.
 *
 * Every demo is locked down: features that reach outside the instance are off, and it gets one
 * project, one member and a low event rate. The worker deletes it, and the visitor's account,
 * once it expires.
 */
import crypto from 'crypto';
import { applyActivity, EMPTY_STREAK, type StreakState } from '@gami/progression';
import { and, count, eq, gt, inArray, isNotNull, lte } from 'drizzle-orm';
import { db } from './client.js';
import { clearFeatureCache } from './features.js';
import {
  achievements,
  challenges,
  currencies,
  endUsers,
  eventOutbox,
  events,
  featureSettings,
  leagues,
  levels,
  member,
  organizationPolicies,
  organizations,
  projects,
  rewards,
  rules,
  streakDefinitions,
  userStreaks,
  users,
} from './schema/index.js';
import {
  DEMO_ACHIEVEMENTS,
  DEMO_APP_NAME,
  DEMO_CHALLENGE,
  DEMO_CURRENCY,
  DEMO_LEAGUE,
  DEMO_LEVELS,
  DEMO_LOCKED_FEATURES,
  DEMO_POLICY,
  DEMO_REWARDS,
  DEMO_RULES,
  DEMO_STREAK,
  demoPlayers,
} from './demo-data.js';

const DAY_MS = 86_400_000;
const INSERT_BATCH = 500;

const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString('hex')}`;

/** Splits rows so a single insert never gets too large. */
function* batches<T>(rows: T[], size = INSERT_BATCH): Generator<T[]> {
  for (let i = 0; i < rows.length; i += size) yield rows.slice(i, i + size);
}

export interface DemoWorkspace {
  organizationId: string;
  projectId: string;
  expiresAt: Date;
  players: number;
  events: number;
}

export interface CreateDemoInput {
  /** The visitor's account, which becomes the only member. */
  ownerUserId: string;
  ttlHours: number;
  now?: Date;
  /** Varies the generated players. Defaults to a random seed. */
  seed?: number;
}

/** Creates a demo organization and everything in it, in one transaction. */
export async function createDemoWorkspace(input: CreateDemoInput): Promise<DemoWorkspace> {
  const now = input.now ?? new Date();
  const seed = input.seed ?? crypto.randomInt(1, 2 ** 31);
  const expiresAt = new Date(now.getTime() + input.ttlHours * 3_600_000);
  const organizationId = newId('org');
  const projectId = newId('prj');
  const suffix = organizationId.slice(-6);
  const players = demoPlayers(seed);

  const result = await db.transaction(async (tx) => {
    await tx.insert(organizations).values({ id: organizationId, name: `${DEMO_APP_NAME} demo`, slug: `demo-${suffix}`, demoExpiresAt: expiresAt });
    await tx.insert(member).values({ id: newId('mem'), organizationId, userId: input.ownerUserId, role: 'owner', createdAt: now });
    await tx.insert(projects).values({ id: projectId, organizationId, name: DEMO_APP_NAME, slug: `lingo-leap-${suffix}` });

    // Lockdown: nothing that reaches outside the instance, and small limits.
    await tx.insert(featureSettings).values(DEMO_LOCKED_FEATURES.map((feature) => ({ id: newId('fts'), organizationId, feature, enabled: false, updatedBy: 'demo' })));
    await tx.insert(organizationPolicies).values({ id: newId('pol'), organizationId, ...DEMO_POLICY, adminNotes: 'Live demo', updatedBy: 'demo' });

    // The design.
    await tx.insert(levels).values(DEMO_LEVELS.map((level) => ({ ...level, id: newId('lvl'), projectId })));
    await tx.insert(achievements).values(DEMO_ACHIEVEMENTS.map((item) => ({ ...item, id: newId('ach'), projectId })));
    await tx.insert(rules).values(DEMO_RULES.map((rule, index) => ({ ...rule, id: newId('rul'), projectId, enabled: true, createdAt: new Date(now.getTime() - (DEMO_RULES.length - index) * 1000) })));
    await tx.insert(challenges).values({ ...DEMO_CHALLENGE, id: newId('chl'), projectId });
    const currencyId = newId('cur');
    await tx.insert(currencies).values({ ...DEMO_CURRENCY, id: currencyId, projectId });
    await tx.insert(rewards).values(DEMO_REWARDS.map((reward) => ({ ...reward, id: newId('rwd'), projectId, currencyId })));
    await tx.insert(leagues).values({ ...DEMO_LEAGUE, id: newId('lea'), projectId });
    const streakId = newId('skd');
    await tx.insert(streakDefinitions).values({ ...DEMO_STREAK, id: streakId, projectId });

    // Players, their lessons, and the streaks those lessons make.
    const playerRows = players.map((player) => ({ id: newId('usr'), projectId, externalId: player.externalId, name: player.name, metadata: { country: player.country } }));
    for (const rows of batches(playerRows)) await tx.insert(endUsers).values(rows);

    const settings = { cadence: DEMO_STREAK.cadence, timeZone: DEMO_STREAK.timeZone, freezeEvery: DEMO_STREAK.freezeEvery, maxFreezes: DEMO_STREAK.maxFreezes };
    const eventRows: (typeof events.$inferInsert)[] = [];
    const streakRows: (typeof userStreaks.$inferInsert)[] = [];
    players.forEach((player, index) => {
      const userId = playerRows[index]!.id;
      let streak: StreakState = EMPTY_STREAK;
      let lastAt: Date | null = null;
      for (const lesson of player.lessons) {
        const at = new Date(now.getTime() - lesson.daysAgo * DAY_MS);
        at.setUTCHours(lesson.hour, Math.floor((index * 7) % 60), 0, 0);
        // Today's lessons stay in the past.
        if (at > now) at.setTime(now.getTime() - (index + 1) * 60_000);
        streak = applyActivity(streak, at, settings).state;
        lastAt = at;
        eventRows.push({ id: newId('evt'), projectId, userId, type: 'lesson_completed', payload: { language: lesson.language, score: lesson.score, lessonId: `${lesson.language}_${eventRows.length % 40}` }, occurredAt: at });
      }
      if (lastAt) streakRows.push({ id: newId('stk'), projectId, userId, definitionId: streakId, ...streak, timeZone: DEMO_STREAK.timeZone, lastActivityAt: lastAt });
    });
    // Oldest first, so the worker meets them roughly in the order they happened.
    eventRows.sort((a, b) => (a.occurredAt as Date).getTime() - (b.occurredAt as Date).getTime());
    for (const rows of batches(eventRows)) await tx.insert(events).values(rows);
    for (const rows of batches(streakRows)) await tx.insert(userStreaks).values(rows);
    const outboxRows = eventRows.map((event, index) => ({ id: newId('out'), eventId: event.id as string, status: 'pending', availableAt: new Date(now.getTime() + index) }));
    for (const rows of batches(outboxRows)) await tx.insert(eventOutbox).values(rows);

    return { players: playerRows.length, events: eventRows.length };
  });

  // The new organization's switches and limits apply straight away.
  clearFeatureCache();
  return { organizationId, projectId, expiresAt, ...result };
}

/** Demos that have not expired yet. */
export async function countLiveDemos(now: Date = new Date()): Promise<number> {
  const [row] = await db.select({ value: count() }).from(organizations).where(gt(organizations.demoExpiresAt, now));
  return row?.value ?? 0;
}

/** True when the organization is a demo that is still live. */
export async function isLiveDemo(organizationId: string, now: Date = new Date()): Promise<boolean> {
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(and(eq(organizations.id, organizationId), gt(organizations.demoExpiresAt, now)));
  return Boolean(row);
}

/**
 * Deletes demos past their expiry, with everything in them, and the visitors' accounts unless an
 * account also belongs to an organization that is not being deleted. Returns how many demos went.
 */
export async function deleteExpiredDemos(now: Date = new Date(), limit = 50): Promise<number> {
  const expired = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(isNotNull(organizations.demoExpiresAt), lte(organizations.demoExpiresAt, now)))
    .limit(limit);
  if (expired.length === 0) return 0;
  const orgIds = expired.map((row) => row.id);

  await db.transaction(async (tx) => {
    const owners = await tx.selectDistinct({ userId: member.userId }).from(member).where(inArray(member.organizationId, orgIds));
    const projectRows = await tx.select({ id: projects.id }).from(projects).where(inArray(projects.organizationId, orgIds));
    // Rewards hold on to their currency, so they go first; the rest follows the organization.
    if (projectRows.length) await tx.delete(rewards).where(inArray(rewards.projectId, projectRows.map((row) => row.id)));
    await tx.delete(organizations).where(inArray(organizations.id, orgIds));

    const ownerIds = owners.map((row) => row.userId);
    if (ownerIds.length) {
      const stillMember = await tx.selectDistinct({ userId: member.userId }).from(member).where(inArray(member.userId, ownerIds));
      const keep = stillMember.map((row) => row.userId);
      const remove = keep.length ? ownerIds.filter((id) => !keep.includes(id)) : ownerIds;
      // Platform admins are never removed, even if they only looked at demos.
      if (remove.length) await tx.delete(users).where(and(inArray(users.id, remove), eq(users.isPlatformAdmin, false)));
    }
  });
  clearFeatureCache();
  return orgIds.length;
}

/** For tests: removes every demo, expired or not. */
export async function deleteAllDemos(): Promise<void> {
  const all = await db.select({ id: organizations.id }).from(organizations).where(isNotNull(organizations.demoExpiresAt));
  if (all.length) {
    await db.update(organizations).set({ demoExpiresAt: new Date(0) }).where(inArray(organizations.id, all.map((row) => row.id)));
    while ((await deleteExpiredDemos(new Date(), 500)) > 0) {
      // Keep going until none are left.
    }
  }
}

