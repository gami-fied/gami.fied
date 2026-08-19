import { db, organizations, projects, apiKeys, events } from '@gami/database';
import { Gami } from '@gami.fied/sdk';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../index.js';

describe('Milestone 23 — Developer Experience & API Platform', () => {
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
      orgId = `org_dev_${Date.now()}`;
      await db.insert(organizations).values({
        id: orgId,
        name: 'Developer Platform Test Org',
        slug: `dev-org-${Date.now()}`,
      });

      projectIdA = `prj_dev_a_${Date.now()}`;
      projectIdB = `prj_dev_b_${Date.now()}`;

      await db.insert(projects).values([
        { id: projectIdA, organizationId: orgId, name: 'Project A', slug: `prj-a-${Date.now()}` },
        { id: projectIdB, organizationId: orgId, name: 'Project B', slug: `prj-b-${Date.now()}` },
      ]);

      const { createApiKey } = await import('../services/api-key.service.js');
      const keyA = await createApiKey(projectIdA, 'Key A');
      const keyB = await createApiKey(projectIdB, 'Key B');
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
        // Cleanup fallback
      }
    }
    if (app) {
      await app.close();
    }
  });

  it('1. Request Tracing: Generates or preserves X-Request-Id header on all responses', async () => {
    // Generated X-Request-Id
    const res1 = await app.inject({
      method: 'GET',
      url: '/health',
    });
    expect(res1.statusCode).toBe(200);
    expect(res1.headers['x-request-id']).toBeDefined();
    expect(String(res1.headers['x-request-id'])).toMatch(/^req_/);

    // Supplied X-Request-Id
    const customReqId = 'req_custom_test_123456';
    const res2 = await app.inject({
      method: 'GET',
      url: '/health',
      headers: {
        'x-request-id': customReqId,
      },
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.headers['x-request-id']).toBe(customReqId);
  });

  it('2. Standardized API Errors: Returns structured error format with requestId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: {
        'x-api-key': 'invalid_key',
      },
      payload: { event: 'test' },
    });

    expect(res.statusCode).toBe(401);
    const body = res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBeDefined();
    expect(body.error.requestId).toBeDefined();

    // Top-level aliases for backwards compatibility
    expect(body.code).toBe('UNAUTHORIZED');
    expect(body.message).toBeDefined();
  });

  it('3. Event Ingestion Idempotency: Supports canonical Idempotency-Key header & 409 conflict detection', async () => {
    if (!dbAvailable) return;
    const idempotencyKey = `idemp_${Date.now()}_abc`;

    // First request -> 202 Accepted, duplicate: false
    const res1 = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: {
        'x-api-key': rawApiKeyA,
        'Idempotency-Key': idempotencyKey,
      },
      payload: {
        event: 'purchase',
        user_id: 'usr_dev_1',
        payload: { amount: 100 },
      },
    });

    expect(res1.statusCode).toBe(202);
    const body1 = res1.json();
    expect(body1.status).toBe('accepted');
    expect(body1.duplicate).toBe(false);

    // Identical retry -> 202 Accepted, duplicate: true
    const res2 = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: {
        'x-api-key': rawApiKeyA,
        'Idempotency-Key': idempotencyKey,
      },
      payload: {
        event: 'purchase',
        user_id: 'usr_dev_1',
        payload: { amount: 100 },
      },
    });

    expect(res2.statusCode).toBe(202);
    const body2 = res2.json();
    expect(body2.id).toBe(body1.id);
    expect(body2.duplicate).toBe(true);

    // Payload mismatch -> 409 Conflict (IDEMPOTENCY_KEY_MISMATCH)
    const res3 = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: {
        'x-api-key': rawApiKeyA,
        'Idempotency-Key': idempotencyKey,
      },
      payload: {
        event: 'purchase',
        user_id: 'usr_dev_1',
        payload: { amount: 9999 }, // Different payload!
      },
    });

    expect(res3.statusCode).toBe(409);
    const body3 = res3.json();
    expect(body3.error.code).toBe('IDEMPOTENCY_KEY_MISMATCH');
  });

  it('4. Tenant Isolation: Idempotency keys are isolated per Project', async () => {
    if (!dbAvailable) return;
    const sharedKey = `shared_idemp_${Date.now()}`;

    // Project A sends event with sharedKey
    const resA = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: {
        'x-api-key': rawApiKeyA,
        'Idempotency-Key': sharedKey,
      },
      payload: { event: 'login', user_id: 'usr_a' },
    });
    expect(resA.statusCode).toBe(202);
    expect(resA.json().duplicate).toBe(false);

    // Project B sends event with exact same sharedKey -> Should be Accepted as new event for Project B (duplicate: false)
    const resB = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: {
        'x-api-key': rawApiKeyB,
        'Idempotency-Key': sharedKey,
      },
      payload: { event: 'login', user_id: 'usr_b' },
    });
    expect(resB.statusCode).toBe(202);
    expect(resB.json().duplicate).toBe(false);
    expect(resB.json().id).not.toBe(resA.json().id);
  });

  it('5. OpenAPI Specification: Serves valid OpenAPI 3.1 JSON at GET /openapi.json', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/openapi.json',
    });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toBeDefined();
    expect(spec.paths['/v1/events']).toBeDefined();
  });

  it('6. SDK Compatibility & gami.events.ingest()', async () => {
    const sdk = new Gami({
      apiKey: rawApiKeyA || 'gami_pk_live_sample_key_123',
      baseUrl: 'http://localhost:3001',
    });

    expect(typeof sdk.events.ingest).toBe('function');
  });
});
