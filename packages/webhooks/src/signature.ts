import crypto from 'crypto';

const DEV_MASTER_KEY = 'local-development-only-encryption-key';

function getMasterKey(): string {
  const key = process.env.ENCRYPTION_MASTER_KEY || process.env.WEBHOOK_MASTER_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('ENCRYPTION_MASTER_KEY is required in production');
  }
  return DEV_MASTER_KEY;
}

function decryptWithKey(encryptedPayload: string, masterKey: string): string {
  const key = crypto.createHash('sha256').update(masterKey).digest();

  const [ivHex, authTagHex, encryptedText] = encryptedPayload.split(':');
  if (!ivHex || !authTagHex || !encryptedText) {
    throw new Error('Invalid encrypted secret format');
  }

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));

  return decipher.update(encryptedText, 'hex', 'utf8') + decipher.final('utf8');
}

/**
 * Generates a cryptographically secure raw secret for a webhook endpoint.
 * Format: gami_whsec_<32 hex bytes>
 */
export function generateWebhookSecret(): string {
  return `gami_whsec_${crypto.randomBytes(32).toString('hex')}`;
}

/**
 * Computes a SHA-256 hash of the webhook secret for secure storage/lookups.
 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Encrypts a webhook secret symmetrically using AES-256-GCM for secure database storage.
 */
export function encryptSecret(secret: string, customMasterKey?: string): string {
  const masterKey = customMasterKey || getMasterKey();
  const key = crypto.createHash('sha256').update(masterKey).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a stored secret in memory. During a key rotation, values written with the old
 * key still decrypt through ENCRYPTION_MASTER_KEY_PREVIOUS until they are re-saved.
 */
export function decryptSecret(encryptedPayload: string, customMasterKey?: string): string {
  const masterKey = customMasterKey || getMasterKey();

  try {
    return decryptWithKey(encryptedPayload, masterKey);
  } catch (err) {
    const previousKey = process.env.ENCRYPTION_MASTER_KEY_PREVIOUS;
    if (!customMasterKey && previousKey) return decryptWithKey(encryptedPayload, previousKey);
    throw err;
  }
}

/**
 * Calculates an HMAC-SHA256 signature over the exact raw HTTP request body string or buffer.
 * Returns signature format: sha256=<hex>
 */
export function calculateHmacSignature(rawBody: string | Buffer, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(rawBody);
  const digest = hmac.digest('hex');
  return `sha256=${digest}`;
}

/**
 * Verifies an incoming X-Gami-Signature header using timing-safe comparison.
 */
export function verifyHmacSignature(
  rawBody: string | Buffer,
  secret: string,
  signatureHeader: string
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expectedSignature = calculateHmacSignature(rawBody, secret);

  const expectedBuffer = Buffer.from(expectedSignature);
  const actualBuffer = Buffer.from(signatureHeader);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

/**
 * Signs `<timestamp>.<body>`, so a captured delivery cannot be replayed later.
 * Receivers check the timestamp is recent, for example with `verifyWebhook` from the SDK.
 */
export function calculateTimestampedSignature(
  rawBody: string,
  secret: string,
  timestamp: number
): string {
  return calculateHmacSignature(`${timestamp}.${rawBody}`, secret);
}
