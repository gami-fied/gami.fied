import { randomUUID } from 'crypto';
import http from 'http';
import { db, runMigrations, webhookEndpoints, webhookOutbox } from '@gami/database';
import { Gami } from '@gami.fied/sdk';
import { verifyHmacSignature } from '@gami/webhooks';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dispatchPendingWebhooks } from '../../../worker/src/webhook-dispatcher.js';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';

describe('Milestone 16 — Webhooks & External Event Delivery System Test Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl: string;
  let ownerCookie: string;
  let memberCookie: string;

  let orgId: string;
  let projectId: string;
  let apiKeySecret: string;
  let gamiSdk: Gami;

  // Mock Target Receiver Server
  let mockServer: http.Server;
  let mockServerPort: number;
  let mockServerUrl: string;
  let receivedWebhooks: Array<{
    headers: http.IncomingHttpHeaders;
    body: string;
    jsonPayload: any;
  }> = [];

  let createdEndpointId: string;
  let createdSecret: string;

  beforeAll(async () => {
    process.env.ALLOW_LOCAL_WEBHOOKS = 'true';
    await runMigrations();

    // 1. Start local mock webhook receiver HTTP server
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let jsonPayload = null;
        try {
          jsonPayload = JSON.parse(body);
        } catch {}

        receivedWebhooks.push({
          headers: req.headers,
          body,
          jsonPayload,
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'received' }));
      });
    });

    await new Promise<void>((resolve) => {
      mockServer.listen(0, '127.0.0.1', () => {
        const addr = mockServer.address() as { port: number };
        mockServerPort = addr.port;
        mockServerUrl = `http://127.0.0.1:${mockServerPort}/webhook-target`;
        resolve();
      });
    });

    // 2. Start API Server
    app = await buildServer();
    const address = await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = address;

    // 3. Setup Owner & Member Auth
    const ownerSignup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `wh_owner_${randomUUID()}@example.com`,
        password: 'Password123!',
        name: 'Webhook Owner',
      },
    });
    ownerCookie = ownerSignup.headers['set-cookie'] as string;

    const memberSignup = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `wh_member_${randomUUID()}@example.com`,
        password: 'Password123!',
        name: 'Webhook Member',
      },
    });
    memberCookie = memberSignup.headers['set-cookie'] as string;

    // 4. Create Org & Project
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie: ownerCookie },
      payload: { name: 'Webhook Test Org', slug: `wh-org-${randomUUID()}` },
    });
    orgId = JSON.parse(orgRes.payload).id;

    const projRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie: ownerCookie },
      payload: { organizationId: orgId, name: 'Webhook Project', slug: `wh-prj-${randomUUID()}` },
    });
    projectId = JSON.parse(projRes.payload).id;

    // 5. Create API Key & SDK
    const apiKeyObj = await createApiKey(projectId, 'Webhook System Test Key');
    apiKeySecret = apiKeyObj.rawSecret;

    gamiSdk = new Gami({
      baseUrl,
      apiKey: apiKeySecret,
    });
  });

  afterAll(async () => {
    if (mockServer) {
      await new Promise<void>((resolve) => mockServer.close(() => resolve()));
    }
    if (app) {
      await app.close();
    }
  });

  it('1. Webhook URL Security: Rejects invalid or SSRF forbidden URLs', async () => {
    // Localhost / Loopback
    const resLocal = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/webhooks`,
      headers: { cookie: ownerCookie },
      payload: {
        name: 'Bad Loopback',
        url: 'http://localhost:8080/hook',
        events: ['xp.awarded'],
      },
    });
    expect(resLocal.statusCode).toBe(400);

    // Private RFC1918 IP
    const resPrivate = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/webhooks`,
      headers: { cookie: ownerCookie },
      payload: {
        name: 'Bad Private IP',
        url: 'http://10.0.0.1/hook',
        events: ['xp.awarded'],
      },
    });
    expect(resPrivate.statusCode).toBe(400);

    // Cloud Metadata IP
    const resMeta = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/webhooks`,
      headers: { cookie: ownerCookie },
      payload: {
        name: 'Bad Metadata',
        url: 'http://169.254.169.254/latest/meta-data',
        events: ['xp.awarded'],
      },
    });
    expect(resMeta.statusCode).toBe(400);
  });

  it('2. Create Webhook Endpoint: Returns secret ONLY ONCE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/webhooks`,
      headers: { cookie: ownerCookie },
      payload: {
        name: 'Primary Receiver',
        url: mockServerUrl,
        description: 'Test Webhook Target',
        events: ['xp.awarded', 'achievement.unlocked', 'level.up', 'webhook.test'],
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);

    expect(body.id).toBeDefined();
    expect(body.name).toBe('Primary Receiver');
    expect(body.url).toBe(mockServerUrl);
    expect(body.events).toContain('xp.awarded');
    expect(body.secret).toMatch(/^gami_whsec_[a-f0-9]{64}$/);

    createdEndpointId = body.id;
    createdSecret = body.secret;
  });

  it('3. List Webhook Endpoints: Secret is NOT exposed in GET response', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/webhooks`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);

    const ep = body[0];
    expect(ep.id).toBe(createdEndpointId);
    expect(ep.secret).toBeUndefined();
    expect(ep.secretHash).toBeUndefined();
  });

  it('4. Get Single Webhook Endpoint via SDK', async () => {
    const ep = await gamiSdk.webhooks.get({
      projectId,
      webhookId: createdEndpointId,
    });

    expect(ep.id).toBe(createdEndpointId);
    expect(ep.name).toBe('Primary Receiver');
    expect(ep.active).toBe(true);
  });

  it('5. Update Webhook Endpoint via SDK', async () => {
    const updated = await gamiSdk.webhooks.update({
      projectId,
      webhookId: createdEndpointId,
      name: 'Primary Receiver Updated',
      events: ['xp.awarded', 'achievement.unlocked', 'level.up', 'challenge.completed', 'webhook.test'],
    });

    expect(updated.name).toBe('Primary Receiver Updated');
    expect(updated.events).toContain('challenge.completed');
  });

  it('6. Rotate Webhook Secret: Returns new secret ONLY ONCE', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/webhooks/${createdEndpointId}/rotate-secret`,
      headers: { cookie: ownerCookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.secret).toMatch(/^gami_whsec_[a-f0-9]{64}$/);
    expect(body.secret).not.toBe(createdSecret);

    createdSecret = body.secret;
  });

  it('7. Test Webhook Trigger: Queues webhook.test outbox intent', async () => {
    const testRes = await gamiSdk.webhooks.test({
      projectId,
      webhookId: createdEndpointId,
    });

    expect(testRes.success).toBe(true);
    expect(testRes.deliveriesQueued).toBeGreaterThanOrEqual(1);

    // Verify record in webhook_outbox table
    const outboxRows = await db
      .select()
      .from(webhookOutbox)
      .where(eq(webhookOutbox.endpointId, createdEndpointId));

    expect(outboxRows.length).toBeGreaterThanOrEqual(1);
    expect(outboxRows[0].eventType).toBe('webhook.test');
  });

  it('8. Worker Webhook Dispatcher: Delivers queued webhook to mock server with valid HMAC signature', async () => {
    receivedWebhooks = [];

    // Run worker dispatcher iteration
    const stats = await dispatchPendingWebhooks(50);

    expect(stats.processedCount).toBeGreaterThanOrEqual(1);
    expect(stats.deliveredCount).toBeGreaterThanOrEqual(1);
    expect(receivedWebhooks.length).toBeGreaterThanOrEqual(1);

    const received = receivedWebhooks[0];
    expect(received.headers['content-type']).toBe('application/json');
    expect(received.headers['x-gami-event-type']).toBe('webhook.test');
    expect(received.headers['x-gami-signature']).toBeDefined();

    const signatureHeader = received.headers['x-gami-signature'] as string;
    const isValidSignature = verifyHmacSignature(received.body, createdSecret, signatureHeader);
    expect(isValidSignature).toBe(true);

    expect(received.jsonPayload.type).toBe('webhook.test');
    expect(received.jsonPayload.projectId).toBe(projectId);
    expect('externalUserId' in received.jsonPayload).toBe(true);
  });

  it('9. List Delivery History via SDK', async () => {
    const history = await gamiSdk.webhooks.listDeliveries({
      projectId,
      webhookId: createdEndpointId,
    });

    expect(history.total).toBeGreaterThanOrEqual(1);
    expect(history.deliveries[0].status).toBe('delivered');
  });

  it('10. Replay Delivery via SDK', async () => {
    const history = await gamiSdk.webhooks.listDeliveries({
      projectId,
      webhookId: createdEndpointId,
    });

    const targetDeliveryId = history.deliveries[0].id;

    const replayRes = await gamiSdk.webhooks.replayDelivery({
      projectId,
      webhookId: createdEndpointId,
      deliveryId: targetDeliveryId,
    });

    expect(replayRes.success).toBe(true);
    expect(replayRes.newDeliveryId).toBeDefined();

    // Run dispatcher again to send replayed item
    receivedWebhooks = [];
    const stats = await dispatchPendingWebhooks(50);
    expect(stats.deliveredCount).toBeGreaterThanOrEqual(1);
    expect(receivedWebhooks.length).toBeGreaterThanOrEqual(1);
  });

  it('11. Soft-deactivate Webhook Endpoint via SDK', async () => {
    const delRes = await gamiSdk.webhooks.delete({
      projectId,
      webhookId: createdEndpointId,
    });

    expect(delRes.success).toBe(true);

    const ep = await gamiSdk.webhooks.get({
      projectId,
      webhookId: createdEndpointId,
    });

    expect(ep.active).toBe(false);
  });
});
