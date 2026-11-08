import { createVerify, generateKeyPairSync } from 'crypto';
import { encryptSecret } from '@gami/webhooks';
import { describe, expect, it, vi } from 'vitest';
import {
  ApnsPushProvider,
  FcmPushProvider,
  parseApnsCredentials,
  parseServiceAccount,
  signJwt,
  type ApnsTransport,
  type DeviceStore,
  type PushDevice,
} from '../index.js';

const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString());

function storeWith(devices: PushDevice[]) {
  const removed: string[] = [];
  const store: DeviceStore = {
    list: async (_project, _user, platform) => devices.filter((device) => device.platform === platform),
    remove: async (_project, token) => void removed.push(token),
  };
  return { store, removed };
}

const message = {
  eventType: 'level_up',
  userId: 'usr_1',
  title: 'Level 5!',
  body: 'You reached Level 5',
  metadata: { level: 5, nested: { skipped: true } },
};

describe('signJwt', () => {
  it('produces a token the matching public key verifies', () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwt = signJwt('RS256', { kid: 'k1' }, { iss: 'me' }, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string);
    const [header, claims, signature] = jwt.split('.') as [string, string, string];

    expect(decode(header)).toEqual({ alg: 'RS256', typ: 'JWT', kid: 'k1' });
    expect(decode(claims)).toEqual({ iss: 'me' });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it('signs ES256 in the raw form Apple expects', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const [header, claims, signature] = signJwt('ES256', {}, { iss: 'team' }, privateKey).split('.') as [string, string, string];

    expect(Buffer.from(signature, 'base64url')).toHaveLength(64); // r and s, 32 bytes each
    const verifier = createVerify('SHA256');
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
  });
});

