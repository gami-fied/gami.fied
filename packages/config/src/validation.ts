const MIN_SECRET_LENGTH = 32;

const KNOWN_INSECURE_SECRETS = new Set([
  'super-secret-auth-key-123456789',
  'gami_webhook_master_encryption_key_32bytes!!',
  'gami_master_encryption_key_32bytes!!',
]);

/** Matches the values shipped in the env templates, which must be replaced. */
function isPlaceholder(value: string): boolean {
  return /your[-_]|change[-_]?me|replace[-_]?me|local-development-only/i.test(value);
}

function assertStrongSecret(name: string, value: string | undefined): void {
  if (!value) {
    throw new Error(`[Config] Missing required production configuration: ${name}`);
  }
  if (KNOWN_INSECURE_SECRETS.has(value) || isPlaceholder(value) || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `[Config] Insecure default ${name} detected in production configuration. Use a random value of at least ${MIN_SECRET_LENGTH} characters.`
    );
  }
}

export interface ProductionConfigOptions {
  /** The worker never serves the bootstrap route, so it does not need that secret. */
  service?: 'api' | 'worker';
}

/**
 * Centralized production configuration validator.
 * Validates required environment variables and rejects known insecure development defaults in production mode.
 */
export function validateProductionConfig(
  env: Record<string, string | undefined> = process.env,
  options: ProductionConfigOptions = {}
): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('[Config] Missing required production configuration: DATABASE_URL');
  }
  if (
    databaseUrl.includes('postgres:postgres') ||
    databaseUrl.includes('password@localhost') ||
    isPlaceholder(databaseUrl)
  ) {
    throw new Error('[Config] Insecure development database password detected in production DATABASE_URL');
  }

  assertStrongSecret('BETTER_AUTH_SECRET', env.BETTER_AUTH_SECRET);
  assertStrongSecret('ENCRYPTION_MASTER_KEY', env.ENCRYPTION_MASTER_KEY || env.WEBHOOK_MASTER_KEY);

  if (options.service !== 'worker') {
    assertStrongSecret('PLATFORM_BOOTSTRAP_SECRET', env.PLATFORM_BOOTSTRAP_SECRET);
  }

  const redisConn = env.REDIS_URL || env.REDIS_HOST;
  if (!redisConn) {
    throw new Error('[Config] Missing required production configuration: REDIS_URL or REDIS_HOST');
  }
}
