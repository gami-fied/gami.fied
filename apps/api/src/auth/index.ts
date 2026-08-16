import { auth } from '@gami/database';
import type { FastifyInstance } from 'fastify';
import { sendOtpEmailToUser } from './otp.js';
import { ServerConfigService } from '../services/server-config.service.js';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.all('/api/auth/*', async (request, reply) => {
    if (request.method === 'OPTIONS') {
      return reply.status(200).send();
    }

    const protocol = request.headers['x-forwarded-proto'] || request.protocol || 'http';
    const host = request.headers['x-forwarded-host'] || request.headers.host || 'localhost:3001';
    const url = new URL(request.url, `${protocol}://${host}`);

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

    let body: string | undefined = undefined;
    if (request.body && Object.keys(request.body as object).length > 0) {
      body = JSON.stringify(request.body);
    }

    const webReq = new Request(url.toString(), {
      method: request.method,
      headers: reqHeaders,
      body: ['GET', 'HEAD'].includes(request.method) ? undefined : body,
    });

    const response = await auth.handler(webReq);

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
        console.error('[Auth] Error triggering auto OTP dispatch on sign-up:', err);
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
