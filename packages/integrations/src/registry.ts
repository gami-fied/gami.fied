import type { IntegrationProvider } from './provider.js';
import type { IntegrationProviderType } from './types.js';

export class IntegrationProviderRegistry {
  private static instance: IntegrationProviderRegistry;
  private readonly providers = new Map<string, IntegrationProvider>();

  private constructor() {}

  public static getInstance(): IntegrationProviderRegistry {
    if (!IntegrationProviderRegistry.instance) {
      IntegrationProviderRegistry.instance = new IntegrationProviderRegistry();
    }
    return IntegrationProviderRegistry.instance;
  }

  public register(provider: IntegrationProvider): void {
    if (!provider || !provider.type) {
      throw new Error('Invalid IntegrationProvider instance passed to registry');
    }
    this.providers.set(provider.type.toLowerCase(), provider);
  }

  public get(type: IntegrationProviderType): IntegrationProvider | undefined {
    return this.providers.get(type.toLowerCase());
  }

  public has(type: IntegrationProviderType): boolean {
    return this.providers.has(type.toLowerCase());
  }

  public listRegisteredTypes(): string[] {
    return Array.from(this.providers.keys());
  }

  public clear(): void {
    this.providers.clear();
  }
}

export const registry = IntegrationProviderRegistry.getInstance();
