import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './client.js';
import { serverConfigs } from './schema/index.js';
import { createLogger } from '@gami/config';

const log = createLogger('Settings');

export const securitySettingsSchema = z.object({
  requireEmailOtpVerification: z.boolean().default(false),
  maxSessionLifetimeHours: z.number().int().min(1).max(720).default(168),
  loginRateLimit: z.number().int().min(1).max(1000).default(60),
  maxFailedLoginAttempts: z.number().int().min(1).max(50).default(5),
  lockoutDurationMinutes: z.number().int().min(1).max(1440).default(15),
  passwordMinLength: z.number().int().min(6).max(128).default(8),
  requireNumbers: z.boolean().default(false),
  requireSpecialChars: z.boolean().default(false),
});

export const registrationSettingsSchema = z.object({
  allowPublicRegistration: z.boolean().default(true),
  allowOrgCreation: z.boolean().default(true),
  allowApiKeyCreation: z.boolean().default(true),
  allowWebhookCreation: z.boolean().default(true),
  allowGlobalEmailNotifications: z.boolean().default(true),
});

/** Saved values win, then the env vars, so a self-hoster can set these either way. */
export const rateLimitSettingsSchema = z.object({
  perIpLimit: z
    .number()
    .int()
    .min(1)
    .default(() => Number(process.env['RATE_LIMIT_IP_MAX']) || 600),
  perProjectLimit: z
    .number()
    .int()
    .min(1)
    .default(() => Number(process.env['RATE_LIMIT_MAX']) || 1000),
  windowMs: z
    .number()
    .int()
    .min(1000)
    .default(() => (Number(process.env['RATE_LIMIT_WINDOW']) || 60) * 1000),
});

export const notificationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  defaultEmailNotifications: z.boolean().default(false),
  maxDailyEmailsPerUser: z.number().int().min(1).max(1000).default(50),
  retryAttempts: z.number().int().min(0).max(20).default(9),
});

export const webhookSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  maxWebhooksPerProject: z.number().int().min(1).max(500).default(50),
  defaultTimeoutMs: z.number().int().min(500).max(60000).default(10000),
  maxRetryAttempts: z.number().int().min(0).max(20).default(9),
});

export const integrationSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  allowDiscordIntegration: z.boolean().default(true),
});

/** A value of 0 keeps that data forever. Scheduled backups are off until an interval is set. */
export const retentionSettingsSchema = z.object({
  outboxDays: z.number().int().min(1).max(3650).default(30),
  ruleExecutionDays: z.number().int().min(0).max(3650).default(90),
  notificationDays: z.number().int().min(0).max(3650).default(0),
  eventDays: z.number().int().min(0).max(3650).default(0),
  backupIntervalHours: z.number().int().min(0).max(720).default(0),
  backupKeepCount: z.number().int().min(1).max(365).default(7),
});

const SETTINGS_SCHEMAS = {
  security: securitySettingsSchema,
  registration: registrationSettingsSchema,
  rate_limits: rateLimitSettingsSchema,
  notifications: notificationSettingsSchema,
  webhooks: webhookSettingsSchema,
  integrations: integrationSettingsSchema,
  retention: retentionSettingsSchema,
};

type SettingsCategory = keyof typeof SETTINGS_SCHEMAS;
type Settings<K extends SettingsCategory> = z.infer<(typeof SETTINGS_SCHEMAS)[K]>;

const CACHE_TTL_MS = 30_000;
const cache = new Map<SettingsCategory, { value: unknown; expiresAt: number }>();

export function clearPlatformSettingsCache(): void {
  cache.clear();
}

/**
 * Reads a settings category with defaults filled in. Other processes see a change within 30
 * seconds. If the database cannot be read, the defaults apply, so a settings lookup can never
 * take a request down.
 *
 * Inside a transaction, pass it as `client`. Otherwise the lookup waits for a second connection
 * while holding one, and enough concurrent transactions will deadlock the pool.
 */
export async function getPlatformSettings<K extends SettingsCategory>(
  category: K,
  client: Pick<typeof db, 'select'> = db
): Promise<Settings<K>> {
  const cached = cache.get(category);
  if (cached && cached.expiresAt > Date.now()) return cached.value as Settings<K>;

  const schema = SETTINGS_SCHEMAS[category];
  let stored: unknown = {};
  try {
    const [row] = await client
      .select({ value: serverConfigs.value })
      .from(serverConfigs)
      .where(eq(serverConfigs.key, `${category}_config`));
    stored = row?.value ?? {};
  } catch (err) {
    log.warn(`Using defaults for ${category}:`, (err as Error).message);
  }

  const parsed = schema.safeParse(stored);
  const value = (parsed.success ? parsed.data : schema.parse({})) as Settings<K>;

  if (process.env['NODE_ENV'] !== 'test') {
    cache.set(category, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  }
  return value;
}
