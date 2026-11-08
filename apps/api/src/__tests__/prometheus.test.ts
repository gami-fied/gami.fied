import { runMigrations } from '@gami/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { clearMetricsCache } from '../system/prometheus.js';

describe('GET /metrics', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  const token = 'test-metrics-token-0123456789';

  beforeAll(async () => {
    process.env['METRICS_BEARER_TOKEN'] = token;
    await runMigrations();
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    delete process.env['METRICS_BEARER_TOKEN'];
    await app.close();
  });

  it('refuses requests with no credentials', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics' });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('refuses a wrong token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: 'Bearer wrong-token-0123456789012345' },
    });
    expect([401, 403]).toContain(res.statusCode);
  });

  it('serves Prometheus text to the right token', async () => {
    clearMetricsCache();
    const res = await app.inject({
      method: 'GET',
      url: '/metrics',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');
    for (const name of [
      'gami_info',
      'gami_database_up 1',
      'gami_worker_up',
      'gami_outbox_rows{queue="event",status="pending"}',
      'gami_outbox_oldest_pending_seconds{queue="webhook"}',
      'gami_process_uptime_seconds',
    ]) {
      expect(res.body).toContain(name);
    }
    expect(res.body).toContain('# TYPE gami_outbox_rows gauge');
  }, 30_000);
});
