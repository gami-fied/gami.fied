import { createDecipheriv, createECDH, createPublicKey, createVerify, hkdfSync } from 'crypto';
import { encryptSecret } from '@gami/webhooks';
import { describe, expect, it, vi } from 'vitest';
import { encryptForBrowser, generateVapidKeys, isPushEndpoint, validVapidKeys, vapidAuthorization, WebPushProvider } from '../providers/push/webpush.js';
import type { DeviceStore, PushDevice } from '../providers/push/types.js';

const unb64 = (value: string) => Buffer.from(value, 'base64url');

/** What a browser does with a push message: the other half of RFC 8291, written separately from the sender. */
function decryptAsBrowser(body: Buffer, browser: ReturnType<typeof createECDH>, authSecret: Buffer): string {
  const salt = body.subarray(0, 16);
  const keyLength = body[20]!;
  const senderKey = body.subarray(21, 21 + keyLength);
  const sealed = body.subarray(21 + keyLength);
  const shared = browser.computeSecret(senderKey);
  const inputKey = Buffer.from(hkdfSync('sha256', shared, authSecret, Buffer.concat([Buffer.from('WebPush: info\0'), browser.getPublicKey(), senderKey]), 32));
  const key = Buffer.from(hkdfSync('sha256', inputKey, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', inputKey, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const decipher = createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const padded = Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  expect(padded[padded.length - 1]).toBe(2);
  return padded.subarray(0, padded.length - 1).toString();
}

describe('web push encryption', () => {
  it('produces the message in the worked example of RFC 8291', () => {
    // Appendix A of the standard: fixed keys and salt, and the exact bytes they must give.
    const sender = createECDH('prime256v1');
    sender.setPrivateKey(unb64('yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw'));
    const body = encryptForBrowser(
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      Buffer.from('When I grow up, I want to be a watermelon'),
      unb64('DGv6ra1nlYgDCS1FRnbzlw'),
      sender
    );
    expect(body.toString('base64url')).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN'
    );
  });

  it('can be read by the browser it was made for, and by no other', () => {
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    const auth = Buffer.from('0123456789abcdef');
    const body = encryptForBrowser({ p256dh: browser.getPublicKey().toString('base64url'), auth: auth.toString('base64url') }, Buffer.from('{"title":"Level 7"}'));
    expect(decryptAsBrowser(body, browser, auth)).toBe('{"title":"Level 7"}');

    const other = createECDH('prime256v1');
    other.generateKeys();
    expect(() => decryptAsBrowser(body, other, auth)).toThrow();
    expect(() => decryptAsBrowser(body, browser, Buffer.from('fedcba9876543210'))).toThrow();
  });

  it('refuses keys that are not what a browser gives', () => {
    expect(() => encryptForBrowser({ p256dh: 'AAAA', auth: 'BTBZMqHH6r4Tts7J_aSIgg' }, Buffer.from('x'))).toThrow(/public key/);
    const browser = createECDH('prime256v1');
    browser.generateKeys();
    expect(() => encryptForBrowser({ p256dh: browser.getPublicKey().toString('base64url'), auth: 'AAAA' }, Buffer.from('x'))).toThrow(/16 bytes/);
    expect(() => encryptForBrowser({ p256dh: browser.getPublicKey().toString('base64url'), auth: 'BTBZMqHH6r4Tts7J_aSIgg' }, Buffer.alloc(5000))).toThrow(/too long/);
  });
});

describe('the sender keys', () => {
  it('makes a pair that belongs together, and signs for the push service it is sending to', () => {
    const keys = generateVapidKeys('mailto:ops@example.com');
    expect(unb64(keys.publicKey)).toHaveLength(65);
    expect(validVapidKeys(keys)).toBe(true);
    expect(validVapidKeys({ ...keys, publicKey: generateVapidKeys('mailto:a@example.com').publicKey })).toBe(false);
    expect(validVapidKeys({ ...keys, subject: 'ops@example.com' })).toBe(false);
    expect(validVapidKeys({ ...keys, privateKey: 'nonsense' })).toBe(false);

    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, new Date('2026-11-15T00:00:00Z'));
    const [, token, key] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(key).toBe(keys.publicKey);
    const [head, claims, signature] = token!.split('.');
    expect(JSON.parse(unb64(claims!).toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1794700800 + 12 * 3600, sub: 'mailto:ops@example.com' });

    // The push service checks the signature with the public key the browser subscribed with.
    const raw = unb64(keys.publicKey);
    const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') } });
    const verifier = createVerify('SHA256');
    verifier.update(`${head}.${claims}`);
    expect(verifier.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, unb64(signature!))).toBe(true);
  });
});

