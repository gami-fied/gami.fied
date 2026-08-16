import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  db,
  emailNotificationOutbox,
  endUsers,
  notificationOutbox,
  notificationPreferences,
  notifications,
  organizations,
  projects,
  runMigrations,
} from '@gami/database';
import { and, eq } from 'drizzle-orm';
import { renderEmailTemplate } from '../email/templates.js';
import { createNotificationIntent } from '../service.js';

describe('Milestone 18 — Multi-Channel Notifications & Email Delivery Core Tests', () => {
  const testOrgId = `org_email_${Date.now()}`;
  const testProjectId = `prj_email_${Date.now()}`;
  const userWithEmailId = `usr_email_valid_${Date.now()}`;
  const userNoEmailId = `usr_email_none_${Date.now()}`;

  beforeAll(async () => {
    await runMigrations();

    // Create test org and project
    await db.insert(organizations).values({
      id: testOrgId,
      name: 'Email Test Org',
      slug: `email-org-${Date.now()}`,
    });

    await db.insert(projects).values({
      id: testProjectId,
      organizationId: testOrgId,
      name: 'Email Test Project',
      slug: `email-prj-${Date.now()}`,
    });

    // Create user WITH email
    await db.insert(endUsers).values({
      id: userWithEmailId,
      projectId: testProjectId,
      externalId: `ext_valid_${Date.now()}`,
      name: 'User With Email',
      email: 'user.valid@example.com',
    });

    // Create user WITHOUT email
    await db.insert(endUsers).values({
      id: userNoEmailId,
      projectId: testProjectId,
      externalId: `ext_none_${Date.now()}`,
      name: 'User Without Email',
      email: null,
    });
  });

  it('1. Default preferences: in_app enabled by default, email disabled by default', async () => {
    const res = await createNotificationIntent(db, {
      projectId: testProjectId,
      userId: userWithEmailId,
      type: 'xp_awarded',
      data: { amount: 100, reason: 'Daily Login' },
      sourceType: 'xp_awarded',
      sourceId: `src_default_${Date.now()}`,
    });

    expect(res.status).toBe('created');
    expect(res.notification).toBeDefined();

    // In-app outbox should exist
    const [inAppOutbox] = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.notificationId, res.notification!.id));
    expect(inAppOutbox).toBeDefined();

    // Email outbox should NOT exist by default
    const [emailOutbox] = await db
      .select()
      .from(emailNotificationOutbox)
      .where(eq(emailNotificationOutbox.notificationId, res.notification!.id));
    expect(emailOutbox).toBeUndefined();
  });

  it('2. When email preference is enabled for user with email, creates email_notification_outbox intent atomically', async () => {
    // Enable email preference for xp_awarded
    await db.insert(notificationPreferences).values({
      id: `pref_${Date.now()}`,
      projectId: testProjectId,
      userId: userWithEmailId,
      channel: 'email',
      notificationType: 'xp_awarded',
      enabled: true,
    });

    const res = await createNotificationIntent(db, {
      projectId: testProjectId,
      userId: userWithEmailId,
      type: 'xp_awarded',
      data: { amount: 250, reason: 'Quest Bonus' },
      sourceType: 'xp_awarded',
      sourceId: `src_email_enabled_${Date.now()}`,
    });

    expect(res.status).toBe('created');

    // Email outbox should exist
    const [emailOutbox] = await db
      .select()
      .from(emailNotificationOutbox)
      .where(eq(emailNotificationOutbox.notificationId, res.notification!.id));

    expect(emailOutbox).toBeDefined();
    expect(emailOutbox.recipientEmail).toBe('user.valid@example.com');
    expect(emailOutbox.subject).toContain('250 XP');
    expect(emailOutbox.status).toBe('pending');
  });

  it('3. User without email skips email outbox creation without failing notification transaction', async () => {
    // Enable email preference for user WITHOUT email
    await db.insert(notificationPreferences).values({
      id: `pref_noemail_${Date.now()}`,
      projectId: testProjectId,
      userId: userNoEmailId,
      channel: 'email',
      notificationType: 'achievement_unlocked',
      enabled: true,
    });

    const res = await createNotificationIntent(db, {
      projectId: testProjectId,
      userId: userNoEmailId,
      type: 'achievement_unlocked',
      data: { achievementName: 'First Step', description: 'Complete tutorial' },
      sourceType: 'achievement',
      sourceId: `src_no_email_${Date.now()}`,
    });

    expect(res.status).toBe('created');
    expect(res.notification).toBeDefined();

    // In-app outbox exists
    const [inAppOutbox] = await db
      .select()
      .from(notificationOutbox)
      .where(eq(notificationOutbox.notificationId, res.notification!.id));
    expect(inAppOutbox).toBeDefined();

    // Email outbox should NOT exist because user has no email
    const [emailOutbox] = await db
      .select()
      .from(emailNotificationOutbox)
      .where(eq(emailNotificationOutbox.notificationId, res.notification!.id));
    expect(emailOutbox).toBeUndefined();
  });

  it('4. Email templates render deterministic subject, HTML, and text for all 4 notification types', () => {
    const tXp = renderEmailTemplate('xp_awarded', { amount: 500, reason: 'Streak' }, 'Gami');
    expect(tXp.subject).toBe('You earned 500 XP!');
    expect(tXp.htmlBody).toContain('+500 XP AWARDED');
    expect(tXp.textBody).toContain('You just earned 500 XP');

    const tAch = renderEmailTemplate('achievement_unlocked', { achievementName: 'High Roller' }, 'Gami');
    expect(tAch.subject).toBe('You unlocked High Roller!');

    const tLvl = renderEmailTemplate('level_up', { newLevel: 10, levelName: 'Master' }, 'Gami');
    expect(tLvl.subject).toBe('You reached Level 10!');

    const tCh = renderEmailTemplate('challenge_completed', { challengeName: 'Weekly Warrior' }, 'Gami');
    expect(tCh.subject).toBe('Challenge completed!');
  });
});
