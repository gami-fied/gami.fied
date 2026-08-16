import { describe, expect, it, beforeAll, beforeEach } from 'vitest';
import { db, integrations, integrationDeliveries, projects, organizations, endUsers, runMigrations } from '@gami/database';
import { createNotificationIntent } from '@gami/notifications';
import { eq, and } from 'drizzle-orm';
import crypto from 'crypto';

describe('Milestone 20 — Discord Custom Embed Templates & Per-Event Delivery Controls Test', () => {
  let testOrgId: string;
  let testUserId: string;
  let testProjectId: string;

  beforeAll(async () => {
    await runMigrations();
  });

  beforeEach(async () => {
    testOrgId = `org_tpl_test_${crypto.randomUUID()}`;
    testUserId = `usr_tpl_test_${crypto.randomUUID()}`;
    testProjectId = `prj_tpl_test_${crypto.randomUUID()}`;

    // Seed Org, Project, EndUser
    await db.insert(organizations).values({
      id: testOrgId,
      name: 'Template Test Org',
      slug: `tpl-org-${crypto.randomUUID()}`,
    });

    await db.insert(projects).values({
      id: testProjectId,
      organizationId: testOrgId,
      name: 'Template Test Project',
      slug: `tpl-prj-${crypto.randomUUID()}`,
    });

    await db.insert(endUsers).values({
      id: testUserId,
      projectId: testProjectId,
      externalId: `ext_${crypto.randomUUID()}`,
      name: 'Ronak Tester',
      email: `tpl_test_${crypto.randomUUID()}@example.com`,
    });
  });

  it('1. Per-Event Delivery Filtering: Only enabled event types generate outbox deliveries', async () => {
    const integrationId = `intg_filter_${crypto.randomUUID()}`;
    await db.insert(integrations).values({
      id: integrationId,
      projectId: testProjectId,
      provider: 'discord',
      name: 'Filtered Discord Channel',
      status: 'active',
      enabled: true,
      config: {
        enabledEvents: ['xp_awarded'], // Only xp_awarded is enabled! level_up is disabled!
        webhookUrl: 'https://discord.com/api/webhooks/123/abc',
      },
    });

    // A. Trigger level_up (Disabled event)
    await db.transaction(async (tx) => {
      return createNotificationIntent(tx, {
        projectId: testProjectId,
        userId: testUserId,
        type: 'level_up',
        data: { level: 5 },
        sourceType: 'event',
        sourceId: `evt_lvl_${crypto.randomUUID()}`,
      });
    });

    // Verify NO integration_deliveries created for level_up
    const lvlDeliveries = await db
      .select()
      .from(integrationDeliveries)
      .where(
        and(
          eq(integrationDeliveries.projectId, testProjectId),
          eq(integrationDeliveries.integrationId, integrationId),
          eq(integrationDeliveries.eventType, 'level_up')
        )
      );
    expect(lvlDeliveries.length).toBe(0);

    // B. Trigger xp_awarded (Enabled event)
    await db.transaction(async (tx) => {
      return createNotificationIntent(tx, {
        projectId: testProjectId,
        userId: testUserId,
        type: 'xp_awarded',
        data: { amount: 100, reason: 'Quest Done' },
        sourceType: 'event',
        sourceId: `evt_xp_${crypto.randomUUID()}`,
      });
    });

    // Verify integration_deliveries created for xp_awarded
    const xpDeliveries = await db
      .select()
      .from(integrationDeliveries)
      .where(
        and(
          eq(integrationDeliveries.projectId, testProjectId),
          eq(integrationDeliveries.integrationId, integrationId),
          eq(integrationDeliveries.eventType, 'xp_awarded')
        )
      );
    expect(xpDeliveries.length).toBe(1);
  });

  it('2. Custom Template Persistence: Updates custom templates cleanly in integrations.config', async () => {
    const integrationId = `intg_tpl_${crypto.randomUUID()}`;
    await db.insert(integrations).values({
      id: integrationId,
      projectId: testProjectId,
      provider: 'discord',
      name: 'Custom Template Channel',
      status: 'active',
      enabled: true,
      config: {
        enabledEvents: ['xp_awarded'],
        customTemplates: {},
      },
    });

    const customXP = {
      title: '🎯 Custom XP Boost!',
      description: '**{{userName}}** unlocked **{{xp}} XP**!',
      color: '#10B981',
      footerText: 'Guild Gamification Engine',
    };

    const [existing] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, integrationId));

    const cfg = (existing.config as Record<string, unknown>) || {};
    const updatedCfg = {
      ...cfg,
      customTemplates: { xp_awarded: customXP },
    };

    await db
      .update(integrations)
      .set({ config: updatedCfg, updatedAt: new Date() })
      .where(eq(integrations.id, integrationId));

    const [updated] = await db
      .select()
      .from(integrations)
      .where(eq(integrations.id, integrationId));

    const updatedConfig = updated.config as Record<string, any>;
    expect(updatedConfig.customTemplates.xp_awarded.title).toBe('🎯 Custom XP Boost!');
  });
});
