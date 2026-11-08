import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { createLogger } from '@gami/config';
import { db, notifications, userXpBalances } from '@gami/database';
import { subscribeRealtime, type RealtimeMessage } from '@gami/queue';
import { and, asc, eq, sql } from 'drizzle-orm';
import { requireProjectAccess } from '../authorization/index.js';

const log = createLogger('Realtime');

const HEARTBEAT_MS = 25_000;
/** Streams also catch up on a timer, so a missed nudge costs a few seconds and nothing is lost. */
const CATCH_UP_MS = 15_000;
/** Nudges for one stream are batched into one lookup. */
const COALESCE_MS = 250;
export const MAX_STREAMS_PER_USER = 5;
export const MAX_STREAMS_PER_PROCESS = 5000;

interface Cursor {
  at: Date;
  id: string;
}

interface Stream {
  projectId: string;
  /** The player a stream belongs to, or null for a staff stream that only gets nudges. */
  userId: string | null;
  write: (event: string, data: unknown, id?: string) => void;
  /** Called when something may have changed. */
  wake: () => void;
  /** Ends the response, for shutdown. */
  end: () => void;
}

/** Fans messages from Redis out to the streams open on this API process. */
class RealtimeHub {
  private streams = new Set<Stream>();
  private stop: (() => Promise<void>) | null = null;
  private starting: Promise<void> | null = null;

  add(stream: Stream): void {
    this.streams.add(stream);
    void this.ensureListening();
  }

  remove(stream: Stream): void {
    this.streams.delete(stream);
  }

  count(userId?: string): number {
    if (!userId) return this.streams.size;
    let total = 0;
    for (const stream of this.streams) if (stream.userId === userId) total++;
    return total;
  }

  deliver(message: RealtimeMessage): void {
    for (const stream of this.streams) {
      if (stream.projectId !== message.projectId) continue;
      // Players hear about their own changes. Staff streams hear about every change in the project.
      if (stream.userId === null || stream.userId === message.userId) stream.wake();
    }
  }

  private ensureListening(): Promise<void> {
    if (this.stop) return Promise.resolve();
    this.starting ??= subscribeRealtime((message) => this.deliver(message))
      .then((stop) => {
        this.stop = stop;
      })
      .catch((err) => log.warn('Could not start listening for realtime nudges', { error: (err as Error).message }))
      .finally(() => {
        this.starting = null;
      });
    return this.starting;
  }

  async close(): Promise<void> {
    for (const stream of [...this.streams]) {
      stream.write('close', {});
      stream.end();
    }
    this.streams.clear();
    await this.stop?.();
    this.stop = null;
  }
}

export const realtimeHub = new RealtimeHub();

