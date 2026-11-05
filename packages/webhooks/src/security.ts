import dns, { type LookupAddress, type LookupAllOptions, type LookupOptions } from 'dns';
import net from 'net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as undiciFetch, type RequestInit, type Response } from 'undici';

/**
 * Only globally routable addresses are allowed. Classifying by range covers private,
 * loopback, link-local, carrier-grade NAT, benchmarking, multicast and reserved space,
 * in every IPv4 and IPv6 spelling, including IPv4-mapped IPv6.
 */
export function isPrivateOrBlockedIp(ip: string): boolean {
  const candidate = ip.replace(/^\[|\]$/g, '');
  if (!ipaddr.isValid(candidate)) return true;

  const range = ipaddr.process(candidate).range();
  if (range === 'unicast') return false;
  if (range === 'loopback') return process.env.ALLOW_LOCAL_WEBHOOKS !== 'true';
  return true;
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

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
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
 * Validates the target immediately before delivery, so a blocked destination is reported
 * as a clear failure. The connection itself is protected by `fetchWithSsrfProtection`.
 */
export async function resolveAndValidateTargetIp(rawUrl: string): Promise<string> {
  const parsed = new URL(rawUrl);
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');

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

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number
) => void;

/**
 * DNS lookup used for the actual socket. Addresses are checked here, at connect time, so a
 * hostname cannot pass validation and then rebind to an internal address for the connection.
 */
export function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: LookupCallback
): void {
  const lookupOptions: LookupAllOptions = { ...options, all: true };

  dns.lookup(hostname, lookupOptions, (err, addresses) => {
    if (err) {
      callback(err, '');
      return;
    }

    const blocked = addresses.find((record) => isPrivateOrBlockedIp(record.address));
    const first = addresses[0];
    if (blocked || !first) {
      const reason = blocked ? `forbidden IP (${blocked.address})` : 'no addresses';
      callback(new Error(`SSRF Shield: Hostname ${hostname} resolved to ${reason}`), '');
      return;
    }

    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, first.address, first.family);
    }
  });
}

const ssrfSafeAgent = new Agent({ connect: { lookup: guardedLookup as never } });

/** Sends an outbound request whose connection can only reach public addresses. */
export function fetchWithSsrfProtection(url: string, init: RequestInit): Promise<Response> {
  return undiciFetch(url, { ...init, dispatcher: ssrfSafeAgent });
}
