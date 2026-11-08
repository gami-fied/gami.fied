import { createLogger } from '@gami/config';
import { getRedisConnection } from './client.js';

const log = createLogger('Realtime');

const CHANNEL = 'gami:realtime';

/** A nudge that something changed for a project, and for one user when `userId` is set. */
export interface RealtimeMessage {
  projectId: string;
  userId?: string | null;
}

/**
 * Tells every API process that a project's data changed, so open streams can fetch what is new.
 * It carries no data of its own and is allowed to fail: streams also catch up on a timer.
 */
export async function publishRealtime(message: RealtimeMessage): Promise<void> {
  try {
    await getRedisConnection().publish(CHANNEL, JSON.stringify(message));
  } catch (err) {
    log.debug('Could not publish a realtime nudge', { error: (err as Error).message });
  }
}

/** Listens for nudges. Returns a function that stops listening. */
export async function subscribeRealtime(handler: (message: RealtimeMessage) => void): Promise<() => Promise<void>> {
  const subscriber = getRedisConnection().duplicate({ enableOfflineQueue: true });
  subscriber.on('error', (err) => log.warn('Realtime subscriber error', { error: err.message }));
  subscriber.on('message', (_channel, raw) => {
    try {
      const parsed = JSON.parse(raw) as RealtimeMessage;
      if (typeof parsed.projectId === 'string') handler(parsed);
    } catch {
      // Ignore anything that is not one of our messages.
    }
  });
  await subscriber.subscribe(CHANNEL);
  return async () => {
    subscriber.removeAllListeners('message');
    await subscriber.quit().catch(() => undefined);
  };
}
