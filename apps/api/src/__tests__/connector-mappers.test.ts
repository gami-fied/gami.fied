import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { eventName, mapConnectorPayload, verifyConnectorRequest } from '../connectors/mappers.js';

describe('connector signatures', () => {
  const body = JSON.stringify({ hello: 'world' });

  it('checks Stripe signatures, and refuses old or altered ones', () => {
    const secret = 'whsec_test';
    const now = new Date('2026-11-08T10:00:00Z');
    const t = Math.floor(now.getTime() / 1000);
    const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    expect(verifyConnectorRequest('stripe', secret, body, { 'stripe-signature': `t=${t},v1=${v1}` }, now)).toBe(true);
    expect(verifyConnectorRequest('stripe', secret, `${body} `, { 'stripe-signature': `t=${t},v1=${v1}` }, now)).toBe(false);
    expect(verifyConnectorRequest('stripe', secret, body, { 'stripe-signature': `t=${t},v1=${v1}` }, new Date(now.getTime() + 600_000))).toBe(false);
    expect(verifyConnectorRequest('stripe', secret, body, {}, now)).toBe(false);
  });

  it('checks GitHub signatures', () => {
    const sig = `sha256=${crypto.createHmac('sha256', 's3cret').update(body).digest('hex')}`;
    expect(verifyConnectorRequest('github', 's3cret', body, { 'x-hub-signature-256': sig })).toBe(true);
    expect(verifyConnectorRequest('github', 'other', body, { 'x-hub-signature-256': sig })).toBe(false);
  });

  it('accepts a bearer token, basic auth or Segment signature for Segment and RudderStack', () => {
    const secret = 'gcs_abc';
    expect(verifyConnectorRequest('segment', secret, body, { authorization: `Bearer ${secret}` })).toBe(true);
    expect(verifyConnectorRequest('rudderstack', secret, body, { authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}` })).toBe(true);
    expect(verifyConnectorRequest('segment', secret, body, { 'x-signature': crypto.createHmac('sha1', secret).update(body).digest('hex') })).toBe(true);
    expect(verifyConnectorRequest('segment', secret, body, { authorization: 'Bearer wrong' })).toBe(false);
    expect(verifyConnectorRequest('segment', secret, body, {})).toBe(false);
  });
});

describe('connector payloads', () => {
  it('turns names from other tools into event types', () => {
    expect(eventName('Order Completed')).toBe('order_completed');
    expect(eventName('signedUp')).toBe('signed_up');
    expect(eventName('github.pull_request.merged')).toBe('github.pull_request.merged');
  });

  it('maps Segment track, identify and batches, and skips anonymous visits unless asked', () => {
    const batch = {
      batch: [
        { type: 'track', event: 'Order Completed', userId: 'u1', messageId: 'm1', properties: { total: 42 }, timestamp: '2026-11-01T00:00:00Z' },
        { type: 'identify', userId: 'u1', traits: { firstName: 'Ada', lastName: 'L', email: 'ada@example.com', plan: 'pro' } },
        { type: 'track', event: 'Viewed', anonymousId: 'a1', messageId: 'm2' },
        { type: 'page', userId: 'u1' },
      ],
    };
    const result = mapConnectorPayload('segment', batch, {}, {});
    expect(result.skipped).toBe(2);
    expect(result.items[0]).toMatchObject({ kind: 'event', type: 'order_completed', userId: 'u1', idempotencyKey: 'segment:m1', payload: { total: 42, source: 'segment' } });
    expect(result.items[1]).toMatchObject({ kind: 'identify', userId: 'u1', name: 'Ada L', email: 'ada@example.com' });

    const withAnon = mapConnectorPayload('rudderstack', batch, {}, { includeAnonymous: true, allowedEvents: ['viewed'] });
    expect(withAnon.items.filter((item) => item.kind === 'event').map((item) => item.userId)).toEqual(['anon:a1']);
  });

  it('maps Stripe events to the user in metadata, or the customer, with amounts in main units', () => {
    const event = { id: 'evt_1', type: 'invoice.paid', created: 1762600000, data: { object: { id: 'in_1', customer: 'cus_9', amount_paid: 4999, currency: 'usd', metadata: { gami_user_id: 'u42' } } } };
    const [item] = mapConnectorPayload('stripe', event, {}, {}).items;
    expect(item).toMatchObject({ kind: 'event', type: 'stripe.invoice.paid', userId: 'u42', idempotencyKey: 'stripe:evt_1', payload: { amount: 49.99, amountCents: 4999, currency: 'USD', customer: 'cus_9' } });
    const noMeta = { ...event, data: { object: { ...event.data.object, metadata: {} } } };
    expect(mapConnectorPayload('stripe', noMeta, {}, {}).items[0]).toMatchObject({ userId: 'cus_9' });
    expect(mapConnectorPayload('stripe', { id: 'x' }, {}, {}).skipped).toBe(1);
  });

  it('maps GitHub events, marking merged pull requests', () => {
    const pr = { action: 'closed', sender: { login: 'octo' }, repository: { full_name: 'acme/app' }, pull_request: { merged: true, number: 7, additions: 10, deletions: 2 } };
    const [item] = mapConnectorPayload('github', pr, { 'x-github-event': 'pull_request', 'x-github-delivery': 'd1' }).items;
    expect(item).toMatchObject({ type: 'github.pull_request.merged', userId: 'octo', idempotencyKey: 'github:d1', payload: { repository: 'acme/app', pullRequest: 7 } });
    expect(mapConnectorPayload('github', {}, { 'x-github-event': 'ping' }).skipped).toBe(1);
    const push = mapConnectorPayload('github', { sender: { login: 'octo' }, commits: [{}, {}] }, { 'x-github-event': 'push' }).items[0];
    expect(push).toMatchObject({ type: 'github.push', payload: { commits: 2 } });
  });
});
