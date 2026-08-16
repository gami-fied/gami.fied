export type IntegrationProviderType = 'discord' | 'slack' | 'teams' | string;

export type IntegrationStatus = 'active' | 'disabled' | 'error';

export interface IntegrationConfig {
  encryptedToken?: string;
  webhookUrl?: string;
  encryptedWebhookUrl?: string;
  guildId?: string;
  channelId?: string;
  guildName?: string;
  channelName?: string;
  enabledEvents?: string[];
  [key: string]: unknown;
}

export interface IntegrationMessage {
  notificationId?: string;
  eventId?: string;
  eventType: 'xp_awarded' | 'achievement_unlocked' | 'level_up' | 'challenge_completed' | string;
  userId: string;
  userName?: string;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
}

export interface IntegrationDeliveryResult {
  success: boolean;
  externalMessageId?: string;
  error?: string;
  retryable?: boolean;
}

export class IntegrationError extends Error {
  public readonly retryable: boolean;
  public readonly provider: string;

  constructor(message: string, provider: string, retryable = true) {
    super(message);
    this.name = 'IntegrationError';
    this.provider = provider;
    this.retryable = retryable;
  }
}
