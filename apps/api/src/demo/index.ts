/**
 * Live demos without an account, on a demo instance only (`GAMI_DEMO_MODE=true`).
 *
 *   GET  /api/demo          whether this instance offers demos, and the challenge's site key
 *   POST /api/demo/start    passes the challenge, creates a visitor account and a seeded demo,
 *                           and signs the visitor in with the usual session cookie
 *   POST /api/demo/traffic  sends a burst of events to the visitor's demo, so boards and toasts move
 *
 * Starting a demo is limited per address and in total, and needs a Cloudflare Turnstile token when
 * the instance has Turnstile keys. Every demo is locked down and deleted after it expires (see
 * `createDemoWorkspace` and the worker's demo cleanup).
 */
import crypto from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt } from 'drizzle-orm';
import { createLogger, demoSettings } from '@gami/config';
import { auth, countLiveDemos, createDemoWorkspace, db, endUsers, member, organizations, projects, users } from '@gami/database';
import { getRedisConnection } from '@gami/queue';
import { requireAuth } from '../authorization/index.js';
import { ingestEvent } from '../services/event-ingestion.js';

const log = createLogger('Demo');

const TRAFFIC_COOLDOWN_SECONDS = 8;
const TRAFFIC_EVENTS = 12;
const LANGUAGES = ['spanish', 'french', 'german', 'japanese', 'italian'];

/** Why starts were refused since this process started, for the metrics page. */
export const demoRefusals: Record<'rate_limited' | 'capacity' | 'challenge', number> = { rate_limited: 0, capacity: 0, challenge: 0 };

const hashAddress = (ip: string) => crypto.createHash('sha256').update(`demo:${ip}`).digest('hex').slice(0, 32);

const notOffered = (reply: FastifyReply) =>
  reply.status(404).send({ code: 'DEMO_NOT_AVAILABLE', message: 'This server does not offer live demos.' });

/** Checks a Turnstile token with Cloudflare. Skipped, with a warning at start-up, when no secret is set. */
export async function verifyChallenge(token: string | undefined, ip: string, secret: string | null): Promise<boolean> {
  if (!secret) return true;
  if (!token) return false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json()) as { success?: boolean };
    return body.success === true;
  } catch (err) {
    log.warn('Turnstile check failed', { message: (err as Error).message });
    return false;
  }
}

/**
 * The Redis connection, once it is ready. It does not queue commands while connecting, so a
 * request straight after start-up would otherwise fail.
 */
async function readyRedis() {
  const redis = getRedisConnection();
  if (redis.status === 'ready') return redis;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Redis is not available')), 3000);
    redis.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  return redis;
}

/** Counts one start for this address in the current hour. Returns false when it is over the limit. */
async function allowStart(ip: string, perHour: number): Promise<boolean> {
  const redis = await readyRedis();
  const key = `demo:starts:${hashAddress(ip)}`;
  const used = await redis.incr(key);
  if (used === 1) await redis.expire(key, 3600);
  return used <= perHour;
}

