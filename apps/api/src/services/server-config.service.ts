import { db, serverConfigs } from '@gami/database';
import { decryptSecret, encryptSecret } from '@gami/webhooks';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createAuditLog } from '../audit-logs/index.js';

export const smtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().positive().default(587),
  user: z.string().optional().default(''),
  encryptedPassword: z.string().optional().default(''),
  fromEmail: z.string().email(),
  fromName: z.string().optional().default('Gami Engine'),
  secure: z.boolean().optional().default(false),
});

export const securityConfigSchema = z.object({
  sessionExpirationMinutes: z.number().int().min(1).max(10080).default(1440),
  maxSessionLifetimeHours: z.number().int().min(1).max(720).default(168),
  loginRateLimit: z.number().int().min(1).max(1000).default(60),
  apiRateLimit: z.number().int().min(1).max(100000).default(1000),
  eventIngestionRateLimit: z.number().int().min(1).max(100000).default(10000),
  maxFailedLoginAttempts: z.number().int().min(1).max(50).default(5),
  lockoutDurationMinutes: z.number().int().min(1).max(1440).default(15),
  passwordMinLength: z.number().int().min(6).max(128).default(8),
  requireNumbers: z.boolean().default(false),
  requireSpecialChars: z.boolean().default(false),
});

export const registrationConfigSchema = z.object({
  allowPublicRegistration: z.boolean().default(true),
  allowOrgCreation: z.boolean().default(true),
  allowApiKeyCreation: z.boolean().default(true),
  allowWebhookCreation: z.boolean().default(true),
  allowGlobalEmailNotifications: z.boolean().default(true),
});

export const rateLimitsConfigSchema = z.object({
  perIpLimit: z.number().int().min(1).default(100),
  perProjectLimit: z.number().int().min(1).default(1000),
  windowMs: z.number().int().min(1000).default(60000),
});

export const notificationsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  defaultEmailNotifications: z.boolean().default(false),
  maxDailyEmailsPerUser: z.number().int().min(1).max(1000).default(50),
  retryAttempts: z.number().int().min(0).max(20).default(5),
});

export const webhooksConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxWebhooksPerProject: z.number().int().min(1).max(500).default(50),
  defaultTimeoutMs: z.number().int().min(500).max(60000).default(5000),
  maxRetryAttempts: z.number().int().min(0).max(20).default(5),
});

export const integrationsConfigSchema = z.object({
  enabled: z.boolean().default(true),
  allowExternalSso: z.boolean().default(true),
  allowSlackIntegration: z.boolean().default(true),
  allowDiscordIntegration: z.boolean().default(true),
});

export const ALLOWED_CONFIG_SCHEMAS: Record<string, z.ZodSchema> = {
  smtp: smtpConfigSchema,
  security: securityConfigSchema,
  registration: registrationConfigSchema,
  rate_limits: rateLimitsConfigSchema,
  notifications: notificationsConfigSchema,
  webhooks: webhooksConfigSchema,
  integrations: integrationsConfigSchema,
};

export class ServerConfigService {
  /**
   * Retrieves raw internal configuration for a category.
   */
  public static async getConfig<T = Record<string, unknown>>(category: string): Promise<T | null> {
    const key = `${category}_config`;
    const [row] = await db
      .select()
      .from(serverConfigs)
      .where(eq(serverConfigs.key, key));

    if (!row || !row.value) return null;
    return row.value as T;
  }

  /**
   * Retrieves safe configuration status with sensitive credentials redacted.
   */
  public static async getConfigStatus(category: string): Promise<Record<string, unknown>> {
    const cfg = await this.getConfig<Record<string, unknown>>(category);
    if (!cfg) {
      return { configured: false, category };
    }

    const safeStatus: Record<string, unknown> = {
      configured: true,
      category,
    };

    for (const [propKey, propVal] of Object.entries(cfg)) {
      if (propKey.toLowerCase().includes('password') || propKey.toLowerCase().includes('secret')) {
        safeStatus[`${propKey}Configured`] = Boolean(propVal);
        safeStatus[propKey] = '[REDACTED]';
      } else {
        safeStatus[propKey] = propVal;
      }
    }

    return safeStatus;
  }

  /**
   * Validates, encrypts sensitive fields, and saves server configuration for an allowlisted category.
   */
  public static async setConfig(
    category: string,
    payload: Record<string, unknown>,
    actorId = 'platform_admin'
  ): Promise<Record<string, unknown>> {
    const schema = ALLOWED_CONFIG_SCHEMAS[category];
    if (!schema) {
      throw new Error(`Invalid or unallowlisted server configuration category: "${category}"`);
    }

    // Process raw password field into encryptedPassword if provided
    const processedPayload = { ...payload };
    if (processedPayload.password && typeof processedPayload.password === 'string') {
      processedPayload.encryptedPassword = encryptSecret(processedPayload.password as string);
      delete processedPayload.password;
    }

    const parseResult = schema.safeParse(processedPayload);
    if (!parseResult.success) {
      throw new Error(`Invalid configuration payload for category "${category}": ${parseResult.error.message}`);
    }

    const validatedData = parseResult.data as Record<string, unknown>;
    const key = `${category}_config`;

    const [upserted] = await db
      .insert(serverConfigs)
      .values({
        key,
        value: validatedData,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [serverConfigs.key],
        set: {
          value: validatedData,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Log security audit event
    try {
      await createAuditLog(db, {
        actorType: 'system',
        actorId,
        action: `admin.config_updated`,
        severity: 'warning',
        resourceType: 'server_config',
        resourceId: key,
        metadata: { category },
      });
    } catch {}

    return this.getConfigStatus(category);
  }

  public static async getIntegrationsConfig(): Promise<{
    enabled: boolean;
    allowExternalSso: boolean;
    allowSlackIntegration: boolean;
    allowDiscordIntegration: boolean;
  }> {
    const cfg = await this.getConfig<Record<string, unknown>>('integrations');
    const parse = integrationsConfigSchema.safeParse(cfg || {});
    return parse.success ? parse.data : integrationsConfigSchema.parse({});
  }
}
