import { randomUUID } from 'crypto';
import { db, endUsers, organizations, projects, runMigrations } from '@gami/database';
import { publishRealtime } from '@gami/queue';
import { awardXp } from '@gami/rewards';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../index.js';
import { createApiKey } from '../services/api-key.service.js';
import { MAX_STREAMS_PER_USER } from '../realtime/index.js';

interface Message {
  event: string;
  data: unknown;
  id?: string;
}

/** Reads a server-sent event response, handing back messages as they arrive. */
function listen(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const messages: Message[] = [];
  let buffer = '';
  const waiting: (() => void)[] = [];

  void (async () => {
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          const lines = block.split('\n');
          const event = lines.find((line) => line.startsWith('event: '))?.slice(7);
          const data = lines.find((line) => line.startsWith('data: '))?.slice(6);
          const id = lines.find((line) => line.startsWith('id: '))?.slice(4);
          if (event && data) messages.push({ event, data: JSON.parse(data), id });
        }
        waiting.splice(0).forEach((resolve) => resolve());
      }
    } catch {
      // The stream was closed by the test.
    }
  })();

  return {
    messages,
    async next(event: string, timeoutMs = 20_000): Promise<Message> {
      const started = Date.now();
      for (;;) {
        const found = messages.find((message) => message.event === event);
        if (found) {
          messages.splice(messages.indexOf(found), 1);
          return found;
        }
        if (Date.now() - started > timeoutMs) throw new Error(`No "${event}" message arrived`);
        await new Promise<void>((resolve) => {
          waiting.push(resolve);
          setTimeout(resolve, 500);
        });
      }
    },
    close: () => reader.cancel().catch(() => undefined),
  };
}

describe('live streams', () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
  let baseUrl: string;
  let apiKey: string;
  const suffix = randomUUID().slice(0, 8);
  const orgId = `org_rt_${suffix}`;
  const projectId = `prj_rt_${suffix}`;

  const tokenFor = async (userId: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/end-user-tokens',
      headers: { 'x-api-key': apiKey },
      payload: { userId },
    });
    expect(res.statusCode).toBe(201);
    return JSON.parse(res.payload).token;
  };

  const makeUser = async (label: string) => {
    const id = `usr_${label}_${suffix}`;
    await db.insert(endUsers).values({ id, projectId, externalId: `${label}_${suffix}` });
    return id;
  };

  const giveXp = (userId: string, amount: number) =>
    db.transaction((tx) => awardXp(tx, { projectId, userId, amount, reason: 'Live test', idempotencyKey: randomUUID() }));

  beforeAll(async () => {
    await runMigrations();
    app = await buildServer();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;

    await db.insert(organizations).values({ id: orgId, name: 'RT', slug: `rt-${suffix}` });
    await db.insert(projects).values({ id: projectId, organizationId: orgId, name: 'RT', slug: 'rt' });
    apiKey = (await createApiKey(projectId, 'Live', ['users:write'])).rawSecret;
  }, 120_000);

  afterAll(async () => {
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await app.close();
  });

  it('refuses a stream with no token', async () => {
    const res = await fetch(`${baseUrl}/v1/me/stream`);
    expect(res.status).toBe(401);
  });

  it('opens with a ready message and the right headers', async () => {
    const userId = await makeUser('ready');
    const res = await fetch(`${baseUrl}/v1/me/stream`, {
      headers: { authorization: `Bearer ${await tokenFor(userId)}`, origin: 'https://game.example.com' },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();

    const stream = listen(res);
    expect((await stream.next('ready')).data).toMatchObject({ userId });
    await stream.close();
  }, 60_000);

  it('pushes a notification and the new balance when something happens', async () => {
    const userId = await makeUser('push');
    // The token can also come in the address, because a browser's EventSource cannot set headers.
    const res = await fetch(`${baseUrl}/v1/me/stream?access_token=${await tokenFor(userId)}`);
    const stream = listen(res);
    await stream.next('ready');
    await new Promise((resolve) => setTimeout(resolve, 1500)); // let the first read settle

    await giveXp(userId, 40);
    await publishRealtime({ projectId, userId });

    const notification = await stream.next('notification');
    expect(notification.data).toMatchObject({ type: 'xp_awarded' });
    expect(notification.id).toMatch(/^\d+:/);
    expect((await stream.next('xp')).data).toEqual({ totalXp: 40 });
    await stream.close();
  }, 90_000);

  it('does not show one player another player\'s changes', async () => {
    const watcher = await makeUser('watcher');
    const other = await makeUser('other');
    const res = await fetch(`${baseUrl}/v1/me/stream`, { headers: { authorization: `Bearer ${await tokenFor(watcher)}` } });
    const stream = listen(res);
    await stream.next('ready');
    await new Promise((resolve) => setTimeout(resolve, 1500));

    await giveXp(other, 10);
    await publishRealtime({ projectId, userId: other });
    await new Promise((resolve) => setTimeout(resolve, 2500));

    expect(stream.messages.filter((message) => message.event === 'notification')).toHaveLength(0);
    await stream.close();
  }, 60_000);

  it('catches up on what was missed when it reconnects with Last-Event-ID', async () => {
    const userId = await makeUser('resume');
    const token = await tokenFor(userId);

    const first = listen(await fetch(`${baseUrl}/v1/me/stream`, { headers: { authorization: `Bearer ${token}` } }));
    await first.next('ready');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await giveXp(userId, 5);
    await publishRealtime({ projectId, userId });
    const seen = await first.next('notification');
    await first.close();

    // Two more happen while the player is offline.
    await giveXp(userId, 6);
    await giveXp(userId, 7);

    const second = listen(
      await fetch(`${baseUrl}/v1/me/stream`, { headers: { authorization: `Bearer ${token}`, 'last-event-id': seen.id! } })
    );
    await second.next('ready');
    const a = await second.next('notification');
    const b = await second.next('notification');
    expect([(a.data as { message: string }).message, (b.data as { message: string }).message].join(' ')).toMatch(/6/);
    expect(a.id).not.toBe(seen.id);
    await second.close();
  }, 120_000);

  it('limits how many streams one player can hold open', async () => {
    const userId = await makeUser('limit');
    const token = await tokenFor(userId);
    const open = [];
    for (let i = 0; i < MAX_STREAMS_PER_USER; i++) {
      const res = await fetch(`${baseUrl}/v1/me/stream`, { headers: { authorization: `Bearer ${token}` } });
      expect(res.status).toBe(200);
      open.push(listen(res));
    }
    const extra = await fetch(`${baseUrl}/v1/me/stream`, { headers: { authorization: `Bearer ${token}` } });
    expect(extra.status).toBe(429);
    await Promise.all(open.map((stream) => stream.close()));
  }, 90_000);

  it('keeps the dashboard stream for signed-in staff only', async () => {
    const anonymous = await fetch(`${baseUrl}/api/projects/${projectId}/stream`);
    expect([401, 403]).toContain(anonymous.status);
    const withKey = await fetch(`${baseUrl}/api/projects/${projectId}/stream`, { headers: { 'x-api-key': apiKey } });
    expect(withKey.status).toBe(403);
  });
});
