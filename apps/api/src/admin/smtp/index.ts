import { db, serverConfigs } from '@gami/database';
import { getSmtpProviderFromConfig, SmtpConfig } from '@gami/notifications';
import { decryptSecret, encryptSecret } from '@gami/webhooks';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createAuditLog } from '../../audit-logs/index.js';
import { requirePlatformAdmin } from '../../authorization/index.js';

const smtpConfigSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.coerce.number().int().positive().default(587),
  user: z.string().optional().default(''),
  password: z.string().optional().default(''),
  fromEmail: z.string().email('Invalid from email address'),
  fromName: z.string().optional().default('Gami Engine'),
  secure: z.boolean().optional().default(false),
});

const sendTestEmailSchema = z.object({
  recipientEmail: z.string().email('Invalid recipient email address'),
});

export async function adminSmtpRoutes(fastify: FastifyInstance) {
  // GET /api/admin/smtp (Get Server SMTP Config Status - Platform Admin)
  fastify.get('/api/admin/smtp', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const [row] = await db
      .select()
      .from(serverConfigs)
      .where(eq(serverConfigs.key, 'smtp_config'));

    if (!row || !row.value) {
      return reply.send({
        configured: false,
        host: null,
        port: 587,
        user: null,
        fromEmail: null,
        fromName: null,
        secure: false,
        updatedAt: null,
      });
    }

    const cfg = row.value as Record<string, unknown>;

    return reply.send({
      configured: true,
      host: cfg.host || null,
      port: cfg.port || 587,
      user: cfg.user || null,
      fromEmail: cfg.fromEmail || null,
      fromName: cfg.fromName || 'Gami Engine',
      secure: Boolean(cfg.secure),
      passwordConfigured: Boolean(cfg.encryptedPassword),
      password: '[REDACTED]',
      updatedAt: row.updatedAt,
    });
  });

  // PUT /api/admin/smtp (Save/Update Server SMTP Config - Platform Admin)
  fastify.put('/api/admin/smtp', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const parseResult = smtpConfigSchema.safeParse(request.body);
    if (!parseResult.success) {
      const issueMsgs = parseResult.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join(', ');
      return reply.status(400).send({
        error: 'Bad Request',
        message: `Invalid SMTP configuration parameters (${issueMsgs})`,
        details: parseResult.error.format(),
      });
    }

    const { host, port, user, password, fromEmail, fromName, secure } = parseResult.data;

    // Check if existing password should be preserved if password field left blank
    let encryptedPassword = '';
    if (password) {
      encryptedPassword = encryptSecret(password);
    } else {
      const [existingRow] = await db
        .select()
        .from(serverConfigs)
        .where(eq(serverConfigs.key, 'smtp_config'));
      if (existingRow && existingRow.value) {
        encryptedPassword = (existingRow.value as Record<string, unknown>).encryptedPassword as string || '';
      }
    }

    const configPayload = {
      host,
      port,
      user,
      encryptedPassword,
      fromEmail,
      fromName,
      secure,
    };

    const [upserted] = await db
      .insert(serverConfigs)
      .values({
        key: 'smtp_config',
        value: configPayload,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [serverConfigs.key],
        set: {
          value: configPayload,
          updatedAt: new Date(),
        },
      })
      .returning();

    // Verify SMTP connection in background
    let decryptedPass = '';
    if (encryptedPassword) {
      try { decryptedPass = decryptSecret(encryptedPassword); } catch {}
    }

    const provider = getSmtpProviderFromConfig({
      host,
      port,
      user,
      password: decryptedPass,
      fromEmail,
      fromName,
      secure,
    });

    const isConnected = provider ? await provider.verifyConnection() : false;

    // Log Audit Event (Without exposing SMTP password)
    try {
      await createAuditLog(db, {
        projectId: 'system_global',
        actorType: 'system',
        actorId: 'platform_admin',
        action: 'smtp.configured',
        resourceType: 'server_config',
        resourceId: 'smtp_config',
        metadata: {
          host,
          port,
          fromEmail,
          fromName,
          secure,
          verified: isConnected,
        },
      });
    } catch {
      // Ignore audit log FK errors for global system operations
    }

    return reply.send({
      message: 'SMTP configuration saved successfully',
      configured: true,
      verified: isConnected,
      updatedAt: upserted?.updatedAt || new Date(),
    });
  });

  // POST /api/admin/smtp/test (Send Test Email - Platform Admin)
  fastify.post('/api/admin/smtp/test', async (request, reply) => {
    const adminAuth = await requirePlatformAdmin(request, reply);
    if (!adminAuth) return;

    const parseResult = sendTestEmailSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid test email payload',
        details: parseResult.error.format(),
      });
    }

    const { recipientEmail } = parseResult.data;

    const [row] = await db
      .select()
      .from(serverConfigs)
      .where(eq(serverConfigs.key, 'smtp_config'));

    if (!row || !row.value) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'SMTP configuration is not set up on server',
      });
    }

    const cfg = row.value as Record<string, unknown>;
    let password = '';
    if (cfg.encryptedPassword) {
      try {
        password = decryptSecret(cfg.encryptedPassword as string);
      } catch {
        password = cfg.encryptedPassword as string;
      }
    }

    const config: SmtpConfig = {
      host: cfg.host as string,
      port: Number(cfg.port) || 587,
      user: cfg.user as string,
      password,
      fromEmail: cfg.fromEmail as string,
      fromName: cfg.fromName as string,
      secure: Boolean(cfg.secure),
    };

    const provider = getSmtpProviderFromConfig(config);
    if (!provider) {
      return reply.status(500).send({
        error: 'Internal Server Error',
        message: 'Failed to initialize SMTP provider',
      });
    }

    try {
      await provider.sendEmail({
        to: recipientEmail,
        subject: '⚡ [Gami.Fied Engine] SMTP Connection Verification Test',
        html: `<div style="font-family: monospace; padding: 20px; background: #18181b; color: #f4f4f5; border: 1px solid #27272a;">
          <h2 style="color: #10b981; margin-top: 0;">⚡ Gami.Fied SMTP Connection Verification Test</h2>
          <p>Your Gami.Fied Engine SMTP notification server configuration is working correctly!</p>
          <p style="color: #71717a; font-size: 11px;">Timestamp: ${new Date().toISOString()}</p>
        </div>`,
        text: `[Gami.Fied Engine] SMTP Connection Verification Test\n\nYour Gami.Fied Engine SMTP notification server configuration is working correctly!\nTimestamp: ${new Date().toISOString()}`,
      });

      try {
        await createAuditLog(db, {
          projectId: 'system_global',
          actorType: 'system',
          actorId: 'platform_admin',
          action: 'smtp.test_sent',
          resourceType: 'server_config',
          resourceId: 'smtp_config',
          metadata: {
            recipientEmail,
            status: 'success',
          },
        });
      } catch {}

      return reply.send({
        success: true,
        message: `Test email successfully delivered to ${recipientEmail}`,
      });
    } catch (err: unknown) {
      const errorMessage = (err as Error).message || String(err);

      try {
        await createAuditLog(db, {
          projectId: 'system_global',
          actorType: 'system',
          actorId: 'platform_admin',
          action: 'smtp.test_sent',
          resourceType: 'server_config',
          resourceId: 'smtp_config',
          metadata: {
            recipientEmail,
            status: 'failed',
            error: errorMessage,
          },
        });
      } catch {}

      return reply.status(500).send({
        error: 'SMTP Delivery Failed',
        message: `Failed to deliver test email to ${recipientEmail}: ${errorMessage}`,
      });
    }
  });
}
