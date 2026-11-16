import { createCipheriv, createECDH, createPrivateKey, createPublicKey, generateKeyPairSync, hkdfSync, randomBytes, type KeyObject } from 'crypto';
import { decryptSecret } from '@gami/webhooks';
import type { IntegrationProvider } from '../../provider.js';
import type { IntegrationConfig, IntegrationDeliveryResult, IntegrationMessage, IntegrationProviderType } from '../../types.js';
import { signJwt } from './jwt.js';
import { toPushContent, type DeviceStore, type PushContent, type SendOutcome } from './types.js';

/*
 * Web Push for browsers, with no third-party service in between: the message is encrypted for the
 * one browser it is going to (RFC 8291, `aes128gcm`) and the request is signed with the project's
 * own key pair (VAPID, RFC 8292), so the browser's push service can tell who is sending.
 */

/** What a browser hands over when the player allows notifications. */
export interface WebPushSubscription {
  endpoint: string;
  /** The browser's public key, base64url, 65 bytes. */
  p256dh: string;
  /** The browser's shared secret, base64url, 16 bytes. */
  auth: string;
}

export interface VapidKeys {
  /** Base64url, 65 bytes. This is the `applicationServerKey` a browser subscribes with. It is not a secret. */
  publicKey: string;
  /** PKCS#8 PEM. Keep it secret. */
  privateKey: string;
  /** Who the push service can contact about this sender: `mailto:` or `https:`. */
  subject: string;
}

const b64 = (value: Buffer) => value.toString('base64url');
const unb64 = (value: string) => Buffer.from(value, 'base64url');

/** The push services browsers use. A subscription that points anywhere else is refused. */
export const DEFAULT_PUSH_HOSTS = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'notify.windows.com', 'push.apple.com'];

/**
 * Whether an endpoint is a browser push service. The server sends a request to this address, so
 * without the check a player could point it at something inside your network.
 */
export function isPushEndpoint(endpoint: string, allowed: string[] = pushHosts()): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return allowed.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/** `WEB_PUSH_ALLOWED_HOSTS` adds to the built-in list, comma separated. */
export function pushHosts(): string[] {
  const extra = (process.env['WEB_PUSH_ALLOWED_HOSTS'] ?? '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return [...DEFAULT_PUSH_HOSTS, ...extra];
}

/** Makes a new key pair for a project. */
export function generateVapidKeys(subject: string): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), unb64(jwk.x as string), unb64(jwk.y as string)]);
  return { publicKey: b64(raw), privateKey: privateKey.export({ format: 'pem', type: 'pkcs8' }).toString(), subject };
}

/** Checks that keys are a real P-256 pair that belong together, and that the subject is a contact. */
export function validVapidKeys(keys: Partial<VapidKeys> | null): keys is VapidKeys {
  if (!keys || typeof keys.publicKey !== 'string' || typeof keys.privateKey !== 'string' || typeof keys.subject !== 'string') return false;
  if (!/^(mailto:[^\s@]+@[^\s@]+|https:\/\/\S+)$/.test(keys.subject)) return false;
  try {
    const jwk = createPublicKey(createPrivateKey(keys.privateKey)).export({ format: 'jwk' });
    if (jwk.crv !== 'P-256') return false;
    const raw = Buffer.concat([Buffer.from([4]), unb64(jwk.x as string), unb64(jwk.y as string)]);
    return b64(raw) === keys.publicKey;
  } catch {
    return false;
  }
}

/**
 * Encrypts a message for one browser (RFC 8291). Only that browser can read it; the push service
 * that carries it cannot. `salt` and `fixedKey` are for tests: leave them out to get fresh ones.
 */
