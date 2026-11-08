import { calculateHmacSignature, calculateTimestampedSignature, decryptSecret } from '@gami/webhooks';
import type { IntegrationConfig, IntegrationMessage, IntegrationProviderType } from '../../types.js';
import { WebhookStyleProvider } from '../webhook-provider.js';

/**
 * Sends each notification as JSON to any HTTPS address, for tools that have no built-in
 * integration. If a signing secret is saved, requests carry the same `X-Gami-Signature` headers as
 * webhooks, so a receiver can check they came from this server. Addresses on private networks are
 * refused.
 */
export class HttpIntegrationProvider extends WebhookStyleProvider {
  public readonly type: IntegrationProviderType = 'http';
  protected readonly label = 'the HTTP endpoint';

  protected acceptsUrl(): boolean {
    return true;
  }

  protected buildPayload(message: IntegrationMessage) {
    return {
      type: message.eventType,
      title: message.title,
      body: message.body,
      user: { id: message.userId, name: message.userName ?? null },
      metadata: message.metadata ?? {},
      createdAt: message.createdAt ?? new Date().toISOString(),
    };
  }

  protected buildTestPayload(config: IntegrationConfig) {
    return {
      type: 'test',
      title: 'Gami.Fied is connected',
      body: `This is a test from ${typeof config.projectName === 'string' ? config.projectName : 'your project'}.`,
      user: null,
      metadata: {},
      createdAt: new Date().toISOString(),
    };
  }

  protected buildHeaders(body: string, config: IntegrationConfig): Record<string, string> {
    const encrypted = config.encryptedSigningSecret;
    if (typeof encrypted !== 'string' || !encrypted) return {};

    const secret = decryptSecret(encrypted);
    const timestamp = Math.floor(Date.now() / 1000);
    return {
      'X-Gami-Timestamp': String(timestamp),
      'X-Gami-Signature': calculateHmacSignature(body, secret),
      'X-Gami-Signature-V2': calculateTimestampedSignature(body, secret, timestamp),
    };
  }
}
