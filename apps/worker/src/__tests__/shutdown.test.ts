import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { startMaintenance, stopMaintenance } from '../maintenance.js';
import { isOutboxPolling, startOutboxPoller, stopOutboxPoller } from '../outbox-poller.js';

describe('Worker shutdown', () => {
  beforeAll(() => {
    // A slow or unreachable service must not make this wait for the default limit.
    process.env['OUTBOX_STEP_TIMEOUT_MS'] = '8000';
  });

  afterAll(() => {
    delete process.env['OUTBOX_STEP_TIMEOUT_MS'];
  });

  afterEach(async () => {
    await stopOutboxPoller();
    await stopMaintenance();
  });

  it('waits for a poll that is already running before the poller counts as stopped', async () => {
    startOutboxPoller(5);

    // Stop at a moment when a poll is in progress, which is the case shutdown must handle.
    const deadline = Date.now() + 10_000;
    while (!isOutboxPolling() && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    expect(isOutboxPolling()).toBe(true);

    await stopOutboxPoller();
    expect(isOutboxPolling()).toBe(false);
  }, 120_000);

  it('can be stopped when nothing is running, and more than once', async () => {
    await stopOutboxPoller();
    await stopOutboxPoller();
    await stopMaintenance();
    await stopMaintenance();
  });

  it('waits for the retention pass it started', async () => {
    startMaintenance();
    await stopMaintenance();
  }, 30_000);
});
