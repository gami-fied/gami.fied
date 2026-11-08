import { createPrivateKey } from 'crypto';
import { connect, constants, type ClientHttp2Session } from 'http2';
import { decryptSecret } from '@gami/webhooks';
import type { IntegrationProvider } from '../../provider.js';
import type { IntegrationConfig, IntegrationDeliveryResult, IntegrationMessage, IntegrationProviderType } from '../../types.js';
import { signJwt } from './jwt.js';
import { toPushContent, type DeviceStore, type PushContent, type SendOutcome } from './types.js';

interface ApnsCredentials {
  /** The contents of the .p8 key file from Apple. */
  privateKey: string;
  keyId: string;
  teamId: string;
  /** The app's bundle ID. */
  topic: string;
}

export function parseApnsCredentials(raw: string): ApnsCredentials | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ApnsCredentials>;
    if (parsed.privateKey && parsed.keyId && parsed.teamId && parsed.topic) return parsed as ApnsCredentials;
  } catch {
    // Not JSON.
  }
  return null;
}

/** Sends one request to Apple and reports the status and body. Replaceable, so tests need no network. */
export type ApnsTransport = (request: {
  host: string;
  path: string;
  headers: Record<string, string>;
  body: string;
}) => Promise<{ status: number; body: string }>;

const sessions = new Map<string, ClientHttp2Session>();

/** Apple wants one long-lived HTTP/2 connection rather than a new one per message. */
function session(host: string): ClientHttp2Session {
  const existing = sessions.get(host);
  if (existing && !existing.closed && !existing.destroyed) return existing;
  const created = connect(`https://${host}`);
  created.on('error', () => sessions.delete(host));
  created.on('close', () => sessions.delete(host));
  created.unref();
  sessions.set(host, created);
  return created;
}

export const defaultTransport: ApnsTransport = ({ host, path, headers, body }) =>
  new Promise((resolve, reject) => {
    const stream = session(host).request({ ':method': 'POST', ':path': path, ...headers });
    stream.setTimeout(10_000, () => stream.close(constants.NGHTTP2_CANCEL));
    let status = 0;
    let text = '';
    stream.on('response', (responseHeaders) => {
      status = Number(responseHeaders[':status']);
    });
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => (text += chunk));
    stream.on('end', () => resolve({ status, body: text }));
    stream.on('error', reject);
    stream.end(body);
  });

/**
 * Sends iPhone push notifications through Apple's APNs with a token (.p8 key). The signed token is
 * reused for 40 minutes, because Apple rejects tokens refreshed more often than every 20 minutes.
 */
export class ApnsPushProvider implements IntegrationProvider {
  public readonly type: IntegrationProviderType = 'apns';
  private readonly tokens = new Map<string, { value: string; issuedAt: number }>();

  constructor(
    private readonly devices: DeviceStore,
    private readonly transport: ApnsTransport = defaultTransport
  ) {}

  private credentials(config: IntegrationConfig): ApnsCredentials | null {
    const encrypted = config['encryptedCredentials'];
    if (typeof encrypted !== 'string') return null;
    try {
      return parseApnsCredentials(decryptSecret(encrypted));
    } catch {
      return null;
    }
  }

  public async validateConfig(config: IntegrationConfig): Promise<boolean> {
    const credentials = this.credentials(config);
    if (!credentials) return false;
    try {
      const key = createPrivateKey(credentials.privateKey);
      return key.asymmetricKeyType === 'ec';
    } catch {
      return false;
    }
  }

  private bearer(credentials: ApnsCredentials): string {
    const cacheKey = `${credentials.teamId}:${credentials.keyId}`;
    const cached = this.tokens.get(cacheKey);
    if (cached && Date.now() - cached.issuedAt < 40 * 60_000) return cached.value;

    const issuedAt = Date.now();
    const value = signJwt('ES256', { kid: credentials.keyId }, { iss: credentials.teamId, iat: Math.floor(issuedAt / 1000) }, createPrivateKey(credentials.privateKey));
    this.tokens.set(cacheKey, { value, issuedAt });
    return value;
  }

  private async sendOne(config: IntegrationConfig, credentials: ApnsCredentials, token: string, content: PushContent): Promise<SendOutcome> {
    const host = config['sandbox'] === true ? 'api.sandbox.push.apple.com' : 'api.push.apple.com';
    try {
      const { status, body } = await this.transport({
        host,
        path: `/3/device/${token}`,
        headers: {
          authorization: `bearer ${this.bearer(credentials)}`,
          'apns-topic': credentials.topic,
          'apns-push-type': 'alert',
          'apns-priority': '10',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ aps: { alert: { title: content.title, body: content.body }, sound: 'default' }, ...content.data }),
      });
      if (status === 200) return { ok: true };

      const reason = (() => {
        try {
          return (JSON.parse(body) as { reason?: string }).reason ?? '';
        } catch {
          return '';
        }
      })();
      // Apple says these devices will never receive anything again.
      if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic') {
        return { ok: false, error: `Apple rejected the device (${reason || status})`, retryable: false, invalidToken: true };
      }
      if (reason === 'ExpiredProviderToken') this.tokens.clear();
      return {
        ok: false,
        error: `APNs returned ${status}${reason ? ` (${reason})` : ''}`,
        retryable: status >= 500 || status === 429 || reason === 'ExpiredProviderToken',
      };
    } catch (err) {
      return { ok: false, error: `Could not reach Apple: ${(err as Error).message}`, retryable: true };
    }
  }

  public async sendNotification(config: IntegrationConfig, message: IntegrationMessage): Promise<IntegrationDeliveryResult> {
    if (Array.isArray(config.enabledEvents) && config.enabledEvents.length > 0 && !config.enabledEvents.includes(message.eventType)) {
      return { success: true, error: `Event type "${message.eventType}" is turned off for this integration` };
    }
    const credentials = this.credentials(config);
    const projectId = typeof config['projectId'] === 'string' ? config['projectId'] : null;
    if (!credentials || !projectId) return { success: false, error: 'Push credentials are not saved correctly', retryable: false };

    const devices = await this.devices.list(projectId, message.userId, 'ios');
    if (devices.length === 0) return { success: true, error: 'The user has no iPhone devices registered' };

    const content = toPushContent(message);
    let delivered = 0;
    let retryable = false;
    let lastError = '';
    for (const device of devices) {
      const outcome = await this.sendOne(config, credentials, device.token, content);
      if (outcome.ok) delivered++;
      else if (outcome.invalidToken) await this.devices.remove(projectId, device.token);
      else {
        lastError = outcome.error;
        retryable ||= outcome.retryable;
      }
    }
    if (delivered > 0 || !lastError) return { success: true, externalMessageId: `apns_${Date.now()}` };
    return { success: false, error: lastError, retryable };
  }

  public async testConnection(config: IntegrationConfig): Promise<IntegrationDeliveryResult> {
    // Apple has no "ping" endpoint, so the best check without a real device is that the key signs.
    return (await this.validateConfig(config))
      ? { success: true }
      : { success: false, error: 'The key is not a valid Apple .p8 key', retryable: false };
  }

  public async disconnect(): Promise<boolean> {
    return true;
  }

  public async getStatus(config: IntegrationConfig) {
    return { connected: await this.validateConfig(config), details: { provider: 'apns', sandbox: config['sandbox'] === true } };
  }
}
