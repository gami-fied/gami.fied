import { randomUUID } from 'crypto';
import {
  achievements,
  challenges,
  db,
  endUsers,
  levels,
  organizations,
  projects,
  runMigrations,
  userAchievements,
  userXpBalances,
  xpLedger,
} from '@gami/database';
import { Gami } from '@gami.fied/sdk';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

/** Runs the SDK against a real server, using only what an API key gives it. */
describe('SDK against the public API', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let gami: Gami;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_sdk_${suffix}`;
  const projectId = `prj_sdk_${suffix}`;
  const internalId = `usr_sdk_${suffix}`;
  const userId = `customer_${suffix}`;
  const achievementId = `ach_sdk_${suffix}`;
  const challengeId = `chl_sdk_${suffix}`;
  const levelId = `lvl_sdk_${suffix}`;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });

    await db.insert(organizations).values({ id: orgId, name: 'SDK', slug: `sdk-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'SDK', slug: 'sdk' });
    await db.insert(endUsers).values({ id: internalId, projectId, externalId: userId, name: 'Ada' });
    await db.insert(userXpBalances).values({ id: `xpb_${suffix}`, projectId, userId: internalId, totalXp: 750 });
    await db.insert(xpLedger).values({ id: `xp_${suffix}`, projectId, userId: internalId, amount: 750, reason: 'seed' });
    await db.insert(levels).values([
      { id: levelId, projectId, level: 1, name: 'Beginner', requiredXp: 0 },
      { id: `lvl2_${suffix}`, projectId, level: 2, name: 'Explorer', requiredXp: 500 },
    ]);
    await db.insert(achievements).values({ id: achievementId, projectId, key: 'first', name: 'First' });
    await db.insert(userAchievements).values({ id: `uach_${suffix}`, projectId, userId: internalId, achievementId });
    await db.insert(challenges).values({
      id: challengeId,
      projectId,
      key: 'ten',
      name: 'Ten',
      trigger: 'order_completed',
      target: 10,
      rewards: [{ type: 'xp', amount: 100 }],
    });

    const { rawSecret } = await createApiKey(projectId, 'SDK', ['*']);
    gami = new Gami({ apiKey: rawSecret, baseUrl, retry: { maxRetries: 0 } });
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('sends events without a project ID', async () => {
    const sent = await gami.events.track({ userId, type: 'order_completed' });
    expect(sent.status).toBe('accepted');
  });

  it('reads users', async () => {
    const list = await gami.users.list({});
    expect(list.users.map((user) => user.externalId)).toContain(userId);
    expect((await gami.users.get({ userId })).id).toBe(internalId);
    expect((await gami.users.getByExternalId({ externalId: userId })).id).toBe(internalId);
  });

  it('reads XP', async () => {
    expect((await gami.xp.getBalance({ userId })).totalXp).toBe(750);
    expect((await gami.xp.getLedger({ userId })).entries).toHaveLength(1);
    expect((await gami.xp.getSummary({})).totalXpAwarded).toBe(750);
  });

  it('reads levels', async () => {
    expect(await gami.levels.list({})).toHaveLength(2);
    expect((await gami.levels.get({ levelId })).name).toBe('Beginner');
    expect((await gami.levels.summary({})).configuredLevelCount).toBe(2);
    expect((await gami.levels.getUserProgress({ userId })).level.number).toBe(2);
  });

  it('reads achievements', async () => {
    expect(await gami.achievements.list({})).toHaveLength(1);
    expect((await gami.achievements.get({ achievementId })).key).toBe('first');
    expect((await gami.achievements.summary({})).totalAwards).toBe(1);
    expect(await gami.achievements.listForUser({ userId })).toHaveLength(1);
    expect((await gami.achievements.getForUser({ userId, achievementId })).achievementKey).toBe('first');
  });

  it('reads challenges', async () => {
    expect(await gami.challenges.list({})).toHaveLength(1);
    expect((await gami.challenges.get({ challengeId })).key).toBe('ten');
    expect((await gami.challenges.summary({})).totalChallenges).toBe(1);
    expect((await gami.challenges.listForUser({ userId })).challenges).toHaveLength(1);
    expect((await gami.challenges.getForUser({ userId, challengeId })).target).toBe(10);
  });

  it('reads the leaderboard', async () => {
    expect((await gami.leaderboards.list({})).entries[0]?.externalId).toBe(userId);
    expect((await gami.leaderboards.getUserRank({ userId })).rank).toBe(1);
  });

  it('writes users, levels and XP', async () => {
    const created = await gami.users.create({ externalId: `new_${suffix}`, name: 'Grace' });
    expect(created.externalId).toBe(`new_${suffix}`);
    const updated = await gami.users.update({ userId: created.id, name: 'Grace H' });
    expect(updated.name).toBe('Grace H');
    await gami.users.delete({ userId: created.id });
    expect((await gami.users.erase({ userId: created.id })).success).toBe(true);

    const level = await gami.levels.create({ level: 3, name: 'Veteran', requiredXp: 2000 });
    expect((await gami.levels.update({ levelId: level.id, name: 'Elder' })).name).toBe('Elder');

    const entry = await gami.xp.adjust({ userId, amount: 10, reason: 'Credit' });
    expect(entry.amount).toBe(10);
  });

  it('uses end-user tokens for the current user', async () => {
    const { token } = await gami.endUserTokens.create({ userId });
    const baseUrl = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
    const me = new Gami({ endUserToken: token, baseUrl });

    expect((await me.me.get()).externalId).toBe(userId);
    expect((await me.me.rank()).rank).toBe(1);
  });
});
