import dns from 'dns';
import { createServer } from 'http';
import type { AddressInfo } from 'net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchWithSsrfProtection,
  guardedLookup,
  isPrivateOrBlockedIp,
  validateWebhookUrl,
} from '../security.js';

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.ALLOW_LOCAL_WEBHOOKS;
});

describe('isPrivateOrBlockedIp', () => {
  it.each([
    ['fd12:3456::1', 'unique local beyond fd00::'],
    ['fc12::1', 'unique local'],
    ['fe90::1', 'link-local beyond fe80::'],
    ['::ffff:7f00:1', 'hex-mapped IPv4 loopback'],
    ['::ffff:127.0.0.1', 'mapped IPv4 loopback'],
    ['::ffff:a00:1', 'hex-mapped private IPv4'],
    ['100.64.0.1', 'carrier-grade NAT'],
    ['198.18.0.1', 'benchmarking'],
    ['169.254.169.254', 'cloud metadata'],
    ['0.0.0.0', 'unspecified'],
    ['224.0.0.1', 'multicast'],
    ['240.0.0.1', 'reserved'],
    ['not-an-ip', 'invalid'],
  ])('blocks %s (%s)', (ip) => {
    expect(isPrivateOrBlockedIp(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows public address %s', (ip) => {
    expect(isPrivateOrBlockedIp(ip)).toBe(false);
  });

  it('only lets ALLOW_LOCAL_WEBHOOKS open loopback, not private ranges', () => {
    process.env.ALLOW_LOCAL_WEBHOOKS = 'true';
    expect(isPrivateOrBlockedIp('127.0.0.1')).toBe(false);
    expect(isPrivateOrBlockedIp('::1')).toBe(false);
    expect(isPrivateOrBlockedIp('10.0.0.1')).toBe(true);
    expect(isPrivateOrBlockedIp('169.254.169.254')).toBe(true);
  });
});

describe('validateWebhookUrl', () => {
  it('rejects bracketed IPv6 literals in private ranges', async () => {
    expect((await validateWebhookUrl('http://[fd12::1]/hook')).valid).toBe(false);
    expect((await validateWebhookUrl('http://[::ffff:7f00:1]/hook')).valid).toBe(false);
  });
});

describe('DNS rebinding protection', () => {
  const lookupOnce = (address: string) =>
    new Promise<unknown>((resolve) => {
      vi.spyOn(dns, 'lookup').mockImplementation(((_host, _opts, cb) =>
        cb(null, [{ address, family: 4 }])) as never);
      guardedLookup('rebind.example.com', {}, (err) => resolve(err));
    });

  it('refuses the connection when the name resolves to an internal address', async () => {
    expect(await lookupOnce('169.254.169.254')).toBeInstanceOf(Error);
  });

  it('allows a public resolution', async () => {
    expect(await lookupOnce('93.184.216.34')).toBeNull();
  });

  it('checks the connection itself, even if an earlier validation passed', async () => {
    const server = createServer((_req, res) => res.end('reached internal service'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const { port } = server.address() as AddressInfo;

    vi.spyOn(dns, 'lookup').mockImplementation(((_host, _opts, cb) =>
      cb(null, [{ address: '127.0.0.1', family: 4 }])) as never);

    await expect(
      fetchWithSsrfProtection(`http://rebind.example.com:${port}/`, { method: 'GET' })
    ).rejects.toThrow();

    await new Promise((resolve) => server.close(resolve));
  });
});
