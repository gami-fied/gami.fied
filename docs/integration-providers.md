# Implementing New Integration Providers

## Overview
Gami's integration architecture uses the Provider Pattern via `IntegrationProvider` and `IntegrationProviderRegistry` in `@gami/integrations`. Adding a new provider (such as Slack, Microsoft Teams, or Push Notifications) requires zero changes to core gamification engine, notification pipeline, or database schema.

---

## Step-by-Step Implementation Guide

1. **Implement `IntegrationProvider` Interface**:
   Create a new provider class in `packages/integrations/src/providers/<provider-name>/index.ts`:

   ```ts
   import type { IntegrationProvider } from '../../provider.js';
   import type { IntegrationConfig, IntegrationDeliveryResult, IntegrationMessage } from '../../types.js';

   export class SlackIntegrationProvider implements IntegrationProvider {
     public readonly type = 'slack';

     public async validateConfig(config: IntegrationConfig): Promise<boolean> {
       return true;
     }

     public async testConnection(config: IntegrationConfig): Promise<IntegrationDeliveryResult> {
       return { success: true };
     }

     public async sendNotification(
       config: IntegrationConfig,
       message: IntegrationMessage
     ): Promise<IntegrationDeliveryResult> {
       // Format Slack block kit payload and post to Slack API
       return { success: true, externalMessageId: `slack_${Date.now()}` };
     }

     public async getStatus(config: IntegrationConfig) {
       return { connected: true, details: { provider: 'slack' } };
     }
   }
   ```

2. **Register Provider**:
   In `packages/integrations/src/index.ts`:
   ```ts
   import { SlackIntegrationProvider } from './providers/slack/index.js';
   import { registry } from './registry.js';

   registry.register(new SlackIntegrationProvider());
   ```

3. **Dashboard & API Integration**:
   - The backend API (`apps/api/src/integrations`) automatically resolves registered providers via `registry.get(providerType)`.
   - Update `apps/dashboard` UI cards in `/dashboard/integrations` to enable the provider card.
