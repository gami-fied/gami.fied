import { DiscordIntegrationProvider } from './providers/discord/index.js';
import { HttpIntegrationProvider } from './providers/http/index.js';
import { SlackIntegrationProvider } from './providers/slack/index.js';
import { TeamsIntegrationProvider } from './providers/teams/index.js';
import { registry } from './registry.js';

export * from './types.js';
export * from './provider.js';
export * from './registry.js';
export * from './providers/discord/index.js';
export * from './providers/discord/templates.js';
export * from './providers/webhook-provider.js';
export * from './providers/slack/index.js';
export * from './providers/teams/index.js';
export * from './providers/http/index.js';
export * from './providers/push/types.js';
export * from './providers/push/jwt.js';
export * from './providers/push/fcm.js';
export * from './providers/push/apns.js';
export * from './providers/push/register.js';

// Auto-register Discord provider in integration registry
const defaultDiscordProvider = new DiscordIntegrationProvider();
registry.register(defaultDiscordProvider);
registry.register(new SlackIntegrationProvider());
registry.register(new TeamsIntegrationProvider());
registry.register(new HttpIntegrationProvider());