describe('where a subscription may point', () => {
  it('accepts browser push services and nothing else', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/abc')).toBe(true);
    expect(isPushEndpoint('https://db5p.notify.windows.com/w/?token=abc')).toBe(true);

    for (const bad of [
      'http://fcm.googleapis.com/fcm/send/abc',
      'https://localhost/x',
      'https://169.254.169.254/latest/meta-data',
      'https://10.0.0.5/internal',
      'https://fcm.googleapis.com.evil.example/x',
      'https://evilfcm.googleapis.com.example/x',
      'https://user:pass@fcm.googleapis.com/x',
      'not a url',
    ]) {
      expect(isPushEndpoint(bad), bad).toBe(false);
    }
    expect(isPushEndpoint('https://push.internal.example/x', ['push.internal.example'])).toBe(true);
  });
});

describe('WebPushProvider', () => {
  const browser = createECDH('prime256v1');
  browser.generateKeys();
  const auth = Buffer.from('0123456789abcdef');
  const subscription = { p256dh: browser.getPublicKey().toString('base64url'), auth: auth.toString('base64url') };
  const keys = generateVapidKeys('mailto:ops@example.com');
  const config = { encryptedCredentials: encryptSecret(JSON.stringify(keys)), projectId: 'prj_1', enabledEvents: ['level_up'] };
  const message = { eventType: 'level_up', title: 'Level 7', body: 'You are now an Explorer.', userId: 'usr_1', projectId: 'prj_1', metadata: { level: 7 } } as never;

  const store = (devices: PushDevice[]) => {
    const removed: string[] = [];
    const devicesStore: DeviceStore = { list: async (_project, _user, platform) => devices.filter((device) => device.platform === platform), remove: async (_project, token) => void removed.push(token) };
    return { devicesStore, removed };
  };

  it('sends an encrypted, signed message the browser can read', async () => {
    const { devicesStore } = store([{ token: 'https://fcm.googleapis.com/fcm/send/abc', platform: 'web', keys: subscription }]);
    const http = vi.fn(async () => new Response(null, { status: 201 }));
    const result = await new WebPushProvider(devicesStore, http as never).sendNotification(config, message);
    expect(result.success).toBe(true);

    const [url, init] = http.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://fcm.googleapis.com/fcm/send/abc');
    expect(init.headers['Content-Encoding']).toBe('aes128gcm');
    expect(init.headers['Authorization']).toMatch(/^vapid t=.+, k=/);
    expect(init.headers['TTL']).toBe('86400');
    const shown = JSON.parse(decryptAsBrowser(Buffer.from(init.body as Uint8Array), browser, auth));
    expect(shown).toEqual({ title: 'Level 7', body: 'You are now an Explorer.', data: { type: 'level_up', level: '7' } });
  });

  it('forgets a browser that unsubscribed, keeps one that is only unreachable, and never calls a strange address', async () => {
    const gone = store([{ token: 'https://fcm.googleapis.com/fcm/send/gone', platform: 'web', keys: subscription }]);
    const result = await new WebPushProvider(gone.devicesStore, (async () => new Response('', { status: 410 })) as never).sendNotification(config, message);
    expect(result.success).toBe(true);
    expect(gone.removed).toEqual(['https://fcm.googleapis.com/fcm/send/gone']);

    const busy = store([{ token: 'https://fcm.googleapis.com/fcm/send/busy', platform: 'web', keys: subscription }]);
    const later = await new WebPushProvider(busy.devicesStore, (async () => new Response('slow down', { status: 429 })) as never).sendNotification(config, message);
    expect(later).toMatchObject({ success: false, retryable: true });
    expect(busy.removed).toEqual([]);

    const inside = store([{ token: 'https://10.0.0.5/admin', platform: 'web', keys: subscription }]);
    const http = vi.fn();
    await new WebPushProvider(inside.devicesStore, http as never).sendNotification(config, message);
    expect(http).not.toHaveBeenCalled();
    expect(inside.removed).toEqual(['https://10.0.0.5/admin']);
  });

  it('sends nothing for an event that is turned off, or to a player with no browser', async () => {
    const { devicesStore } = store([{ token: 'https://fcm.googleapis.com/fcm/send/abc', platform: 'web', keys: subscription }]);
    const http = vi.fn();
    const provider = new WebPushProvider(devicesStore, http as never);
    expect((await provider.sendNotification(config, { ...(message as object), eventType: 'xp_awarded' } as never)).success).toBe(true);
    expect((await new WebPushProvider(store([]).devicesStore, http as never).sendNotification(config, message)).success).toBe(true);
    expect(http).not.toHaveBeenCalled();
    expect(await provider.validateConfig(config)).toBe(true);
    expect(await provider.validateConfig({ encryptedCredentials: encryptSecret('{}') })).toBe(false);
    expect((await provider.testConnection(config)).success).toBe(true);
  });
});
