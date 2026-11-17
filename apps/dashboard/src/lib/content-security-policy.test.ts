import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, createNonce } from './content-security-policy';

const directive = (policy: string, name: string) =>
  policy
    .split('; ')
    .find((part) => part.startsWith(`${name} `))
    ?.split(' ')
    .slice(1) ?? [];

describe('content security policy', () => {
  it('only runs scripts that carry the nonce', () => {
    const policy = buildContentSecurityPolicy({ nonce: 'abc123' });
    const scripts = directive(policy, 'script-src');
    expect(scripts).toContain("'nonce-abc123'");
    expect(scripts).toContain("'strict-dynamic'");
    expect(scripts).not.toContain("'unsafe-inline'");
    expect(scripts).not.toContain("'unsafe-eval'");
  });

  it('allows eval in development only', () => {
    expect(
      directive(buildContentSecurityPolicy({ nonce: 'n', dev: true }), 'script-src')
    ).toContain("'unsafe-eval'");
  });

  it('keeps a nonce out of style-src, so style attributes still work', () => {
    const styles = directive(buildContentSecurityPolicy({ nonce: 'abc123' }), 'style-src');
    expect(styles).toContain("'unsafe-inline'");
    expect(styles.some((source) => source.startsWith("'nonce-"))).toBe(false);
  });

  it('keeps the framing, object and base rules', () => {
    const policy = buildContentSecurityPolicy({ nonce: 'n' });
    expect(directive(policy, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(policy, 'object-src')).toEqual(["'none'"]);
    expect(directive(policy, 'base-uri')).toEqual(["'self'"]);
    expect(directive(policy, 'form-action')).toEqual(["'self'"]);
  });

  it('lets the browser reach a separate API address, and ignores one that is not a URL', () => {
    expect(
      directive(
        buildContentSecurityPolicy({ nonce: 'n', apiUrl: 'https://api.example.com/v1' }),
        'connect-src'
      )
    ).toContain('https://api.example.com');
    expect(
      directive(buildContentSecurityPolicy({ nonce: 'n', apiUrl: 'not a url' }), 'connect-src')
    ).not.toContain('not');
  });

  it('makes a different nonce each time', () => {
    const nonces = new Set(Array.from({ length: 50 }, createNonce));
    expect(nonces.size).toBe(50);
    expect(createNonce()).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
