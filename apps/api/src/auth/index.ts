import { auth, setPasswordResetSender } from '@gami/database';
import type { FastifyInstance } from 'fastify';
import { OtpCooldownError, sendOtpEmailToUser } from './otp.js';
import { checkAuthPolicy, recordSignInResult } from './policy.js';
import { sendPlatformEmail } from '../services/platform-email.js';
import { ServerConfigService } from '../services/server-config.service.js';
import { createLogger } from '@gami/config';

const log = createLogger('Auth');

export async function authRoutes(fastify: FastifyInstance) {
  setPasswordResetSender(async ({ email, url }) => {
    await sendPlatformEmail({
      to: email,
      subject: 'Reset your Gami.Fied password',
      html: `<p>Use this link to reset your password. It expires in one hour.</p><p><a href="${url}">Reset password</a></p><p>If you did not request this, you can ignore this email.</p>`,
      text: `Use this link to reset your password. It expires in one hour: ${url}`,
    });
  });

  fastify.all('/api/auth/*', async (request, reply) => {
    if (request.method === 'OPTIONS') {
      return reply.status(200).send();
    }

    // The public address comes from configuration, never from client-controlled headers.
    const url = new URL(request.url, process.env['BETTER_AUTH_URL'] || 'http://localhost:3001');

    const reqHeaders = new Headers();
    Object.entries(request.headers).forEach(([key, val]) => {
      if (val !== undefined) {
        if (Array.isArray(val)) {
          val.forEach((v) => reqHeaders.append(key, v));
        } else {
          reqHeaders.set(key, val);
        }
      }
    });

    // Better Auth rate limits by this header, so it must hold the address Fastify trusts.
    reqHeaders.delete('x-forwarded-host');
    reqHeaders.delete('x-forwarded-proto');
    reqHeaders.set('x-forwarded-for', request.ip);

    let body: string | undefined = undefined;
    if (request.body && Object.keys(request.body as object).length > 0) {
      body = JSON.stringify(request.body);
    }

    const webReq = new Request(url.toString(), {
      method: request.method,
      headers: reqHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : body,
    });

    const authBody = request.body as { email?: string; password?: string; newPassword?: string };

    if (request.method === 'POST') {
      const denial = await checkAuthPolicy({
        path: url.pathname,
        ip: request.ip,
        body: authBody,
        headers: reqHeaders,
      });
      if (denial) {
        return reply.status(denial.status).send({ code: denial.code, message: denial.message });
      }
    }

    const response = await auth.handler(webReq);

    if (request.method === 'POST' && url.pathname.endsWith('/sign-in/email') && authBody?.email) {
      await recordSignInResult(authBody.email, response.ok);
    }

    // If sign-up via email succeeded, check if Platform Email OTP Verification is enabled
    if (
      request.method === 'POST' &&
      url.pathname.endsWith('/sign-up/email') &&
      response.status === 200
    ) {
      try {
        const securityCfg = await ServerConfigService.getConfig<Record<string, unknown>>('security');
        if (securityCfg && securityCfg.requireEmailOtpVerification) {
          const reqBody = request.body as { email?: string } | undefined;
          if (reqBody && reqBody.email) {
            await sendOtpEmailToUser(reqBody.email);
          }
        }
      } catch (err) {
        if (!(err instanceof OtpCooldownError)) {
          log.error('Error triggering auto OTP dispatch on sign-up:', err);
        }
      }
    }

    reply.status(response.status);
    response.headers.forEach((value: string, key: string) => {
      reply.header(key, value);
    });

    const responseText = await response.text();
    try {
      return reply.send(JSON.parse(responseText));
    } catch {
      return reply.send(responseText);
    }
  });
}
