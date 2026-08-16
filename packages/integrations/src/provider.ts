import type {
  IntegrationConfig,
  IntegrationDeliveryResult,
  IntegrationMessage,
  IntegrationProviderType,
} from './types.js';

export interface IntegrationProvider {
  /**
   * Unique provider identifier (e.g. 'discord', 'slack')
   */
  readonly type: IntegrationProviderType;

  /**
   * Validates raw or encrypted integration configuration object.
   */
  validateConfig(config: IntegrationConfig): Promise<boolean>;

  /**
   * Sends a test message using the configuration to verify integration health.
   */
  testConnection(config: IntegrationConfig): Promise<IntegrationDeliveryResult>;

  /**
   * Delivers a canonical gamification notification payload to the external provider.
   */
  sendNotification(
    config: IntegrationConfig,
    message: IntegrationMessage
  ): Promise<IntegrationDeliveryResult>;

  /**
   * Handles provider-specific disconnection or secret cleanup.
   */
  disconnect?(config: IntegrationConfig): Promise<boolean>;

  /**
   * Returns safe non-sensitive connection status metadata.
   */
  getStatus(config: IntegrationConfig): Promise<{
    connected: boolean;
    details?: Record<string, unknown>;
  }>;
}
