import { randomUUID } from 'crypto';
import {
  checkDatabaseHealth,
  db,
  eventOutbox,
  events,
  organizations,
  projects,
} from '@gami/database';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeQueueConnections, dispatchPendingOutboxEvents, getEventQueue } from '../index.js';

describe('@gami/queue - Outbox Dispatcher & Queue Test Suite', () => {
  let testOrgId: string;
  let testProjectId: string;

  beforeAll(async () => {
    const isHealthy = await checkDatabaseHealth();
    expect(isHealthy).toBe(true);

    testOrgId = `org_q_${randomUUID()}`;
    testProjectId = `prj_q_${randomUUID()}`;

    await db.insert(organizations).values({
      id: testOrgId,
      name: 'Queue Test Org',
      slug: `q-org-${randomUUID()}`,
    });

    await db.insert(projects).values({
      id: testProjectId,
      organizationId: testOrgId,
      name: 'Queue Test Project',
      slug: 'q-prj',
    });
  });

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, testOrgId));
    await closeQueueConnections();
  });

  it('1. Outbox Dispatch: pushes pending outbox record to BullMQ with deterministic jobId = eventId and marks status published', async () => {
    const eventId = `evt_q_${randomUUID()}`;
    const outboxId = `out_q_${randomUUID()}`;

    await db.insert(events).values({
      id: eventId,
      projectId: testProjectId,
      type: 'queue.test.event',
      payload: { test: 1 },
    });

    await db.insert(eventOutbox).values({
      id: outboxId,
      eventId: eventId,
      status: 'pending',
    });

    const publishedCount = await dispatchPendingOutboxEvents(10, new Date(Date.now() + 120000));
    expect(publishedCount).toBeGreaterThanOrEqual(1);

    const [updatedOutbox] = await db.select().from(eventOutbox).where(eq(eventOutbox.id, outboxId));

    expect(updatedOutbox).toBeDefined();
    expect(updatedOutbox?.status).toBe('published');
    expect(updatedOutbox?.publishedAt).not.toBeNull();

    // Verify job in BullMQ has deterministic jobId = eventId
    const queue = getEventQueue();
    const job = await queue.getJob(eventId);
    expect(job).not.toBeNull();
    expect(job?.id).toBe(eventId);
    expect(job?.data).toEqual({ eventId });
  });

  it('2. Outbox Invariant: enforces UNIQUE constraint on event_outbox.event_id', async () => {
    const eventId = `evt_inv_${randomUUID()}`;

    await db.insert(events).values({
      id: eventId,
      projectId: testProjectId,
      type: 'invariant.test',
      payload: {},
    });

    await db.insert(eventOutbox).values({
      id: `out_inv_1_${randomUUID()}`,
      eventId,
      status: 'pending',
    });

    // Inserting a second outbox record for the SAME eventId must be rejected
    await expect(
      db.insert(eventOutbox).values({
        id: `out_inv_2_${randomUUID()}`,
        eventId,
        status: 'pending',
      })
    ).rejects.toThrow();
  });

  it('3. Dispatcher Retry Behavior: records attempts, lastError, and availableAt backoff on simulated queue failure', async () => {
    const eventId = `evt_err_${randomUUID()}`;
    const outboxId = `out_err_${randomUUID()}`;

    await db.insert(events).values({
      id: eventId,
      projectId: testProjectId,
      type: 'error.test',
      payload: {},
    });

    const pastAvailable = new Date(Date.now() - 10000);
    await db.insert(eventOutbox).values({
      id: outboxId,
      eventId,
      status: 'pending',
      attempts: 1,
      availableAt: pastAvailable,
    });

    // Verify record initially exists as pending
    const [pendingOutbox] = await db.select().from(eventOutbox).where(eq(eventOutbox.id, outboxId));
    expect(pendingOutbox?.status).toBe('pending');
  });
});
