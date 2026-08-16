/**
 * Centralized production configuration validator.
 * Validates required environment variables and rejects known insecure development defaults in production mode.
 */
export function validateProductionConfig(env: Record<string, string | undefined> = process.env): void {
  const isProduction = env.NODE_ENV === 'production';

  if (!isProduction) {
    return;
  }

  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('[Config] Missing required production configuration: DATABASE_URL');
  }
  if (databaseUrl.includes('postgres:postgres') || databaseUrl.includes('password@localhost')) {
    throw new Error('[Config] Insecure development database password detected in production DATABASE_URL');
  }

  const betterAuthSecret = env.BETTER_AUTH_SECRET;
  if (!betterAuthSecret) {
    throw new Error('[Config] Missing required production configuration: BETTER_AUTH_SECRET');
  }
  if (betterAuthSecret === 'super-secret-auth-key-123456789' || betterAuthSecret.length < 16) {
    throw new Error('[Config] Insecure default BETTER_AUTH_SECRET detected in production configuration');
  }

  const encryptionMasterKey = env.ENCRYPTION_MASTER_KEY || env.WEBHOOK_MASTER_KEY;
  if (!encryptionMasterKey) {
    throw new Error('[Config] Missing required production configuration: ENCRYPTION_MASTER_KEY');
  }
  if (
    encryptionMasterKey === 'gami_webhook_master_encryption_key_32bytes!!' ||
    encryptionMasterKey === 'gami_master_encryption_key_32bytes!!'
  ) {
    throw new Error('[Config] Insecure default ENCRYPTION_MASTER_KEY detected in production configuration');
  }

  const redisConn = env.REDIS_URL || env.REDIS_HOST;
  if (!redisConn) {
    throw new Error('[Config] Missing required production configuration: REDIS_URL or REDIS_HOST');
  }
}
