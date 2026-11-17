import { validateChallengeInput } from '@gami/challenges';
import { validateLevelDefinitions } from '@gami/progression';
import { validateRuleForSave } from '@gami/rules';
import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDatabaseConnection, db } from '../client.js';
import {
  DEMO_ACHIEVEMENTS,
  DEMO_CHALLENGE,
  DEMO_CURRENCY,
  DEMO_LEVELS,
  DEMO_LOCKED_FEATURES,
  DEMO_POLICY,
  DEMO_RULES,
  demoPlayers,
  demoSocial,
} from '../demo-data.js';
import { countLiveDemos, createDemoWorkspace, deleteExpiredDemos, isLiveDemo } from '../demo.js';
import { featuresFor, policyFor } from '../features.js';
import { runMigrations } from '../migrate.js';
import * as schema from '../schema/index.js';

describe('demo data', () => {
  it.each(DEMO_RULES)('$name is a rule a real install would save', (rule) => {
    expect(() => validateRuleForSave({ trigger: rule.trigger, conditions: rule.conditions ?? undefined, actions: rule.actions })).not.toThrow();
  });

  it('has valid levels and a valid challenge', () => {
    expect(validateLevelDefinitions(DEMO_LEVELS).valid).toBe(true);
    expect(validateChallengeInput(DEMO_CHALLENGE)).toMatchObject({ valid: true });
  });

  it('only awards achievements and currencies it defines', () => {
    const keys = new Set(DEMO_ACHIEVEMENTS.map((a) => a.key));
    for (const action of DEMO_RULES.flatMap((rule) => rule.actions)) {
      const params = action.params as Record<string, unknown>;
      if (action.type === 'award_achievement') expect(keys.has(params['achievementKey'] as string)).toBe(true);
      if (action.type === 'award_currency') expect(params['currency']).toBe(DEMO_CURRENCY.key);
    }
  });

  it('generates the same players for the same seed, with a month of varied activity', () => {
    const players = demoPlayers(42);
    expect(demoPlayers(42)).toEqual(players);
    expect(demoPlayers(43)).not.toEqual(players);
    expect(players).toHaveLength(36);
    const lessons = players.flatMap((p) => p.lessons);
    expect(lessons.length).toBeGreaterThan(300);
    expect(Math.max(...lessons.map((l) => l.daysAgo))).toBeLessThanOrEqual(29);
    expect(lessons.some((l) => l.score === 100)).toBe(true);
    // The most regular players are on a run of at least ten days.
    for (const player of players.slice(0, 6)) {
      const days = new Set(player.lessons.map((l) => l.daysAgo));
      for (let day = 0; day < 10; day++) expect(days.has(day)).toBe(true);
    }
  });
});

describe('demo community', () => {
  it('makes friends, invites and kudos between real players, the same every time', () => {
    const social = demoSocial(36);
    expect(demoSocial(36)).toEqual(social);
    expect(social.friendships.length).toBeGreaterThanOrEqual(12);
    expect(social.invites).toHaveLength(8);
    // No one befriends or invites themselves, and every position is a real player.
    for (const [a, b] of social.friendships) expect(a).not.toBe(b);
    for (const invite of social.invites) expect(invite.referrer).not.toBe(invite.referee);
    const positions = [...social.friendships.flat(), ...social.invites.flatMap((i) => [i.referrer, i.referee]), ...social.kudos.flatMap((k) => [k.from, k.to])];
    expect(Math.max(...positions)).toBeLessThan(36);
    // A new player is invited once, and every inviter has a code in the real alphabet.
    expect(new Set(social.invites.map((i) => i.referee)).size).toBe(social.invites.length);
    for (const referrer of new Set(social.invites.map((i) => i.referrer))) {
      expect(social.codes.find((c) => c.player === referrer)?.code).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    }
    // Kudos go between friends only.
    for (const item of social.kudos) {
      expect(social.friendships.some(([a, b]) => (a === item.from && b === item.to) || (a === item.to && b === item.from))).toBe(true);
    }
  });

  it('fits a demo with fewer players', () => {
    const social = demoSocial(10);
    expect(Math.max(...social.friendships.flat())).toBeLessThan(10);
    expect(social.invites).toHaveLength(0);
  });
});

