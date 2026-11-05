export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300;

export interface VerifyWebhookOptions {
  /** The request body exactly as received, before any JSON parsing. */
  rawBody: string;
  /** The endpoint's signing secret. */
  secret: string;
  /** The `X-Gami-Timestamp` header. */
  timestamp: string;
  /** The `X-Gami-Signature-V2` header. It holds two signatures during a secret rotation. */
  signature: string;
  /** How old a delivery may be, which limits replay attacks. Defaults to 5 minutes. */
  toleranceSeconds?: number;
  /** Current time, for tests. */
  now?: Date;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Checks that a webhook came from Gami and is recent. Works in Node.js 18+, browsers and edge
 * runtimes through Web Crypto, whose `verify` compares in constant time.
 */
export async function verifyWebhook(options: VerifyWebhookOptions): Promise<boolean> {
  const { rawBody, secret, timestamp, signature, now = new Date() } = options;
  const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS;

  if (!/^\d+$/.test(timestamp)) return false;
  if (Math.abs(now.getTime() / 1000 - Number(timestamp)) > toleranceSeconds) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signedContent = encoder.encode(`${timestamp}.${rawBody}`);

  for (const candidate of signature.split(',')) {
    const trimmed = candidate.trim();
    const bytes = trimmed.startsWith('sha256=') ? hexToBytes(trimmed.slice(7)) : null;
    if (bytes && (await crypto.subtle.verify('HMAC', key, bytes, signedContent))) return true;
  }
  return false;
}
