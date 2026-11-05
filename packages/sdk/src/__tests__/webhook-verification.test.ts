import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { verifyWebhook } from '../webhook-verification.js';

const secret = 'gami_whsec_test';
const rawBody = '{"id":"evt_1"}';
const now = new Date('2026-11-05T12:00:00.000Z');
const timestamp = String(Math.floor(now.getTime() / 1000));

const sign = (key: string, stamp = timestamp, body = rawBody) =>
  `sha256=${createHmac('sha256', key).update(`${stamp}.${body}`).digest('hex')}`;

describe('verifyWebhook', () => {
  it('accepts a valid signature', async () => {
    const signature = sign(secret);
    await expect(verifyWebhook({ rawBody, secret, timestamp, signature, now })).resolves.toBe(true);
  });

  it('accepts either signature during a secret rotation', async () => {
    const signature = `${sign('new_secret')},${sign(secret)}`;
    await expect(verifyWebhook({ rawBody, secret, timestamp, signature, now })).resolves.toBe(true);
  });

  it('rejects a changed body', async () => {
    const signature = sign(secret);
    await expect(
      verifyWebhook({ rawBody: '{"id":"evt_2"}', secret, timestamp, signature, now })
    ).resolves.toBe(false);
  });

  it('rejects an old delivery, which stops replay attacks', async () => {
    const oldStamp = String(Number(timestamp) - 301);
    const signature = sign(secret, oldStamp);
    await expect(
      verifyWebhook({ rawBody, secret, timestamp: oldStamp, signature, now })
    ).resolves.toBe(false);
  });

  it('rejects a timestamp that does not match what was signed', async () => {
    const signature = sign(secret, String(Number(timestamp) - 60));
    await expect(verifyWebhook({ rawBody, secret, timestamp, signature, now })).resolves.toBe(false);
  });

  it.each(['', 'sha256=', 'sha256=zz', 'md5=abcd'])('rejects the malformed value "%s"', async (signature) => {
    await expect(verifyWebhook({ rawBody, secret, timestamp, signature, now })).resolves.toBe(false);
  });
});