describe('demo workspaces', () => {
  const created: string[] = [];
  let userId: string;

  beforeAll(async () => {
    await runMigrations();
    userId = `usr_demo_test_${Date.now()}`;
    await db.insert(schema.users).values({ id: userId, name: 'Demo visitor', email: `${userId}@demo.invalid`, emailVerified: true });
  });

  afterAll(async () => {
    if (created.length) {
      await db.update(schema.organizations).set({ demoExpiresAt: new Date(0) }).where(inArray(schema.organizations.id, created));
      await deleteExpiredDemos(new Date());
    }
    await db.delete(schema.users).where(eq(schema.users.id, userId));
    await closeDatabaseConnection();
  });

  it('creates a seeded, locked-down demo that expires', async () => {
    const now = new Date('2026-11-12T12:00:00Z');
    const before = await countLiveDemos(now);
    const demo = await createDemoWorkspace({ ownerUserId: userId, ttlHours: 24, now, seed: 7 });
    created.push(demo.organizationId);

    expect(demo.expiresAt.toISOString()).toBe('2026-11-13T12:00:00.000Z');
    expect(await countLiveDemos(now)).toBe(before + 1);
    expect(await isLiveDemo(demo.organizationId, now)).toBe(true);
    expect(await isLiveDemo(demo.organizationId, new Date('2026-11-14T00:00:00Z'))).toBe(false);

    const [owner] = await db.select().from(schema.member).where(eq(schema.member.organizationId, demo.organizationId));
    expect(owner).toMatchObject({ userId, role: 'owner' });

    // Locked down.
    const features = await featuresFor(demo.organizationId);
    for (const feature of DEMO_LOCKED_FEATURES) expect(features[feature]).toBe(false);
    expect(features.leagues && features.store && features.streaks).toBe(true);
    expect(await policyFor(demo.organizationId)).toMatchObject(DEMO_POLICY);

    // Seeded, with every event queued for the worker and none in the future.
    const events = await db.select({ id: schema.events.id, occurredAt: schema.events.occurredAt }).from(schema.events).where(eq(schema.events.projectId, demo.projectId));
    expect(events).toHaveLength(demo.events);
    expect(events.every((e) => e.occurredAt <= now)).toBe(true);
    const queued = await db.select({ id: schema.eventOutbox.id }).from(schema.eventOutbox).where(and(inArray(schema.eventOutbox.eventId, events.map((e) => e.id)), eq(schema.eventOutbox.status, 'pending')));
    expect(queued).toHaveLength(demo.events);
    const players = await db.select({ id: schema.endUsers.id }).from(schema.endUsers).where(eq(schema.endUsers.projectId, demo.projectId));
    expect(players).toHaveLength(demo.players);

    // Regular players already have a streak, worked out with the real streak maths.
    const streaks = await db.select().from(schema.userStreaks).where(eq(schema.userStreaks.projectId, demo.projectId));
    expect(Math.max(...streaks.map((s) => s.current))).toBeGreaterThanOrEqual(10);
    expect(streaks.every((s) => s.longest >= s.current)).toBe(true);

    const rules = await db.select({ id: schema.rules.id }).from(schema.rules).where(eq(schema.rules.projectId, demo.projectId));
    expect(rules).toHaveLength(DEMO_RULES.length);

    // Friends both ways, an invite program, and invites waiting for the worker to reward them.
    const social = demoSocial(demo.players);
    const friends = await db.select().from(schema.friendships).where(eq(schema.friendships.projectId, demo.projectId));
    expect(friends).toHaveLength(social.friendships.length * 2);
    const [program] = await db.select().from(schema.referralPrograms).where(eq(schema.referralPrograms.projectId, demo.projectId));
    expect(program).toMatchObject({ enabled: true, qualifyingEvent: 'lesson_completed' });
    const invites = await db.select().from(schema.referrals).where(eq(schema.referrals.projectId, demo.projectId));
    expect(invites).toHaveLength(social.invites.length);
    expect(invites.every((invite) => invite.status === 'pending')).toBe(true);
    const kudos = await db.select().from(schema.kudos).where(eq(schema.kudos.projectId, demo.projectId));
    expect(kudos).toHaveLength(social.kudos.length);
  });

  it('deletes expired demos with everything in them, and the visitor account', async () => {
    const demo = await createDemoWorkspace({ ownerUserId: userId, ttlHours: 1, now: new Date('2026-11-12T12:00:00Z'), seed: 8 });
    const visitor = `usr_demo_visitor_${Date.now()}`;
    await db.insert(schema.users).values({ id: visitor, name: 'Visitor', email: `${visitor}@demo.invalid`, emailVerified: true });
    const other = await createDemoWorkspace({ ownerUserId: visitor, ttlHours: 1, now: new Date('2026-11-12T12:00:00Z'), seed: 9 });
    created.push(demo.organizationId);

    expect(await deleteExpiredDemos(new Date('2026-11-12T12:30:00Z'))).toBe(0);
    // `userId` also owns the first demo's org from the test above, which is still live then.
    const removed = await deleteExpiredDemos(new Date('2026-11-12T13:30:00Z'));
    expect(removed).toBeGreaterThanOrEqual(2);

    for (const id of [demo.organizationId, other.organizationId]) {
      expect(await db.select().from(schema.organizations).where(eq(schema.organizations.id, id))).toHaveLength(0);
    }
    expect(await db.select().from(schema.projects).where(eq(schema.projects.id, other.projectId))).toHaveLength(0);
    expect(await db.select().from(schema.events).where(eq(schema.events.projectId, other.projectId))).toHaveLength(0);
    // The visitor's account goes with their only organization; the other user still owns a live demo.
    expect(await db.select().from(schema.users).where(eq(schema.users.id, visitor))).toHaveLength(0);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, userId))).toHaveLength(1);
  });
});
