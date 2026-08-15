import dns from 'dns';
import net from 'net';

/**
 * Checks whether an IP address belongs to a private, loopback, link-local, or cloud metadata range.
 */
export function isPrivateOrBlockedIp(ip: string): boolean {
  // Normalize IPv4-mapped IPv6 address (e.g. ::ffff:127.0.0.1 -> 127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }

  // IPv4 Checks
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    const p0 = parts[0] ?? 0;
    const p1 = parts[1] ?? 0;

    // 0.0.0.0/8 (Broadcast/Current network)
    if (p0 === 0) return true;

    const allowLocal = process.env.ALLOW_LOCAL_WEBHOOKS === 'true';

    // 127.0.0.0/8 (Loopback)
    if (p0 === 127) return !allowLocal;

    // 10.0.0.0/8 (RFC1918 Private)
    if (p0 === 10) return true;

    // 172.16.0.0/12 (RFC1918 Private: 172.16.0.0 – 172.31.255.255)
    if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;

    // 192.168.0.0/16 (RFC1918 Private)
    if (p0 === 192 && p1 === 168) return true;

    // 169.254.0.0/16 (Link-Local & Cloud Metadata e.g. 169.254.169.254)
    if (p0 === 169 && p1 === 254) return true;

    return false;
  }

  // IPv6 Checks
  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();

    // ::1 (Loopback) or :: (Unspecified)
    if (normalized === '::1' || normalized === '::') return true;

    // fe80::/10 (Link-Local)
    if (normalized.startsWith('fe80:')) return true;

    // fc00::/7 (Unique Local Address - ULA)
    if (normalized.startsWith('fc00:') || normalized.startsWith('fd00:')) return true;

    return false;
  }

  return true; // Reject unrecognized IP format
}

/**
 * Validates a Webhook URL structure and performs DNS lookup to enforce SSRF protection rules.
 */
export async function validateWebhookUrl(rawUrl: string): Promise<{ valid: boolean; error?: string }> {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { valid: false, error: 'URL must be a non-empty string' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Protocol check
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { valid: false, error: 'Only http: and https: protocols are permitted' };
  }

  const isProd = process.env.NODE_ENV === 'production';
  if (isProd && parsed.protocol !== 'https:') {
    return { valid: false, error: 'Production webhooks require HTTPS protocol' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowLocal = process.env.ALLOW_LOCAL_WEBHOOKS === 'true';

  // Hostname string checks
  if (
    (!allowLocal && hostname === 'localhost') ||
    hostname === 'metadata.google.internal' ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return { valid: false, error: 'Local, link-local, or cloud metadata endpoints are not allowed' };
  }

  // If host is a direct IP string
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      return { valid: false, error: 'Private, loopback, or internal IP destinations are not allowed' };
    }
    return { valid: true };
  }

  // Perform DNS resolution lookup
  try {
    const records = await dns.promises.lookup(hostname, { all: true });
    if (!records || records.length === 0) {
      return { valid: false, error: `Unable to resolve DNS hostname: ${hostname}` };
    }

    for (const record of records) {
      if (isPrivateOrBlockedIp(record.address)) {
        return {
          valid: false,
          error: `Hostname ${hostname} resolves to blocked private/internal IP address (${record.address})`,
        };
      }
    }
  } catch (err: unknown) {
    return { valid: false, error: `DNS lookup failed for ${hostname}: ${(err as Error).message}` };
  }

  return { valid: true };
}

/**
 * Re-resolves and validates target IP address immediately prior to HTTP delivery
 * to mitigate DNS rebinding attacks.
 */
export async function resolveAndValidateTargetIp(rawUrl: string): Promise<string> {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname;

  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      throw new Error(`Target IP ${hostname} is in a blocked/private range`);
    }
    return hostname;
  }

  const records = await dns.promises.lookup(hostname, { all: true });
  if (!records || records.length === 0) {
    throw new Error(`DNS resolution failed for hostname ${hostname}`);
  }

  for (const record of records) {
    if (isPrivateOrBlockedIp(record.address)) {
      throw new Error(
        `DNS Rebinding Shield: Hostname ${hostname} resolved to forbidden IP (${record.address})`
      );
    }
  }

  const firstRecord = records[0];
  if (!firstRecord) {
    throw new Error(`DNS resolution returned empty records array for ${hostname}`);
  }
  return firstRecord.address;
}
