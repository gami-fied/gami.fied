import { decryptSecret } from '@gami/webhooks';
import type { IntegrationProvider } from '../../provider.js';
import type {
  IntegrationConfig,
  IntegrationDeliveryResult,
  IntegrationMessage,
  IntegrationProviderType,
} from '../../types.js';
import { buildDiscordEmbed, buildDiscordTestEmbed, type DiscordEmbedTemplate } from './templates.js';

export class DiscordIntegrationProvider implements IntegrationProvider {
  public readonly type: IntegrationProviderType = 'discord';

  /**
   * Decrypts and resolves target Discord webhook URL from config.
   */
  private resolveWebhookUrl(config: IntegrationConfig): string {
    if (config.webhookUrl && typeof config.webhookUrl === 'string') {
      return config.webhookUrl;
    }
    if (config.encryptedWebhookUrl && typeof config.encryptedWebhookUrl === 'string') {
      return decryptSecret(config.encryptedWebhookUrl);
    }
    throw new Error('No valid Discord webhook URL or encrypted credential found in config');
  }

  public async validateConfig(config: IntegrationConfig): Promise<boolean> {
    try {
      const url = this.resolveWebhookUrl(config);
      return url.startsWith('https://discord.com/api/webhooks/') || url.startsWith('https://discordapp.com/api/webhooks/');
    } catch {
      return false;
    }
  }

  public async testConnection(config: IntegrationConfig): Promise<IntegrationDeliveryResult> {
    try {
      const webhookUrl = this.resolveWebhookUrl(config);
      const payload = buildDiscordTestEmbed((config.projectName as string) || 'Project');

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok || response.status === 204) {
        return { success: true };
      }

      const errorText = await response.text().catch(() => '');
      const isRetryable = response.status >= 500 || response.status === 429;
      return {
        success: false,
        error: `Discord Webhook returned status ${response.status}: ${errorText.substring(0, 200)}`,
        retryable: isRetryable,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: `Network error delivering test message to Discord: ${(err as Error).message}`,
        retryable: true,
      };
    }
  }

  public async sendNotification(
    config: IntegrationConfig,
    message: IntegrationMessage
  ): Promise<IntegrationDeliveryResult> {
    try {
      const webhookUrl = this.resolveWebhookUrl(config);

      // Check if event type is enabled in config
      if (
        Array.isArray(config.enabledEvents) &&
        config.enabledEvents.length > 0 &&
        !config.enabledEvents.includes(message.eventType)
      ) {
        return {
          success: true,
          error: `Event type "${message.eventType}" is disabled for this Discord integration`,
        };
      }

      const customTemplates = (config.customTemplates as Record<string, DiscordEmbedTemplate>) || undefined;
      let payload;
      try {
        payload = buildDiscordEmbed(message, customTemplates);
      } catch (renderErr: unknown) {
        // Rendering errors are non-transient configuration failures -> retryable = false
        return {
          success: false,
          error: `Discord template rendering failed: ${(renderErr as Error).message}`,
          retryable: false,
        };
      }

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok || response.status === 204) {
        return {
          success: true,
          externalMessageId: `disc_msg_${Date.now()}`,
        };
      }

      const errorText = await response.text().catch(() => '');
      const isRetryable = response.status >= 500 || response.status === 429;

      return {
        success: false,
        error: `Discord delivery failed (${response.status}): ${errorText.substring(0, 200)}`,
        retryable: isRetryable,
      };
    } catch (err: unknown) {
      return {
        success: false,
        error: `Network error connecting to Discord: ${(err as Error).message}`,
        retryable: true,
      };
    }
  }

  public async disconnect(config: IntegrationConfig): Promise<boolean> {
    return true;
  }

  public async getStatus(config: IntegrationConfig): Promise<{
    connected: boolean;
    details?: Record<string, unknown>;
  }> {
    const isValid = await this.validateConfig(config);
    return {
      connected: isValid,
      details: {
        provider: 'discord',
        guildId: config.guildId || null,
        channelId: config.channelId || null,
        guildName: config.guildName || null,
        channelName: config.channelName || null,
        enabledEvents: config.enabledEvents || [],
        customTemplatesCount: config.customTemplates ? Object.keys(config.customTemplates).length : 0,
      },
    };
  }
}
