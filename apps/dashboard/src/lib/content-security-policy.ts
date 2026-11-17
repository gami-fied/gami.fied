/**
 * The dashboard's Content-Security-Policy. Scripts run only when they carry this request's nonce,
 * or were loaded by a script that did (`'strict-dynamic'`), so an injected `<script>` or inline
 * event handler does nothing.
 *
 * Styles allow `'unsafe-inline'` because components set `style` attributes, which a nonce cannot
 * cover. Adding a nonce to `style-src` would make browsers ignore `'unsafe-inline'` and break them.
 */

/** Cloudflare Turnstile, the check on starting a demo. Its script loads its own frame. */
const TURNSTILE = 'https://challenges.cloudflare.com';

export interface CspOptions {
  nonce: string;
  /** Development needs `eval` for React's error overlays. Production never does. */
  dev?: boolean;
  /**
   * Where the API lives, when it is not this dashboard's own address (`NEXT_PUBLIC_API_URL`).
   * The player preview calls it from the browser.
   */
  apiUrl?: string;
}

function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy({ nonce, dev = false, apiUrl }: CspOptions): string {
  const apiOrigin = originOf(apiUrl);
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    'script-src': [
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    'style-src': ["'self'", "'unsafe-inline'"],
    // Badge icons, avatars and reward pictures can be on any HTTPS address.
    'img-src': ["'self'", 'data:', 'blob:', 'https:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': [
      "'self'",
      ...(apiOrigin ? [apiOrigin] : []),
      TURNSTILE,
      ...(dev ? ['ws:', 'wss:'] : []),
    ],
    'frame-src': [TURNSTILE],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
  };
  return Object.entries(directives)
    .map(([name, sources]) => `${name} ${sources.join(' ')}`)
    .join('; ');
}

/** A fresh, unguessable nonce for one request. */
export function createNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}