/** The visitor's live demo organization and its project, or null. */
async function liveDemoFor(userId: string) {
  const [row] = await db
    .select({ organizationId: organizations.id, projectId: projects.id, expiresAt: organizations.demoExpiresAt })
    .from(member)
    .innerJoin(organizations, eq(organizations.id, member.organizationId))
    .innerJoin(projects, eq(projects.organizationId, organizations.id))
    .where(and(eq(member.userId, userId), gt(organizations.demoExpiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function demoRoutes(fastify: FastifyInstance) {
  const settings = demoSettings();
  if (settings.enabled) {
    log.info('Live demos are on', { ttlHours: settings.ttlHours, maxLive: settings.maxLive, startsPerHour: settings.startsPerHour });
    if (!settings.turnstileSecretKey) log.warn('TURNSTILE_SECRET_KEY is not set, so starting a demo needs no challenge. Set it before going public.');
  }

  fastify.get('/api/demo', async () => ({
    enabled: settings.enabled,
    ttlHours: settings.enabled ? settings.ttlHours : null,
    turnstileSiteKey: settings.enabled ? settings.turnstileSiteKey : null,
  }));

  fastify.post<{ Body: { turnstileToken?: string } }>('/api/demo/start', async (request: FastifyRequest<{ Body: { turnstileToken?: string } }>, reply) => {
    if (!settings.enabled) return notOffered(reply);

    // Without Redis there is no per-address limit, so no demo starts at all.
    let allowed: boolean;
    try {
      allowed = await allowStart(request.ip, settings.startsPerHour);
    } catch (err) {
      log.error('Demo start refused: Redis is not available', { message: (err as Error).message });
      return reply.status(503).send({ code: 'DEMO_UNAVAILABLE', message: 'Demos are not available right now. Try again in a minute.' });
    }
    if (!allowed) {
      demoRefusals.rate_limited++;
      return reply.status(429).send({ code: 'DEMO_RATE_LIMITED', message: 'You have started a few demos already. Try again in an hour.' });
    }
    const live = await countLiveDemos();
    if (live >= settings.maxLive) {
      demoRefusals.capacity++;
      log.error('Live demo cap reached', { live, maxLive: settings.maxLive });
      return reply.status(503).send({ code: 'DEMO_AT_CAPACITY', message: 'Every demo slot is in use right now. Try again in a little while.' });
    }
    if (!(await verifyChallenge(request.body?.turnstileToken, request.ip, settings.turnstileSecretKey))) {
      demoRefusals.challenge++;
      return reply.status(403).send({ code: 'DEMO_CHALLENGE_FAILED', message: 'The check that you are a person did not pass. Reload the page and try again.' });
    }

    // A real account with an address nobody can receive mail at, and a password nobody knows.
    const id = crypto.randomBytes(8).toString('hex');
    const signUp = await auth.api.signUpEmail({
      body: { email: `visitor-${id}@demo.invalid`, password: crypto.randomBytes(24).toString('base64url'), name: 'Demo visitor' },
      headers: new Headers({ 'x-forwarded-for': request.ip }),
      asResponse: true,
    });
    if (!signUp.ok) {
      log.error('Could not create a demo visitor', { status: signUp.status });
      return reply.status(500).send({ code: 'DEMO_START_FAILED', message: 'The demo could not be started. Try again.' });
    }
    const { user } = (await signUp.json()) as { user: { id: string } };
    // Nobody can verify this address, and a demo should not ask.
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));

    let demo;
    try {
      demo = await createDemoWorkspace({ ownerUserId: user.id, ttlHours: settings.ttlHours });
    } catch (err) {
      await db.delete(users).where(eq(users.id, user.id));
      log.error('Could not seed a demo', err);
      return reply.status(500).send({ code: 'DEMO_START_FAILED', message: 'The demo could not be started. Try again.' });
    }

    for (const cookie of signUp.headers.getSetCookie()) reply.header('set-cookie', cookie);
    log.info('Demo started', { organizationId: demo.organizationId, live: live + 1 });
    return reply.status(201).send({
      organizationId: demo.organizationId,
      projectId: demo.projectId,
      expiresAt: demo.expiresAt.toISOString(),
      players: demo.players,
      events: demo.events,
    });
  });

  fastify.post('/api/demo/traffic', async (request, reply) => {
    if (!settings.enabled) return notOffered(reply);
    const session = await requireAuth(request, reply);
    if (!session) return;
    const demo = await liveDemoFor(session.user.id);
    if (!demo) return reply.status(404).send({ code: 'DEMO_NOT_FOUND', message: 'You have no live demo.' });

    const cooling = await (await readyRedis()).set(`demo:traffic:${demo.organizationId}`, '1', 'EX', TRAFFIC_COOLDOWN_SECONDS, 'NX');
    if (!cooling) return reply.status(429).send({ code: 'DEMO_TRAFFIC_COOLDOWN', message: 'Traffic is on its way. Give it a few seconds.' });

    const players = await db.select({ externalId: endUsers.externalId }).from(endUsers).where(and(eq(endUsers.projectId, demo.projectId), eq(endUsers.active, true))).limit(200);
    if (players.length === 0) return reply.status(409).send({ code: 'DEMO_NO_PLAYERS', message: 'This demo has no players left to send events for.' });

    const sent: string[] = [];
    for (let i = 0; i < TRAFFIC_EVENTS; i++) {
      const player = players[crypto.randomInt(players.length)]!;
      const result = await ingestEvent({
        projectId: demo.projectId,
        eventType: 'lesson_completed',
        externalUserId: player.externalId,
        payload: { language: LANGUAGES[crypto.randomInt(LANGUAGES.length)], score: crypto.randomInt(100) < 15 ? 100 : 60 + crypto.randomInt(39), source: 'demo_traffic' },
        occurredAt: new Date(),
      });
      if (result.outcome === 'accepted') sent.push(player.externalId);
    }
    return reply.send({ sent: sent.length, players: [...new Set(sent)] });
  });
}

/** Live demos and refusals, for `/metrics` on a demo instance. */
export async function demoMetricSamples(): Promise<{ name: string; labels?: Record<string, string>; value: number }[]> {
  const settings = demoSettings();
  if (!settings.enabled) return [];
  const live = await countLiveDemos();
  return [
    { name: 'gami_demo_live', value: live },
    { name: 'gami_demo_capacity', value: settings.maxLive },
    ...Object.entries(demoRefusals).map(([reason, value]) => ({ name: 'gami_demo_refused_total', labels: { reason }, value })),
  ];
}

