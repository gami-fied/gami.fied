import { randomUUID } from 'crypto';
import { checkDatabaseHealth } from '@gami/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';

describe('Fastify API HTTP Route Integration - Tenant Isolation & IDOR Tests', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeAll(async () => {
    server = await buildServer();
    const isHealthy = await checkDatabaseHealth();
    expect(isHealthy).toBe(true);
    await server.ready();
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  it('1. HTTP Route Tenant Isolation: Rejects cross-tenant API requests with 403 / 404', async () => {
    const emailA = `usera_api_${randomUUID()}@example.com`;
    const emailB = `userb_api_${randomUUID()}@example.com`;
    const password = 'SecurePassword123!';

    // Step 1: Sign up User A via HTTP endpoint
    const signupARes = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: emailA,
        password,
        name: 'API User A',
      },
    });

    expect(signupARes.statusCode).toBe(200);
    const cookieA = signupARes.headers['set-cookie'] as string;
    expect(cookieA).toBeDefined();

    // Step 2: Sign up User B via HTTP endpoint
    const signupBRes = await server.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: emailB,
        password,
        name: 'API User B',
      },
    });

    expect(signupBRes.statusCode).toBe(200);
    const cookieB = signupBRes.headers['set-cookie'] as string;
    expect(cookieB).toBeDefined();

    // Step 3: User A creates Org A & Project A via HTTP endpoints
    const orgARes = await server.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: cookieA },
      payload: {
        name: 'Organization A',
        slug: `org-a-api-${randomUUID()}`,
      },
    });

    expect(orgARes.statusCode).toBe(201);
    const orgA = JSON.parse(orgARes.payload);

    const prjARes = await server.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookieA },
      payload: {
        organizationId: orgA.id,
        name: 'Project A',
        slug: 'prj-a-api',
      },
    });

    expect(prjARes.statusCode).toBe(201);
    const prjA = JSON.parse(prjARes.payload);

    // Step 4: User B creates Org B & Project B via HTTP endpoints
    const orgBRes = await server.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: cookieB },
      payload: {
        name: 'Organization B',
        slug: `org-b-api-${randomUUID()}`,
      },
    });

    expect(orgBRes.statusCode).toBe(201);
    const orgB = JSON.parse(orgBRes.payload);

    const prjBRes = await server.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: cookieB },
      payload: {
        organizationId: orgB.id,
        name: 'Project B',
        slug: 'prj-b-api',
      },
    });

    expect(prjBRes.statusCode).toBe(201);
    const prjB = JSON.parse(prjBRes.payload);

    // Step 5: Legitimate Access Verifications (HTTP 200 OK)
    const getOrgARes = await server.inject({
      method: 'GET',
      url: `/api/organizations/${orgA.id}`,
      headers: { cookie: cookieA },
    });
    expect(getOrgARes.statusCode).toBe(200);

    const getPrjARes = await server.inject({
      method: 'GET',
      url: `/api/projects/${prjA.id}`,
      headers: { cookie: cookieA },
    });
    expect(getPrjARes.statusCode).toBe(200);

    // Step 6: Cross-Tenant IDOR Attack Verifications (User A trying to access User B's resources)
    // 6a: GET /api/organizations/{orgB.id} with User A's cookie -> 403 Forbidden
    const crossGetOrgRes = await server.inject({
      method: 'GET',
      url: `/api/organizations/${orgB.id}`,
      headers: { cookie: cookieA },
    });
    expect(crossGetOrgRes.statusCode).toBe(403);
    expect(JSON.parse(crossGetOrgRes.payload)).toEqual({
      error: 'Forbidden',
      message: 'Access to organization denied',
    });

    // 6b: GET /api/projects/{prjB.id} with User A's cookie -> 404 Not Found (IDOR defense)
    const crossGetPrjRes = await server.inject({
      method: 'GET',
      url: `/api/projects/${prjB.id}`,
      headers: { cookie: cookieA },
    });
    expect(crossGetPrjRes.statusCode).toBe(404);
    expect(JSON.parse(crossGetPrjRes.payload)).toEqual({
      error: 'Not Found',
      message: 'Project not found',
    });

    // 6c: PATCH /api/organizations/{orgB.id} with User A's cookie -> 403 Forbidden
    const crossPatchOrgRes = await server.inject({
      method: 'PATCH',
      url: `/api/organizations/${orgB.id}`,
      headers: { cookie: cookieA },
      payload: { name: 'Hacked Org B Name' },
    });
    expect(crossPatchOrgRes.statusCode).toBe(403);

    // 6d: DELETE /api/organizations/{orgB.id} with User A's cookie -> 403 Forbidden
    const crossDeleteOrgRes = await server.inject({
      method: 'DELETE',
      url: `/api/organizations/${orgB.id}`,
      headers: { cookie: cookieA },
    });
    expect(crossDeleteOrgRes.statusCode).toBe(403);

    // 6e: DELETE /api/projects/{prjB.id} with User A's cookie -> 404 Not Found
    const crossDeletePrjRes = await server.inject({
      method: 'DELETE',
      url: `/api/projects/${prjB.id}`,
      headers: { cookie: cookieA },
    });
    expect(crossDeletePrjRes.statusCode).toBe(404);
  });
});
