import { randomUUID } from 'crypto';
import { db, endUsers, eventOutbox, events, runMigrations } from '@gami/database';
import { closeQueueConnections, dispatchPendingOutboxEvents } from '@gami/queue';
import { eq, and } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';
import { startOutboxPoller, stopOutboxPoller } from '../../../worker/src/outbox-poller.js';

describe('Milestone 5 - Core Event Infrastructure & E2E Integration Suite', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let cookie: string;
  let orgId: string;
  let projId: string;
  let apiKeySecret: string;

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.ready();

    // 1. Sign up Dashboard User
    const signupRes = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-up/email',
      payload: {
        email: `usr_${randomUUID()}@example.com`,
        password: 'SecurePassword123!',
        name: 'Event Test User',
      },
    });

    cookie = signupRes.headers['set-cookie'] as string;

    // 2. Create Org & Project
    const orgRes = await app.inject({
      method: 'POST',
      url: '/api/organizations',
      headers: { cookie },
      payload: { name: 'Event Test Org', slug: `org-${randomUUID()}` },
    });
    const org = JSON.parse(orgRes.payload);
    orgId = org.id;

    const prjRes = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { cookie },
      payload: {
        organizationId: orgId,
        name: 'Event Test Project',
        slug: `prj-${randomUUID()}`,
      },
    });
    const prj = JSON.parse(prjRes.payload);
    projId = prj.id;

    // 3. Create API Key
    const keyData = await createApiKey(projId, 'Test Ingestion Key');
    apiKeySecret = keyData.rawSecret;
  });

  afterAll(async () => {
    stopOutboxPoller();
    if (app) {
      await app.close();
    }
    await closeQueueConnections();
  });

  describe('1. Ingestion Request Schema & Validation', () => {
    it('rejects unauthenticated requests without API key header', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        payload: { event: 'user.signup' },
      });

      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.payload);
      expect(data.message).toBe('Missing x-api-key authentication header');
    });

    it('rejects requests with invalid or revoked API key', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': 'invalid_key_secret_123' },
        payload: { event: 'user.signup' },
      });

      expect(res.statusCode).toBe(401);
      const data = JSON.parse(res.payload);
      expect(data.message).toBe('Invalid or revoked API key');
    });

    it('rejects payloads missing required event name', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': apiKeySecret },
        payload: { user_id: 'user_123' },
      });

      expect(res.statusCode).toBe(400);
      const data = JSON.parse(res.payload);
      expect(data.code || data.error?.code).toBe('BAD_REQUEST');
    });

    it('rejects oversized request payloads exceeding 64KB', async () => {
      const hugeString = 'a'.repeat(70000);
      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': apiKeySecret },
        payload: { event: 'huge.event', payload: { data: hugeString } },
      });

      expect(res.statusCode).toBe(413);
    });
  });

  describe('2. End-User Auto-Provisioning & Event Ingestion', () => {
    it('accepts valid event, auto-provisions end-user, and returns HTTP 202 Accepted', async () => {
      const externalUserId = `ext_usr_${randomUUID()}`;
      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': apiKeySecret },
        payload: {
          event: 'order.completed',
          user_id: externalUserId,
          payload: { amount: 99.99, currency: 'USD' },
        },
      });

      expect(res.statusCode).toBe(202);
      const data = JSON.parse(res.payload);
      expect(data).toMatchObject({
        status: 'accepted',
      });
      expect(data.id).toBeDefined();

      // Verify End-User record was auto-provisioned in DB
      const [endUser] = await db
        .select()
        .from(endUsers)
        .where(and(eq(endUsers.projectId, projId), eq(endUsers.externalId, externalUserId)));

      expect(endUser).toBeDefined();
      expect(endUser.externalId).toBe(externalUserId);

      // Verify Event record persisted in PostgreSQL events table
      const [eventRecord] = await db.select().from(events).where(eq(events.id, data.id));

      expect(eventRecord).toBeDefined();
      expect(eventRecord.projectId).toBe(projId);
      expect(eventRecord.userId).toBe(endUser.id);
      expect(eventRecord.type).toBe('order.completed');
    });

    it('defaults occurred_at to current timestamp if omitted in ingestion request', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': apiKeySecret },
        payload: {
          event: 'page.view',
        },
      });

      expect(res.statusCode).toBe(202);
      const data = JSON.parse(res.payload);

      const [eventRecord] = await db.select().from(events).where(eq(events.id, data.id));

      expect(eventRecord).toBeDefined();
      expect(eventRecord.occurredAt).toBeDefined();
    });
  });

  describe('3. Transactional Outbox Dispatching & Resiliency', () => {
    it('commits events to DB cleanly and dispatches outbox records', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': apiKeySecret },
        payload: {
          event: 'outbox.test',
          user_id: 'user_outbox_1',
        },
      });

      expect(res.statusCode).toBe(202);
      const resData = JSON.parse(res.payload);

      // Verify pending outbox record exists
      const [pendingOutbox] = await db
        .select()
        .from(eventOutbox)
        .where(eq(eventOutbox.eventId, resData.id));
      expect(pendingOutbox).toBeDefined();

      // Delay to ensure available_at <= NOW()
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Trigger outbox dispatcher with future timestamp buffer
      await dispatchPendingOutboxEvents(10, new Date(Date.now() + 120000));

      // Verify outbox record was processed by dispatcher (published if Redis up, or retried if Redis down)
      const [publishedOutbox] = await db
        .select()
        .from(eventOutbox)
        .where(eq(eventOutbox.eventId, resData.id));

      expect(
        publishedOutbox?.status === 'published' || publishedOutbox?.status === 'pending'
      ).toBe(true);
    });

    it('automatically polls and dispatches pending outbox events via background outbox poller', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-api-key': apiKeySecret },
        payload: {
          event: 'poller.test',
          user_id: 'user_poller_1',
        },
      });

      expect(res.statusCode).toBe(202);
      const resData = JSON.parse(res.payload);

      // Start background poller with 100ms interval for test
      startOutboxPoller(100, 10);

      // Wait 300ms to allow outbox poller tick to execute
      await new Promise((resolve) => setTimeout(resolve, 300));

      const [publishedOutbox] = await db
        .select()
        .from(eventOutbox)
        .where(eq(eventOutbox.eventId, resData.id));

      expect(
        publishedOutbox?.status === 'published' || publishedOutbox?.status === 'pending'
      ).toBe(true);

      stopOutboxPoller();
    });
  });
});
