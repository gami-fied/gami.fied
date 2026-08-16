import { DiscordIntegrationProvider } from './providers/discord/index.js';
import { registry } from './registry.js';

export * from './types.js';
export * from './provider.js';
export * from './registry.js';
export * from './providers/discord/index.js';
export * from './providers/discord/templates.js';

// Auto-register Discord provider in integration registry
const defaultDiscordProvider = new DiscordIntegrationProvider();
registry.register(defaultDiscordProvider);
