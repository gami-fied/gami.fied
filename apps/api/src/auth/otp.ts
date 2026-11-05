import crypto from 'crypto';
import { db, getAuthSecret, users, verification } from '@gami/database';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireSession, sendAuthError } from '../authorization/index.js';
import { consumeRateLimit } from '../middleware/rate-limiter.js';
import { sendPlatformEmail } from '../services/platform-email.js';
import { ServerConfigService } from '../services/server-config.service.js';

export const OTP_TTL_MS = 15 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_SENDS_PER_HOUR = 5;
const OTP_MAX_VERIFIES_PER_WINDOW = 20;

const verifyOtpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'OTP code must be exactly 6 digits'),
});

interface StoredOtp {
  hash: string;
  attempts: number;
}

export class OtpCooldownError extends Error {
  constructor() {
    super('Please wait before requesting another code.');
  }
}

const otpIdentifier = (email: string) => `otp:${email}`;

function hashOtp(email: string, code: string): string {
  return crypto.createHmac('sha256', getAuthSecret()).update(`${email}:${code}`).digest('hex');
}

function codesMatch(expectedHash: string, actualHash: string): boolean {
  const expected = Buffer.from(expectedHash);
  const actual = Buffer.from(actualHash);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function parseStoredOtp(value: string): StoredOtp | null {
  try {
    const parsed = JSON.parse(value) as Partial<StoredOtp>;
    return typeof parsed.hash === 'string' && typeof parsed.attempts === 'number'
      ? { hash: parsed.hash, attempts: parsed.attempts }
      : null;
  } catch {
    return null;
  }
}

async function findLatestOtp(identifier: string) {
  const [row] = await db
    .select()
    .from(verification)
    .where(eq(verification.identifier, identifier))
    .orderBy(desc(verification.createdAt))
    .limit(1);
  return row;
}

/**
 * Replaces any active code for the email and sends a new one.
 * Only a hash is stored, so a database read cannot reveal a usable code.
 */
export async function sendOtpEmailToUser(
  email: string
): Promise<{ otpCode: string; expiresAt: Date; sent: boolean }> {
  const targetEmail = email.toLowerCase().trim();
  const identifier = otpIdentifier(targetEmail);

  const existing = await findLatestOtp(identifier);
  if (
    existing?.createdAt &&
    Date.now() - existing.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS
  ) {
    throw new OtpCooldownError();
  }

  const otpCode = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);
  const stored: StoredOtp = { hash: hashOtp(targetEmail, otpCode), attempts: 0 };

  await db.delete(verification).where(eq(verification.identifier, identifier));
  await db.insert(verification).values({
    id: `ver_otp_${crypto.randomUUID()}`,
    identifier,
    value: JSON.stringify(stored),
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const sent = await sendPlatformEmail({
    to: targetEmail,
    subject: 'Your Gami.Fied verification code',
    html: `
      <div style="font-family: monospace; background-color: #09090b; color: #f4f4f5; padding: 24px; border: 1px solid #27272a;">
        <h2 style="color: #f97316; margin-top: 0;">ACCOUNT VERIFICATION</h2>
        <p style="font-size: 14px; color: #a1a1aa;">Your 6-digit verification code is:</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #06b6d4; background-color: #18181b; padding: 16px; text-align: center; border: 1px solid #3f3f46; margin: 16px 0;">
          ${otpCode}
        </div>
        <p style="font-size: 12px; color: #71717a;">This code expires in 15 minutes. If you did not request it, you can ignore this email.</p>
      </div>
    `,
    text: `Your Gami.Fied verification code is ${otpCode}. It expires in 15 minutes.`,
  });

  return { otpCode, expiresAt, sent };
}

/** Records a failed attempt. The update only applies if no other attempt got there first. */
async function recordFailedAttempt(rowId: string, previousValue: string, otp: StoredOtp) {
  await db
    .update(verification)
    .set({
      value: JSON.stringify({ ...otp, attempts: otp.attempts + 1 }),
      updatedAt: new Date(),
    })
    .where(and(eq(verification.id, rowId), eq(verification.value, previousValue)));
}

export async function otpRoutes(fastify: FastifyInstance) {
  // GET /api/auth/otp/status - Check if OTP verification is required & status
  fastify.get('/api/auth/otp/status', async (request, reply) => {
    const authResult = await requireSession(request, reply);
    if (!authResult) return;

    const securityCfg = await ServerConfigService.getConfig<Record<string, unknown>>('security');
    const requireOtp = Boolean(securityCfg?.requireEmailOtpVerification);

    const [userRow] = await db.select().from(users).where(eq(users.id, authResult.user.id));

    return reply.send({
      requireEmailOtpVerification: requireOtp,
      emailVerified: userRow ? userRow.emailVerified : false,
      userEmail: userRow?.email || authResult.user.email,
    });
  });

  // POST /api/auth/otp/send - Sends a code to the signed-in user's own address
  fastify.post('/api/auth/otp/send', async (request, reply) => {
    const authResult = await requireSession(request, reply);
    if (!authResult) return;

    const allowed = await consumeRateLimit(
      `otp:send:${authResult.user.id}`,
      OTP_MAX_SENDS_PER_HOUR,
      3600
    );
    if (!allowed) {
      return sendAuthError(request, reply, 429, 'TOO_MANY_REQUESTS', 'Too many codes requested. Try again later.');
    }

    try {
      const { expiresAt, sent } = await sendOtpEmailToUser(authResult.user.email);
      if (!sent) {
        return sendAuthError(
          request,
          reply,
          503,
          'EMAIL_NOT_SENT',
          'The verification email could not be sent. Please contact your administrator.'
        );
      }
      return reply.send({
        message: `Verification code sent to ${authResult.user.email}`,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (err) {
      if (err instanceof OtpCooldownError) {
        return sendAuthError(request, reply, 429, 'TOO_MANY_REQUESTS', err.message);
      }
      throw err;
    }
  });

  // POST /api/auth/otp/verify - Verifies a code for the signed-in user's own address
  fastify.post('/api/auth/otp/verify', async (request, reply) => {
    const authResult = await requireSession(request, reply);
    if (!authResult) return;

    const parseResult = verifyOtpSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid OTP code payload',
        details: parseResult.error.format(),
      });
    }

    const allowed = await consumeRateLimit(
      `otp:verify:${authResult.user.id}`,
      OTP_MAX_VERIFIES_PER_WINDOW,
      900
    );
    if (!allowed) {
      return sendAuthError(request, reply, 429, 'TOO_MANY_REQUESTS', 'Too many attempts. Try again later.');
    }

    const targetEmail = authResult.user.email.toLowerCase().trim();
    const identifier = otpIdentifier(targetEmail);
    const row = await findLatestOtp(identifier);
    const otp = row ? parseStoredOtp(row.value) : null;

    if (!row || !otp || new Date() > row.expiresAt) {
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid or expired OTP verification code',
      });
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await db.delete(verification).where(eq(verification.identifier, identifier));
      return sendAuthError(request, reply, 429, 'TOO_MANY_REQUESTS', 'Too many incorrect attempts. Request a new code.');
    }

    if (!codesMatch(otp.hash, hashOtp(targetEmail, parseResult.data.code))) {
      await recordFailedAttempt(row.id, row.value, otp);
      return reply.status(400).send({
        error: 'Bad Request',
        message: 'Invalid or expired OTP verification code',
      });
    }

    await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, authResult.user.id));

    await db.delete(verification).where(eq(verification.identifier, identifier));

    return reply.send({
      message: 'Email address verified successfully!',
      verified: true,
    });
  });
}
