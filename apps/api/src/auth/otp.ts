import { db, users, verification } from '@gami/database';
import { getSmtpProviderFromConfig } from '@gami/notifications';
import { decryptSecret } from '@gami/webhooks';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireAuthSession } from '../authorization/index.js';
import { ServerConfigService } from '../services/server-config.service.js';

const sendOtpSchema = z.object({
  email: z.string().email().optional(),
});

const verifyOtpSchema = z.object({
  email: z.string().email().optional(),
  code: z.string().length(6, 'OTP code must be exactly 6 digits'),
});

export async function sendOtpEmailToUser(email: string): Promise<{ otpCode: string; expiresAt: Date }> {
  const targetEmail = email.toLowerCase().trim();
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  const verificationId = `ver_otp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Delete previous verification tokens for this email to prevent stale code collisions
  try {
    await db.delete(verification).where(eq(verification.identifier, targetEmail));
  } catch {
    // Ignore
  }

  // Store new OTP in verification table
  await db
    .insert(verification)
    .values({
      id: verificationId,
      identifier: targetEmail,
      value: otpCode,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  // Dispatch transactional OTP email (Bypasses marketing email unsubscribe preferences)
  const smtpCfg = await ServerConfigService.getConfig<Record<string, unknown>>('smtp');
  if (smtpCfg && smtpCfg.host && smtpCfg.encryptedPassword) {
    try {
      let decryptedPass = '';
      try {
        decryptedPass = decryptSecret(smtpCfg.encryptedPassword as string);
      } catch (err) {
        console.error('[OTP] Failed to decrypt SMTP password:', err);
      }

      const provider = getSmtpProviderFromConfig({
        host: smtpCfg.host as string,
        port: (smtpCfg.port as number) || 587,
        user: (smtpCfg.user as string) || '',
        password: decryptedPass,
        fromEmail: (smtpCfg.fromEmail as string) || 'noreply@gami.engine',
        fromName: (smtpCfg.fromName as string) || 'Gami Security',
        secure: Boolean(smtpCfg.secure),
      });

      if (!provider) {
        console.error('[OTP] Could not create Nodemailer SMTP provider');
        return { otpCode, expiresAt };
      }

      await provider.sendEmail({
        to: targetEmail,
        subject: `🔐 [Gami.Fied Platform] Your Account Verification OTP Code: ${otpCode}`,
        html: `
          <div style="font-family: monospace; background-color: #09090b; color: #f4f4f5; padding: 24px; border: 1px solid #27272a;">
            <h2 style="color: #f97316; margin-top: 0;">ACCOUNT VERIFICATION OTP</h2>
            <p style="font-size: 14px; color: #a1a1aa;">Your 6-digit Email Verification OTP code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #06b6d4; background-color: #18181b; padding: 16px; text-align: center; border: 1px solid #3f3f46; margin: 16px 0;">
              ${otpCode}
            </div>
            <p style="font-size: 12px; color: #71717a;">This security code expires in 15 minutes. Transactional email security notice: Security &amp; OTP verification emails are mandatory and cannot be unsubscribed.</p>
          </div>
        `,
        text: `Your Gami.Fied Engine OTP verification code is: ${otpCode}. Expires in 15 minutes.`,
      });
    } catch (err) {
      console.error('[OTP] Error dispatching SMTP OTP email:', err);
    }
  }

  return { otpCode, expiresAt };
}

export async function otpRoutes(fastify: FastifyInstance) {
  // GET /api/auth/otp/status - Check if OTP verification is required & status
  fastify.get('/api/auth/otp/status', async (request, reply) => {
    const authResult = await requireAuthSession(request, reply);
    if (!authResult) return;

    const securityCfg = await ServerConfigService.getConfig<Record<string, unknown>>('security');
    const requireOtp = Boolean(securityCfg?.requireEmailOtpVerification);

    const [userRow] = await db
      .select()
      .from(users)
      .where(eq(users.id, authResult.user.id));

    return reply.send({
      requireEmailOtpVerification: requireOtp,
      emailVerified: userRow ? userRow.emailVerified : false,
      userEmail: userRow?.email || authResult.user.email,
    });
  });

  // POST /api/auth/otp/send - Generate & dispatch transactional OTP email
  fastify.post('/api/auth/otp/send', async (request, reply) => {
    const authResult = await requireAuthSession(request, reply);
    if (!authResult) return;

    const parseResult = sendOtpSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({ error: 'Bad Request', message: 'Invalid payload' });
    }

    const email = parseResult.data.email || authResult.user.email;
    const { expiresAt } = await sendOtpEmailToUser(email);

    return reply.send({
      message: `OTP verification code sent to ${email}`,
      expiresAt: expiresAt.toISOString(),
    });
  });

  // POST /api/auth/otp/verify - Verify 6-digit OTP code
  fastify.post('/api/auth/otp/verify', async (request, reply) => {
    const authResult = await requireAuthSession(request, reply);
    if (!authResult) return;

    const parseResult = verifyOtpSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid OTP code payload',
        details: parseResult.error.format(),
      });
    }

    const { code } = parseResult.data;
    const targetEmail = (parseResult.data.email || authResult.user.email).toLowerCase().trim();

    const [verRow] = await db
      .select()
      .from(verification)
      .where(eq(verification.identifier, targetEmail))
      .orderBy(desc(verification.createdAt))
      .limit(1);

    if (!verRow || verRow.value.trim() !== code.trim()) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid or expired OTP verification code',
      });
    }

    if (new Date() > verRow.expiresAt) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'OTP verification code has expired. Please request a new code.',
      });
    }

    // Mark email as verified for user
    await db
      .update(users)
      .set({
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, authResult.user.id));

    // Delete verification token(s) for target email
    await db.delete(verification).where(eq(verification.identifier, targetEmail));

    return reply.send({
      message: 'Email address verified successfully!',
      verified: true,
    });
  });
}
