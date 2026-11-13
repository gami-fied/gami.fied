/**
 * Settings for a demo instance, which lets visitors start a throwaway workspace without an
 * account. Only an instance with `GAMI_DEMO_MODE=true` offers it, so a normal install never does.
 */

export interface DemoSettings {
  enabled: boolean;
  /** How long a demo lives before the worker deletes it. */
  ttlHours: number;
  /** Most demos alive at once. Starting one more is refused until some expire. */
  maxLive: number;
  /** Demos one address may start in an hour. */
  startsPerHour: number;
  /** Cloudflare Turnstile keys. Without them the challenge is skipped, which is only for development. */
  turnstileSiteKey: string | null;
  turnstileSecretKey: string | null;
}

const positive = (value: string | undefined, fallback: number) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
};

export function demoSettings(env: NodeJS.ProcessEnv = process.env): DemoSettings {
  return {
    enabled: env['GAMI_DEMO_MODE'] === 'true',
    ttlHours: positive(env['GAMI_DEMO_TTL_HOURS'], 24),
    maxLive: positive(env['GAMI_DEMO_MAX_LIVE'], 200),
    startsPerHour: positive(env['GAMI_DEMO_STARTS_PER_HOUR'], 3),
    turnstileSiteKey: env['TURNSTILE_SITE_KEY'] || null,
    turnstileSecretKey: env['TURNSTILE_SECRET_KEY'] || null,
  };
}

/** True on a demo instance. A demo instance sends no email at all. */
export const isDemoInstance = (env: NodeJS.ProcessEnv = process.env) => env['GAMI_DEMO_MODE'] === 'true';
