import { decryptSecret } from '@gami/webhooks';
import type { IntegrationProvider } from '../../provider.js';
import type { IntegrationConfig, IntegrationDeliveryResult, IntegrationMessage, IntegrationProviderType } from '../../types.js';
import { signJwt } from './jwt.js';
import { toPushContent, type DeviceStore, type PushContent, type SendOutcome } from './types.js';

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

export function parseServiceAccount(raw: string): ServiceAccount | null {
  try {
    const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
    if (parsed.client_email && parsed.private_key && parsed.project_id) return parsed as ServiceAccount;
  } catch {
    // Not JSON.
  }
  return null;
}

type Fetch = typeof fetch;

/**
 * Sends Android push notifications through Firebase Cloud Messaging (HTTP v1). The service account
 * a project uploads signs a short-lived token, which is reused until shortly before it expires.
 */
export class FcmPushProvider implements IntegrationProvider {
  public readonly type: IntegrationProviderType = 'fcm';
  private readonly tokens = new Map<string, { value: string; expiresAt: number }>();

  constructor(
    private readonly devices: DeviceStore,
    private readonly http: Fetch = fetch,
    private readonly tokenUrl = 'https://oauth2.googleapis.com/token',
    private readonly sendUrl = (project: string) => `https://fcm.googleapis.com/v1/projects/${project}/messages:send`
  ) {}

  private credentials(config: IntegrationConfig): ServiceAccount | null {
    const encrypted = config['encryptedCredentials'];
    if (typeof encrypted !== 'string') return null;
    try {
      return parseServiceAccount(decryptSecret(encrypted));
    } catch {
      return null;
    }
  }

  public async validateConfig(config: IntegrationConfig): Promise<boolean> {
    const account = this.credentials(config);
    if (!account) return false;
    try {
      // Signing proves the private key is a real key, without calling Google.
      signJwt('RS256', {}, { test: true }, account.private_key);
      return true;
    } catch {
      return false;
    }
  }

  private async accessToken(account: ServiceAccount): Promise<string> {
    const cached = this.tokens.get(account.client_email);
    if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

    const now = Math.floor(Date.now() / 1000);
    const assertion = signJwt('RS256', {}, {
      iss: account.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: this.tokenUrl,
      iat: now,
      exp: now + 3600,
    }, account.private_key);

    const response = await this.http(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Google refused the service account (${response.status})`);

    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.tokens.set(account.client_email, { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 });
    return body.access_token;
  }

  private async sendOne(account: ServiceAccount, token: string, content: PushContent): Promise<SendOutcome> {
    let accessToken: string;
    try {
      accessToken = await this.accessToken(account);
    } catch (err) {
      return { ok: false, error: (err as Error).message, retryable: true };
    }

    const response = await this.http(this.sendUrl(account.project_id), {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: { token, notification: { title: content.title, body: content.body }, data: content.data } }),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.ok) return { ok: true };

    const text = await response.text().catch(() => '');
    // A token Google no longer knows will never work again.
    if (response.status === 404 || /UNREGISTERED|registration-token-not-registered/.test(text)) {
      return { ok: false, error: 'The device is no longer registered', retryable: false, invalidToken: true };
    }
    if (response.status === 401) this.tokens.delete(account.client_email);
    return {
      ok: false,
      error: `FCM returned ${response.status}: ${text.slice(0, 160)}`,
      retryable: response.status >= 500 || response.status === 429 || response.status === 401,
    };
  }

  public async sendNotification(config: IntegrationConfig, message: IntegrationMessage): Promise<IntegrationDeliveryResult> {
    if (Array.isArray(config.enabledEvents) && config.enabledEvents.length > 0 && !config.enabledEvents.includes(message.eventType)) {
      return { success: true, error: `Event type "${message.eventType}" is turned off for this integration` };
    }
    const account = this.credentials(config);
    const projectId = typeof config['projectId'] === 'string' ? config['projectId'] : null;
    if (!account || !projectId) return { success: false, error: 'Push credentials are not saved correctly', retryable: false };

    const devices = await this.devices.list(projectId, message.userId, 'android');
    if (devices.length === 0) return { success: true, error: 'The user has no Android devices registered' };

    const content = toPushContent(message);
    let delivered = 0;
    let retryable = false;
    let lastError = '';
    for (const device of devices) {
      const outcome = await this.sendOne(account, device.token, content);
      if (outcome.ok) delivered++;
      else if (outcome.invalidToken) await this.devices.remove(projectId, device.token);
      else {
        lastError = outcome.error;
        retryable ||= outcome.retryable;
      }
    }
    if (delivered > 0 || !lastError) return { success: true, externalMessageId: `fcm_${Date.now()}` };
    return { success: false, error: lastError, retryable };
  }

  public async testConnection(config: IntegrationConfig): Promise<IntegrationDeliveryResult> {
    const account = this.credentials(config);
    if (!account) return { success: false, error: 'Push credentials are not saved correctly', retryable: false };
    try {
      await this.accessToken(account);
      return { success: true };
    } catch (err) {
      return { success: false, error: (err as Error).message, retryable: false };
    }
  }

  public async disconnect(): Promise<boolean> {
    return true;
  }

  public async getStatus(config: IntegrationConfig) {
    return { connected: await this.validateConfig(config), details: { provider: 'fcm' } };
  }
}
