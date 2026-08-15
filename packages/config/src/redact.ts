const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'api-key',
  'apikey',
  'keysecret',
  'secret',
  'secrethash',
  'webhooksecret',
  'webhook_master_key',
  'masterkey',
  'password',
  'dbpassword',
  'database_url',
  'redispassword',
  'better_auth_secret',
  'encryptionkey',
  'privatekey',
]);

/**
 * Recursively redacts sensitive keys (passwords, tokens, secrets, API keys) from objects or arrays.
 * Replaces sensitive values with '[REDACTED]'.
 */
export function redactSensitiveData<T>(input: T): T {
  if (!input || typeof input !== 'object') {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveData(item)) as unknown as T;
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (
      SENSITIVE_KEYS.has(lowerKey) ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('auth_key') ||
      lowerKey.includes('master_key')
    ) {
      result[key] = '[REDACTED]';
    } else if (value && typeof value === 'object') {
      result[key] = redactSensitiveData(value);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}