/** Opens a text/event-stream on a raw response and returns helpers for writing to it. */
function openStream(request: FastifyRequest, reply: FastifyReply, onClose: () => void) {
  // Hijacking skips the usual hooks, so headers they set (CORS, security) are copied across.
  const inherited = reply.getHeaders() as Record<string, string | string[]>;
  reply.hijack();
  const raw = reply.raw;
  raw.writeHead(200, {
    ...inherited,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // Tells proxies such as nginx not to hold the response back.
    'X-Accel-Buffering': 'no',
  });
  raw.write('retry: 3000\n\n');

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    onClose();
    if (!raw.writableEnded) raw.end();
  };
  request.raw.on('close', close);
  raw.on('error', close);

  return {
    write(event: string, data: unknown, id?: string) {
      if (closed || raw.writableEnded) return;
      raw.write(`${id ? `id: ${id}\n` : ''}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    comment(text: string) {
      if (!closed && !raw.writableEnded) raw.write(`: ${text}\n\n`);
    },
    close,
    isClosed: () => closed,
  };
}

/** Reads the "after this one" position from Last-Event-ID, which is `<epoch ms>:<notification id>`. */
function parseCursor(value: unknown): Cursor | null {
  if (typeof value !== 'string') return null;
  const [ms, ...rest] = value.split(':');
  const at = new Date(Number(ms));
  if (Number.isNaN(at.getTime()) || rest.length === 0) return null;
  return { at, id: rest.join(':') };
}

export interface PlayerStreamContext {
  projectId: string;
  userId: string;
}

/**
 * Streams one player's new notifications and balance as they happen. Notifications are read from
 * the database in order, so a reconnect with Last-Event-ID picks up exactly where it stopped.
 */
export function startPlayerStream(request: FastifyRequest, reply: FastifyReply, context: PlayerStreamContext): void {
  let timer: NodeJS.Timeout | undefined;
  let heartbeat: NodeJS.Timeout | undefined;
  let catchUp: NodeJS.Timeout | undefined;
  let busy = false;
  let again = false;
  let cursor: Cursor = parseCursor(request.headers['last-event-id']) ?? { at: new Date(), id: '' };
  let lastBalance: number | null = null;

  const stream: Stream = {
    projectId: context.projectId,
    userId: context.userId,
    write: (event, data, id) => out.write(event, data, id),
    wake: () => {
      clearTimeout(timer);
      timer = setTimeout(() => void flush(), COALESCE_MS);
    },
    end: () => out.close(),
  };

  const out = openStream(request, reply, () => {
    clearTimeout(timer);
    clearInterval(heartbeat);
    clearInterval(catchUp);
    realtimeHub.remove(stream);
  });

  async function flush(): Promise<void> {
    if (out.isClosed()) return;
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      do {
        again = false;
        const rows = await db
          .select()
          .from(notifications)
          .where(
            and(
              eq(notifications.projectId, context.projectId),
              eq(notifications.userId, context.userId),
              // The position is kept to the millisecond, because that is all an event ID can carry.
              sql`(date_trunc('milliseconds', ${notifications.createdAt}), ${notifications.id}) > (${cursor.at.toISOString()}::timestamptz, ${cursor.id})`
            )
          )
          .orderBy(sql`date_trunc('milliseconds', ${notifications.createdAt})`, asc(notifications.id))
          .limit(50);

        for (const row of rows) {
          cursor = { at: row.createdAt, id: row.id };
          out.write(
            'notification',
            { id: row.id, type: row.type, title: row.title, message: row.message, data: row.data, createdAt: row.createdAt },
            `${row.createdAt.getTime()}:${row.id}`
          );
        }

        const [balance] = await db
          .select({ totalXp: userXpBalances.totalXp })
          .from(userXpBalances)
          .where(and(eq(userXpBalances.projectId, context.projectId), eq(userXpBalances.userId, context.userId)));
        const totalXp = balance?.totalXp ?? 0;
        if (totalXp !== lastBalance) {
          // The first reading only sets the baseline, so opening a stream is not announced as a change.
          if (lastBalance !== null) out.write('xp', { totalXp });
          lastBalance = totalXp;
        }

        if (rows.length === 50) again = true;
      } while (again && !out.isClosed());
    } catch (err) {
      log.warn('Could not read updates for a stream', { error: (err as Error).message });
    } finally {
      busy = false;
    }
  }

  realtimeHub.add(stream);
  heartbeat = setInterval(() => out.comment('ping'), HEARTBEAT_MS);
  catchUp = setInterval(() => void flush(), CATCH_UP_MS);
  out.write('ready', { userId: context.userId });
  void flush();
}

/** A staff stream carries only nudges, so a page knows when to refetch its own data. */
export function startProjectStream(request: FastifyRequest, reply: FastifyReply, projectId: string): void {
  let heartbeat: NodeJS.Timeout | undefined;
  let timer: NodeJS.Timeout | undefined;

  const stream: Stream = {
    projectId,
    userId: null,
    write: (event, data) => out.write(event, data),
    end: () => out.close(),
    wake: () => {
      // One nudge per half second is plenty for a dashboard.
      if (timer) return;
      timer = setTimeout(() => {
        timer = undefined;
        out.write('activity', { at: new Date().toISOString() });
      }, 500);
    },
  };

  const out = openStream(request, reply, () => {
    clearInterval(heartbeat);
    clearTimeout(timer);
    realtimeHub.remove(stream);
  });

  realtimeHub.add(stream);
  heartbeat = setInterval(() => out.comment('ping'), HEARTBEAT_MS);
  out.write('ready', { projectId });
}

export async function realtimeRoutes(fastify: FastifyInstance) {
  // Staff stream for the dashboard: signed-in users only, because it is a project route that no API key scope covers.
  fastify.get<{ Params: { projectId: string } }>('/api/projects/:projectId/stream', async (request, reply) => {
    const { projectId } = request.params;
    const access = await requireProjectAccess(request, reply, projectId);
    if (!access) return;

    if (realtimeHub.count() >= MAX_STREAMS_PER_PROCESS) {
      return reply.status(503).send({ error: 'Unavailable', message: 'Too many live connections. Try again shortly.' });
    }
    startProjectStream(request, reply, projectId);
  });

  fastify.addHook('onClose', async () => {
    await realtimeHub.close();
  });
}
