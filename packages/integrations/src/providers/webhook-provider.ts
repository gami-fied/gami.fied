import { decryptSecret, fetchWithSsrfProtection, validateWebhookUrl } from '@gami/webhooks';
import type { IntegrationProvider } from '../provider.js';
import type {
  IntegrationConfig,
  IntegrationDeliveryResult,
  IntegrationMessage,
  IntegrationProviderType,
} from '../types.js';

/**
 * What every "post JSON to a URL" provider shares: finding the saved URL, refusing addresses on
 * the server's own network, filtering by event, and turning a response into a delivery result.
 * A provider only says which hosts it accepts and how to shape the message.
 */
export abstract class WebhookStyleProvider implements IntegrationProvider {
  public abstract readonly type: IntegrationProviderType;
  protected abstract readonly label: string;

  /** Whether the URL belongs to this service. */
  protected abstract acceptsUrl(url: URL): boolean;
  /** The JSON to send for a notification. */
  protected abstract buildPayload(message: IntegrationMessage, config: IntegrationConfig): unknown;
  /** The JSON to send when someone presses "test". */
  protected abstract buildTestPayload(config: IntegrationConfig): unknown;
  /** Extra headers, for example a signature. */
  protected buildHeaders(body: string, config: IntegrationConfig): Record<string, string> {
    void body;
    void config;
    return {};
  }
  protected resolveUrl(config: IntegrationConfig): string {
    if (typeof config.webhookUrl === 'string' && config.webhookUrl) return config.webhookUrl;
    if (typeof config.encryptedWebhookUrl === 'string' && config.encryptedWebhookUrl) {
      return decryptSecret(config.encryptedWebhookUrl);
    }
    throw new Error(`No ${this.label} webhook URL is saved for this integration`);
  }

  public async validateConfig(config: IntegrationConfig): Promise<boolean> {
    try {
      const url = new URL(this.resolveUrl(config));
      return url.protocol === 'https:' && this.acceptsUrl(url);
    } catch {
      return false;
    }
  }

  private async post(config: IntegrationConfig, payload: unknown): Promise<IntegrationDeliveryResult> {
    let url: string;
    try {
      url = this.resolveUrl(config);
    } catch (err) {
      return { success: false, error: (err as Error).message, retryable: false };
    }

    const checked = await validateWebhookUrl(url);
    if (!checked.valid) return { success: false, error: checked.error ?? 'The URL is not allowed', retryable: false };

    const body = JSON.stringify(payload);
    try {
      const response = await fetchWithSsrfProtection(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.buildHeaders(body, config) },
        body,
        signal: AbortSignal.timeout(10_000),
      });

      if (response.ok) {
        return { success: true, externalMessageId: `${this.type}_msg_${Date.now()}` };
      }

      const detail = (await response.text().catch(() => '')).substring(0, 200);
      // Errors the sender can fix, such as a deleted webhook, are not worth retrying.
      const retryable = response.status >= 500 || response.status === 429 || response.status === 408;
      return { success: false, error: `${this.label} returned ${response.status}: ${detail}`, retryable };
    } catch (err) {
      return { success: false, error: `Could not reach ${this.label}: ${(err as Error).message}`, retryable: true };
    }
  }

  public testConnection(config: IntegrationConfig): Promise<IntegrationDeliveryResult> {
    return this.post(config, this.buildTestPayload(config));
  }

  public async sendNotification(config: IntegrationConfig, message: IntegrationMessage): Promise<IntegrationDeliveryResult> {
    if (Array.isArray(config.enabledEvents) && config.enabledEvents.length > 0 && !config.enabledEvents.includes(message.eventType)) {
      return { success: true, error: `Event type "${message.eventType}" is turned off for this ${this.label} integration` };
    }
    return this.post(config, this.buildPayload(message, config));
  }

  public async disconnect(): Promise<boolean> {
    return true;
  }

  public async getStatus(config: IntegrationConfig): Promise<{ connected: boolean; details?: Record<string, unknown> }> {
    return {
      connected: await this.validateConfig(config),
      details: { provider: this.type, enabledEvents: config.enabledEvents ?? [] },
    };
  }
}