export function encryptForBrowser(subscription: Pick<WebPushSubscription, 'p256dh' | 'auth'>, plaintext: Buffer, salt: Buffer = randomBytes(16), fixedKey?: ReturnType<typeof createECDH>): Buffer {
  const browserKey = unb64(subscription.p256dh);
  const authSecret = unb64(subscription.auth);
  if (browserKey.length !== 65 || browserKey[0] !== 4) throw new Error('The subscription key is not a P-256 public key');
  if (authSecret.length !== 16) throw new Error('The subscription secret is not 16 bytes');
  // The whole message must fit one 4096-byte record, which is also what push services accept.
  if (plaintext.length > 3900) throw new Error('The message is too long for a push');

  // A fresh key pair for every message, as the standard asks.
  const local = fixedKey ?? createECDH('prime256v1');
  if (!fixedKey) local.generateKeys();
  const localKey = local.getPublicKey();
  const shared = local.computeSecret(browserKey);

  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), browserKey, localKey]);
  const inputKey = Buffer.from(hkdfSync('sha256', shared, authSecret, keyInfo, 32));
  const contentKey = Buffer.from(hkdfSync('sha256', inputKey, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', inputKey, salt, Buffer.from('Content-Encoding: nonce\0'), 12));

  const cipher = createCipheriv('aes-128-gcm', contentKey, nonce);
  // 0x02 marks the end of the last (and only) record.
  const sealed = Buffer.concat([cipher.update(Buffer.concat([plaintext, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);

  const recordSize = Buffer.alloc(4);
  recordSize.writeUInt32BE(4096);
  return Buffer.concat([salt, recordSize, Buffer.from([localKey.length]), localKey, sealed]);
}

/** The `Authorization` header that tells a push service who is sending (RFC 8292). */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, now: Date = new Date(), key: KeyObject = createPrivateKey(keys.privateKey)): string {
  const token = signJwt('ES256', {}, { aud: new URL(endpoint).origin, exp: Math.floor(now.getTime() / 1000) + 12 * 3600, sub: keys.subject }, key);
  return `vapid t=${token}, k=${keys.publicKey}`;
}

type Fetch = typeof fetch;

/** Sends browser notifications. One integration per project holds its key pair. */
export class WebPushProvider implements IntegrationProvider {
  public readonly type: IntegrationProviderType = 'webpush';

  constructor(
    private readonly devices: DeviceStore,
    private readonly http: Fetch = fetch
  ) {}

  private keys(config: IntegrationConfig): VapidKeys | null {
    const encrypted = config['encryptedCredentials'];
    if (typeof encrypted !== 'string') return null;
    try {
      const parsed = JSON.parse(decryptSecret(encrypted)) as Partial<VapidKeys>;
      return validVapidKeys(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  public async validateConfig(config: IntegrationConfig): Promise<boolean> {
    return this.keys(config) !== null;
  }

  private async sendOne(keys: VapidKeys, subscription: WebPushSubscription, content: PushContent): Promise<SendOutcome> {
    // Checked again here, in case the list of allowed services changed since the browser registered.
    if (!isPushEndpoint(subscription.endpoint)) return { ok: false, error: 'The subscription does not point at a browser push service', retryable: false, invalidToken: true };

    let body: Buffer;
    try {
      body = encryptForBrowser(subscription, Buffer.from(JSON.stringify({ title: content.title, body: content.body, data: content.data })));
    } catch (err) {
      return { ok: false, error: (err as Error).message, retryable: false, invalidToken: true };
    }

    let response: Response;
    try {
      response = await this.http(subscription.endpoint, {
        method: 'POST',
        headers: {
          Authorization: vapidAuthorization(subscription.endpoint, keys),
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          // How long the push service keeps it for a browser that is closed: one day.
          TTL: '86400',
          Urgency: 'normal',
        },
        body: new Uint8Array(body),
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      return { ok: false, error: `The push service could not be reached: ${(err as Error).message}`, retryable: true };
    }
    if (response.ok) return { ok: true };

    // 404 and 410 mean the player turned notifications off or the subscription expired.
    if (response.status === 404 || response.status === 410) return { ok: false, error: 'The browser is no longer subscribed', retryable: false, invalidToken: true };
    const text = await response.text().catch(() => '');
    return { ok: false, error: `The push service returned ${response.status}: ${text.slice(0, 160)}`, retryable: response.status >= 500 || response.status === 429 };
  }

  public async sendNotification(config: IntegrationConfig, message: IntegrationMessage): Promise<IntegrationDeliveryResult> {
    if (Array.isArray(config.enabledEvents) && config.enabledEvents.length > 0 && !config.enabledEvents.includes(message.eventType)) {
      return { success: true, error: `Event type "${message.eventType}" is turned off for this integration` };
    }
    const keys = this.keys(config);
    const projectId = typeof config['projectId'] === 'string' ? config['projectId'] : null;
    if (!keys || !projectId) return { success: false, error: 'Web push keys are not saved correctly', retryable: false };

    const devices = await this.devices.list(projectId, message.userId, 'web');
    if (devices.length === 0) return { success: true, error: 'The user has no browsers subscribed' };

    const content = toPushContent(message);
    let delivered = 0;
    let retryable = false;
    let lastError = '';
    for (const device of devices) {
      const outcome: SendOutcome = device.keys
        ? await this.sendOne(keys, { endpoint: device.token, p256dh: device.keys.p256dh, auth: device.keys.auth }, content)
        : { ok: false, error: 'The subscription has no keys', retryable: false, invalidToken: true };
      if (outcome.ok) delivered++;
      else if (outcome.invalidToken) await this.devices.remove(projectId, device.token);
      else {
        lastError = outcome.error;
        retryable ||= outcome.retryable;
      }
    }
    if (delivered > 0 || !lastError) return { success: true, externalMessageId: `webpush_${Date.now()}` };
    return { success: false, error: lastError, retryable };
  }

  /** There is nothing to call without a browser, so this checks that the keys are a working pair. */
  public async testConnection(config: IntegrationConfig): Promise<IntegrationDeliveryResult> {
    const keys = this.keys(config);
    if (!keys) return { success: false, error: 'Web push keys are not saved correctly', retryable: false };
    try {
      vapidAuthorization('https://fcm.googleapis.com/', keys);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message, retryable: false };
    }
  }

  public async disconnect(): Promise<boolean> {
    return true;
  }

  public async getStatus(config: IntegrationConfig) {
    return { connected: await this.validateConfig(config), details: { provider: 'webpush' } };
  }
}
