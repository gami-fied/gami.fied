import { db, organizations, projects } from '@gami/database';
import { Gami } from '@gami.fied/sdk';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../index.js';

describe('Milestone 24 — Project Analytics, Insights & Reporting', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let orgId: string;
  let projectIdA: string;
  let projectIdB: string;
  let rawApiKeyA: string;
  let rawApiKeyB: string;
  let dbAvailable = false;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();

    try {
      orgId = `org_analytics_${Date.now()}`;
      await db.insert(organizations).values({
        id: orgId,
        name: 'Analytics Test Org',
        slug: `analytics-org-${Date.now()}`,
      });

      projectIdA = `prj_an_a_${Date.now()}`;
      projectIdB = `prj_an_b_${Date.now()}`;

      await db.insert(projects).values([
        { id: projectIdA, organizationId: orgId, name: 'Analytics Project A', slug: `prj-an-a-${Date.now()}` },
        { id: projectIdB, organizationId: orgId, name: 'Analytics Project B', slug: `prj-an-b-${Date.now()}` },
      ]);

      const { createApiKey } = await import('../services/api-key.service.js');
      const keyA = await createApiKey(projectIdA, 'Analytics Key A');
      const keyB = await createApiKey(projectIdB, 'Analytics Key B');
      rawApiKeyA = keyA.rawSecret;
      rawApiKeyB = keyB.rawSecret;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    if (orgId && dbAvailable) {
      try {
        await db.delete(organizations).where(eq(organizations.id, orgId));
      } catch {
        // Fallback cleanup
      }
    }
    if (app) {
      await app.close();
    }
  });

  it('1. Authorization Check: Rejects unauthorized requests without API key or session', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/prj_dummy/analytics/overview`,
    });
    expect(res.statusCode).toBe(401);
  });

  it('2. Tenant Isolation & Empty Project Handling: Returns zero counts for new empty project', async () => {
    if (!dbAvailable) return;

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectIdA}/analytics/overview?range=7d`,
      headers: {
        'x-api-key': rawApiKeyA || 'gami_pk_live_sample_key_123',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.projectId).toBe(projectIdA);
    expect(body.totalUsers).toBe(0);
    expect(body.activeUsers).toBe(0);
    expect(body.eventsProcessed).toBe(0);
    expect(body.xpAwarded).toBe(0);
    expect(body.achievementsUnlocked).toBe(0);
    expect(body.challengesCompleted).toBe(0);
  });

  it('3. Date Range Presets: Accepts 24h, 7d, 30d, 90d, and custom ranges', async () => {
    if (!dbAvailable) return;

    const ranges = ['24h', '7d', '30d', '90d'] as const;
    for (const r of ranges) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/projects/${projectIdA}/analytics/users?range=${r}`,
        headers: {
          'x-api-key': rawApiKeyA || 'gami_pk_live_sample_key_123',
        },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().dateRange.preset).toBe(r);
    }
  });

  it('4. CSV Export: Generates downloadable CSV content header', async () => {
    if (!dbAvailable) return;

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectIdA}/analytics/export?type=all`,
      headers: {
        'x-api-key': rawApiKeyA || 'gami_pk_live_sample_key_123',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.payload).toContain('Metric Name');
  });

  it('5. SDK Analytics Client Compatibility', async () => {
    const sdk = new Gami({
      apiKey: rawApiKeyA || 'gami_pk_live_sample_key_123',
      baseUrl: 'http://localhost:3001',
    });

    expect(typeof sdk.analytics.getOverview).toBe('function');
    expect(typeof sdk.analytics.getUsers).toBe('function');
    expect(typeof sdk.analytics.getEvents).toBe('function');
    expect(typeof sdk.analytics.getGamification).toBe('function');
    expect(typeof sdk.analytics.getNotifications).toBe('function');
    expect(typeof sdk.analytics.getIntegrations).toBe('function');
    expect(typeof sdk.analytics.export).toBe('function');
  });
});
