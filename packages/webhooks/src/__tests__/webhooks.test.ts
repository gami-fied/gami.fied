import { describe, expect, it } from 'vitest';
import {
  buildWebhookPayload,
  calculateHmacSignature,
  generateWebhookSecret,
  hashSecret,
  isPrivateOrBlockedIp,
  validateWebhookUrl,
  verifyHmacSignature,
} from '../index.js';

describe('Shared Webhook Package (@gami/webhooks) Unit Tests', () => {
  it('1. Secret generation returns gami_whsec_ prefixed string', () => {
    const secret = generateWebhookSecret();
    expect(secret).toMatch(/^gami_whsec_[a-f0-9]{64}$/);
  });

  it('2. Secret hashing produces SHA-256 hash', () => {
    const secret = 'gami_whsec_test12345';
    const hash = hashSecret(secret);
    expect(hash).toHaveLength(64);
    expect(hash).not.toBe(secret);
  });

  it('3. Calculates HMAC-SHA256 signature over raw payload', () => {
    const rawBody = JSON.stringify({ event: 'test', amount: 100 });
    const secret = 'gami_whsec_secret123';
    const sig = calculateHmacSignature(rawBody, secret);
    expect(sig).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('4. Signature verification succeeds with matching signature and fails with invalid signature', () => {
    const rawBody = '{"hello":"world"}';
    const secret = 'gami_whsec_secret123';
    const sig = calculateHmacSignature(rawBody, secret);

    expect(verifyHmacSignature(rawBody, secret, sig)).toBe(true);
    expect(verifyHmacSignature(rawBody, 'wrong_secret', sig)).toBe(false);
    expect(verifyHmacSignature('{"tampered":true}', secret, sig)).toBe(false);
    expect(verifyHmacSignature(rawBody, secret, 'invalid_format')).toBe(false);
  });

  it('5. Builds deterministic WebhookPayload with externalUserId', () => {
    const payload = buildWebhookPayload({
      eventId: 'evt_123',
      eventType: 'xp.awarded',
      projectId: 'prj_456',
      userId: 'usr_789',
      externalUserId: 'ext_user_abc',
      data: { amount: 50 },
    });

    expect(payload.id).toBe('evt_123');
    expect(payload.type).toBe('xp.awarded');
    expect(payload.projectId).toBe('prj_456');
    expect(payload.userId).toBe('usr_789');
    expect(payload.externalUserId).toBe('ext_user_abc');
    expect(payload.data.amount).toBe(50);
    expect(payload.createdAt).toBeDefined();
  });

  it('6. SSRF Protection: Blocks loopback, private RFC1918, link-local, and cloud metadata IPs', () => {
    expect(isPrivateOrBlockedIp('127.0.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('172.16.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('192.168.1.1')).toBe(true);
    expect(isPrivateOrBlockedIp('169.254.169.254')).toBe(true);
    expect(isPrivateOrBlockedIp('::1')).toBe(true);
    expect(isPrivateOrBlockedIp('fe80::1')).toBe(true);

    // Public IP addresses allowed
    expect(isPrivateOrBlockedIp('8.8.8.8')).toBe(false);
    expect(isPrivateOrBlockedIp('1.1.1.1')).toBe(false);
    expect(isPrivateOrBlockedIp('93.184.216.34')).toBe(false);
  });

  it('7. URL validation rejects non-HTTP(S) protocols and forbidden hostnames', async () => {
    const ftpRes = await validateWebhookUrl('ftp://example.com/webhook');
    expect(ftpRes.valid).toBe(false);

    const localRes = await validateWebhookUrl('http://localhost:3000/webhook');
    expect(localRes.valid).toBe(false);

    const metaRes = await validateWebhookUrl('http://169.254.169.254/latest/meta-data');
    expect(metaRes.valid).toBe(false);
  });
});