describe('FCM', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const account = {
    client_email: 'push@acme.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    project_id: 'acme-app',
  };
  const config = { projectId: 'prj_1', encryptedCredentials: encryptSecret(JSON.stringify(account)) };

  /** Answers the token request, then each send with the next prepared response. */
  function fakeGoogle(sends: Response[]) {
    const calls: { url: string; init: RequestInit }[] = [];
    const http = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init as RequestInit });
      if (String(url).includes('oauth2')) {
        return new Response(JSON.stringify({ access_token: 'ya29.token', expires_in: 3600 }), { status: 200 });
      }
      return sends.shift() ?? new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    return { http, calls };
  }

  it('reads a service account and rejects other text', () => {
    expect(parseServiceAccount(JSON.stringify(account))?.project_id).toBe('acme-app');
    expect(parseServiceAccount('not json')).toBeNull();
    expect(parseServiceAccount('{"client_email":"x"}')).toBeNull();
  });

  it('accepts a real key and refuses a broken one', async () => {
    const provider = new FcmPushProvider(storeWith([]).store);
    expect(await provider.validateConfig(config)).toBe(true);
    expect(await provider.validateConfig({ ...config, encryptedCredentials: encryptSecret(JSON.stringify({ ...account, private_key: 'nope' })) })).toBe(false);
    expect(await provider.validateConfig({})).toBe(false);
  });

  it('gets a token signed by the service account, then sends to each Android device', async () => {
    const { http, calls } = fakeGoogle([]);
    const { store } = storeWith([
      { token: 'tokenA', platform: 'android' },
      { token: 'tokenB', platform: 'android' },
      { token: 'iphone', platform: 'ios' },
    ]);
    const result = await new FcmPushProvider(store, http).sendNotification(config, message);

    expect(result.success).toBe(true);
    const tokenRequest = calls[0]!;
    const assertion = new URLSearchParams(tokenRequest.init.body as URLSearchParams).get('assertion')!;
    const [header, claims, signature] = assertion.split('.') as [string, string, string];
    expect(decode(claims)).toMatchObject({ iss: account.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging' });
    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true);

    const sends = calls.slice(1);
    expect(sends).toHaveLength(2); // the iPhone is left to APNs
    expect(sends[0]!.url).toBe('https://fcm.googleapis.com/v1/projects/acme-app/messages:send');
    expect((sends[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer ya29.token');
    expect(JSON.parse(sends[0]!.init.body as string).message).toEqual({
      token: 'tokenA',
      notification: { title: 'Level 5!', body: 'You reached Level 5' },
      data: { type: 'level_up', level: '5' }, // only simple values are passed on
    });
  });

  it('reuses the access token for later messages', async () => {
    const { http, calls } = fakeGoogle([]);
    const provider = new FcmPushProvider(storeWith([{ token: 'tokenA', platform: 'android' }]).store, http);
    await provider.sendNotification(config, message);
    await provider.sendNotification(config, message);
    expect(calls.filter((call) => call.url.includes('oauth2'))).toHaveLength(1);
  });

  it('forgets a device Google no longer knows, and still succeeds for the rest', async () => {
    const { http } = fakeGoogle([new Response('{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 })]);
    const { store, removed } = storeWith([
      { token: 'stale', platform: 'android' },
      { token: 'fresh', platform: 'android' },
    ]);
    const result = await new FcmPushProvider(store, http).sendNotification(config, message);
    expect(result.success).toBe(true);
    expect(removed).toEqual(['stale']);
  });

  it('asks for a retry on a server error, and not on a rejected request', async () => {
    const devices = [{ token: 'tokenA', platform: 'android' as const }];
    const down = fakeGoogle([new Response('unavailable', { status: 503 })]);
    expect(await new FcmPushProvider(storeWith(devices).store, down.http).sendNotification(config, message)).toMatchObject({ success: false, retryable: true });
    const bad = fakeGoogle([new Response('bad payload', { status: 400 })]);
    expect(await new FcmPushProvider(storeWith(devices).store, bad.http).sendNotification(config, message)).toMatchObject({ success: false, retryable: false });
  });

  it('does nothing for a user with no Android devices, or an event that is turned off', async () => {
    const { http, calls } = fakeGoogle([]);
    const provider = new FcmPushProvider(storeWith([{ token: 'iphone', platform: 'ios' }]).store, http);
    expect((await provider.sendNotification(config, message)).success).toBe(true);
    expect((await provider.sendNotification({ ...config, enabledEvents: ['xp_awarded'] }, message)).success).toBe(true);
    expect(calls).toHaveLength(0);
  });

  it('checks the credentials work when tested', async () => {
    const good = fakeGoogle([]);
    expect(await new FcmPushProvider(storeWith([]).store, good.http).testConnection(config)).toEqual({ success: true });
    const refused = vi.fn(async () => new Response('invalid_grant', { status: 400 })) as unknown as typeof fetch;
    expect(await new FcmPushProvider(storeWith([]).store, refused).testConnection(config)).toMatchObject({ success: false, retryable: false });
  });
});

describe('APNs', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const credentials = {
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    keyId: 'ABC123DEFG',
    teamId: 'TEAM123456',
    topic: 'com.acme.app',
  };
  const config = { projectId: 'prj_1', encryptedCredentials: encryptSecret(JSON.stringify(credentials)) };

  function fakeApple(statuses: { status: number; body?: string }[] = []) {
    const requests: Parameters<ApnsTransport>[0][] = [];
    const transport: ApnsTransport = async (request) => {
      requests.push(request);
      const next = statuses.shift() ?? { status: 200 };
      return { status: next.status, body: next.body ?? '' };
    };
    return { transport, requests };
  }

  it('reads credentials and checks the key is an EC key', async () => {
    expect(parseApnsCredentials(JSON.stringify(credentials))?.keyId).toBe('ABC123DEFG');
    expect(parseApnsCredentials('{"keyId":"x"}')).toBeNull();

    const provider = new ApnsPushProvider(storeWith([]).store, fakeApple().transport);
    expect(await provider.validateConfig(config)).toBe(true);

    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    expect(await provider.validateConfig({ ...config, encryptedCredentials: encryptSecret(JSON.stringify({ ...credentials, privateKey: rsa })) })).toBe(false);
  });

  it('sends the right request with a token Apple can verify', async () => {
    const { transport, requests } = fakeApple();
    const result = await new ApnsPushProvider(storeWith([{ token: 'abcd1234', platform: 'ios' }]).store, transport).sendNotification(config, message);

    expect(result.success).toBe(true);
    const request = requests[0]!;
    expect(request.host).toBe('api.push.apple.com');
    expect(request.path).toBe('/3/device/abcd1234');
    expect(request.headers['apns-topic']).toBe('com.acme.app');
    expect(request.headers['apns-push-type']).toBe('alert');
    expect(JSON.parse(request.body)).toEqual({
      aps: { alert: { title: 'Level 5!', body: 'You reached Level 5' }, sound: 'default' },
      type: 'level_up',
      level: '5',
    });

    const [header, claims, signature] = request.headers.authorization!.replace('bearer ', '').split('.') as [string, string, string];
    expect(decode(header)).toMatchObject({ alg: 'ES256', kid: 'ABC123DEFG' });
    expect(decode(claims)).toMatchObject({ iss: 'TEAM123456' });
    const verifier = createVerify('SHA256');
    verifier.update(`${header}.${claims}`);
    expect(verifier.verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
  });

  it("uses Apple's test servers in sandbox mode, and reuses the signed token", async () => {
    const { transport, requests } = fakeApple();
    const provider = new ApnsPushProvider(storeWith([{ token: 'abcd1234', platform: 'ios' }]).store, transport);
    await provider.sendNotification({ ...config, sandbox: true }, message);
    await provider.sendNotification({ ...config, sandbox: true }, message);
    expect(requests[0]!.host).toBe('api.sandbox.push.apple.com');
    expect(requests[1]!.headers.authorization).toBe(requests[0]!.headers.authorization);
  });

  it('forgets devices Apple says are gone', async () => {
    for (const rejection of [{ status: 410, body: '{"reason":"Unregistered"}' }, { status: 400, body: '{"reason":"BadDeviceToken"}' }]) {
      const { store, removed } = storeWith([{ token: 'gone', platform: 'ios' }]);
      const result = await new ApnsPushProvider(store, fakeApple([rejection]).transport).sendNotification(config, message);
      expect(result.success).toBe(true);
      expect(removed).toEqual(['gone']);
    }
  });

  it('retries on a server error or an expired token, but not on a bad payload', async () => {
    const devices = [{ token: 'abcd1234', platform: 'ios' as const }];
    const retried = await new ApnsPushProvider(storeWith(devices).store, fakeApple([{ status: 503 }]).transport).sendNotification(config, message);
    expect(retried).toMatchObject({ success: false, retryable: true });
    const expired = await new ApnsPushProvider(storeWith(devices).store, fakeApple([{ status: 403, body: '{"reason":"ExpiredProviderToken"}' }]).transport).sendNotification(config, message);
    expect(expired).toMatchObject({ success: false, retryable: true });
    const bad = await new ApnsPushProvider(storeWith(devices).store, fakeApple([{ status: 400, body: '{"reason":"PayloadTooLarge"}' }]).transport).sendNotification(config, message);
    expect(bad).toMatchObject({ success: false, retryable: false });
  });

  it('reports network trouble as retryable', async () => {
    const broken: ApnsTransport = async () => {
      throw new Error('socket hang up');
    };
    const result = await new ApnsPushProvider(storeWith([{ token: 'abcd1234', platform: 'ios' }]).store, broken).sendNotification(config, message);
    expect(result).toMatchObject({ success: false, retryable: true });
  });
});
