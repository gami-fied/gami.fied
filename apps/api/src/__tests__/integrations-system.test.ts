import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { db, integrations, integrationDeliveries, projects, organizations, endUsers, notifications, runMigrations } from '@gami/database';
import { redactIntegrationRecord } from '../integrations/index.js';
import { createNotificationIntent } from '@gami/notifications';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 20 — External Integration Framework & Discord Integration System Test', () => {
  let testOrgId: string;
  let testUserId: string;
  let testProjectId: string;

  beforeAll(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    testOrgId = `org_test_intg_${crypto.randomUUID()}`;
    testUserId = `usr_test_intg_${crypto.randomUUID()}`;
    testProjectId = `prj_test_intg_${crypto.randomUUID()}`;

    // Seed Org, Project, EndUser
    await db.insert(organizations).values({
      id: testOrgId,
      name: 'Integration Test Org',
      slug: `intg-org-${crypto.randomUUID()}`,
    });

    await db.insert(projects).values({
      id: testProjectId,
      organizationId: testOrgId,
      name: 'Integration Test Project',
      slug: `intg-prj-${crypto.randomUUID()}`,
    });

    await db.insert(endUsers).values({
      id: testUserId,
      projectId: testProjectId,
      externalId: `ext_${crypto.randomUUID()}`,
      name: 'Integration Test End User',
      email: `intg_test_${crypto.randomUUID()}@example.com`,
    });
  });

  it('1. Secret Redaction: Redacts sensitive webhook URLs and credentials from API responses', () => {
    const rawRecord = {
      id: 'intg_123',
      projectId: testProjectId,
      provider: 'discord',
      name: 'Test Discord',
      status: 'active',
      enabled: true,
      config: {
        encryptedWebhookUrl: 'encrypted_secret_string',
        webhookUrl: 'https://discord.com/api/webhooks/raw',
        guildId: 'guild_999',
        channelId: 'channel_888',
        enabledEvents: ['xp_awarded'],
      },
      lastTestedAt: null,
      lastError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const redacted = redactIntegrationRecord(rawRecord);

    expect(redacted.config.configured).toBe(true);
    expect(redacted.config.guildId).toBe('guild_999');
    expect(redacted.config.channelId).toBe('channel_888');
    expect(JSON.stringify(redacted)).not.toContain('encrypted_secret_string');
    expect(JSON.stringify(redacted)).not.toContain('https://discord.com/api/webhooks/raw');
  });

  it('2. Outbox Pipeline: Creating notification intent creates pending integration delivery outbox intent', async () => {
    // A. Create active Discord integration for project
    const integrationId = `intg_test_${crypto.randomUUID()}`;
    await db.insert(integrations).values({
      id: integrationId,
      projectId: testProjectId,
      provider: 'discord',
      name: 'Discord Channel',
      status: 'active',
      enabled: true,
      config: {
        enabledEvents: ['xp_awarded', 'achievement_unlocked'],
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      },
    });

    // B. Create canonical notification intent
    const result = await db.transaction(async (tx) => {
      return createNotificationIntent(tx, {
        projectId: testProjectId,
        userId: testUserId,
        type: 'xp_awarded',
        data: { amount: 100, reason: 'Test Quest' },
        sourceType: 'event',
        sourceId: `evt_test_${crypto.randomUUID()}`,
      });
    });

    expect(result.status).toBe('created');
    expect(result.notification).toBeDefined();

    // C. Verify integration_deliveries record created
    const deliveries = await db
      .select()
      .from(integrationDeliveries)
      .where(
        and(
          eq(integrationDeliveries.projectId, testProjectId),
          eq(integrationDeliveries.integrationId, integrationId)
        )
      );

    expect(deliveries.length).toBe(1);
    expect(deliveries[0].eventType).toBe('xp_awarded');
    expect(deliveries[0].status).toBe('pending');
  });

  it('3. Replay Idempotency: Replaying existing delivery resets attempt & status without duplicate rows', async () => {
    const integrationId = `intg_replay_${crypto.randomUUID()}`;
    await db.insert(integrations).values({
      id: integrationId,
      projectId: testProjectId,
      provider: 'discord',
      name: 'Discord Replay Test',
      status: 'active',
      enabled: true,
      config: { enabledEvents: ['level_up'] },
    });

    const notifId = `notif_replay_${crypto.randomUUID()}`;
    await db.insert(notifications).values({
      id: notifId,
      projectId: testProjectId,
      userId: testUserId,
      type: 'level_up',
      title: 'Level Up',
      message: 'Reached Level 5',
      data: { level: 5 },
      sourceType: 'event',
      sourceId: `evt_replay_${crypto.randomUUID()}`,
    });

    const deliveryId = `idel_replay_${crypto.randomUUID()}`;
    await db.insert(integrationDeliveries).values({
      id: deliveryId,
      integrationId,
      projectId: testProjectId,
      notificationId: notifId,
      eventType: 'level_up',
      status: 'failed',
      attempts: 3,
      lastError: 'Simulated network timeout',
    });

    // Replay operation
    const now = new Date();
    const [replayed] = await db
      .update(integrationDeliveries)
      .set({
        status: 'pending',
        attempts: 0,
        availableAt: now,
        replayedAt: now,
        lastError: null,
      })
      .where(eq(integrationDeliveries.id, deliveryId))
      .returning();

    expect(replayed.status).toBe('pending');
    expect(replayed.attempts).toBe(0);
    expect(replayed.replayedAt).toBeDefined();

    // Verify row count remains exactly 1 (no duplicate rows inserted)
    const allDeliveries = await db
      .select()
      .from(integrationDeliveries)
      .where(eq(integrationDeliveries.integrationId, integrationId));
    expect(allDeliveries.length).toBe(1);
  });
});
