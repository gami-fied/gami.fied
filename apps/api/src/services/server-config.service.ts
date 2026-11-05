import {
  clearPlatformSettingsCache,
  db,
  getPlatformSettings,
  integrationSettingsSchema,
  notificationSettingsSchema,
  rateLimitSettingsSchema,
  registrationSettingsSchema,
  retentionSettingsSchema,
  securitySettingsSchema,
  serverConfigs,
  webhookSettingsSchema,
} from '@gami/database';
import { encryptSecret } from '@gami/webhooks';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { createAuditLog } from '../audit-logs/index.js';

export const smtpConfigSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.coerce.number().int().positive().default(587),
  user: z.string().optional().default(''),
  encryptedPassword: z.string().optional().default(''),
  fromEmail: z.string().email('Invalid from email address'),
  fromName: z.string().optional().default('Gami.Fied Engine'),
  secure: z.boolean().optional().default(false),
});

export const ALLOWED_CONFIG_SCHEMAS: Record<string, z.ZodSchema> = {
  smtp: smtpConfigSchema,
  security: securitySettingsSchema,
  registration: registrationSettingsSchema,
  rate_limits: rateLimitSettingsSchema,
  notifications: notificationSettingsSchema,
  webhooks: webhookSettingsSchema,
  integrations: integrationSettingsSchema,
  retention: retentionSettingsSchema,
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

    // Process raw password field into encryptedPassword if provided, or preserve existing
    const processedPayload = { ...payload };
    if (processedPayload.password && typeof processedPayload.password === 'string') {
      processedPayload.encryptedPassword = encryptSecret(processedPayload.password as string);
      delete processedPayload.password;
    } else {
      delete processedPayload.password;
      const existing = await this.getConfig<Record<string, unknown>>(category);
      if (existing && existing.encryptedPassword) {
        processedPayload.encryptedPassword = existing.encryptedPassword;
      }
    }

    if (category === 'security' && processedPayload.requireEmailOtpVerification === true) {
      if (!(await this.isSmtpConfigured())) {
        throw new Error('SMTP server must be configured before enabling Email OTP Verification.');
      }
    }

    const parseResult = schema.safeParse(processedPayload);
    if (!parseResult.success) {
      const issueMsgs = parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      throw new Error(`Invalid configuration payload for category "${category}": ${issueMsgs}`);
    }

    const validatedData = parseResult.data as Record<string, unknown>;
    const key = `${category}_config`;

    await db
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
      });

    clearPlatformSettingsCache();

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
    } catch (err) {
      console.warn('[ServerConfig] Failed to write audit log:', err);
    }

    return this.getConfigStatus(category);
  }

  public static getIntegrationsConfig() {
    return getPlatformSettings('integrations');
  }

  /** True when mail can be sent, from either the admin settings or the environment. */
  public static async isSmtpConfigured(): Promise<boolean> {
    const smtp = await this.getConfig<{ host?: unknown }>('smtp');
    const savedHost = typeof smtp?.host === 'string' && smtp.host.trim().length > 0;
    return savedHost || Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST !== 'localhost');
  }
}
