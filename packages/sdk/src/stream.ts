/** A notification pushed to a player. */
export interface LiveNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface LiveHandlers {
  /** The stream is open. Also called after each automatic reconnect. */
  onOpen?: () => void;
  /** An XP gain, level up, achievement or challenge. Show it as a toast. */
  onNotification?: (notification: LiveNotification) => void;
  /** The player's XP total changed. */
  onXp?: (update: { totalXp: number }) => void;
  /** The connection dropped. It retries on its own, so this is for showing a status. */
  onDisconnect?: (reason: Error | null) => void;
}

export interface LiveConnection {
  /** Stops listening and does not reconnect. */
  close(): void;
}

interface ParsedMessage {
  event: string;
  data: string;
  id?: string;
}

/** Splits a server-sent events body into messages as chunks arrive. */
export function createEventParser(onMessage: (message: ParsedMessage) => void) {
  let buffer = '';
  return (chunk: string) => {
    buffer += chunk.replace(/\r\n/g, '\n');
    let split: number;
    while ((split = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, split);
      buffer = buffer.slice(split + 2);
      let event = 'message';
      let id: string | undefined;
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith(':')) continue; // a keep-alive comment
        const colon = line.indexOf(':');
        const field = colon === -1 ? line : line.slice(0, colon);
        const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
        else if (field === 'id') id = value;
      }
      if (data.length > 0) onMessage({ event, data: data.join('\n'), id });
    }
  };
}

/**
 * Keeps a stream open and reconnects with a growing pause when it drops, asking the server to
 * resume from the last notification it delivered so none are missed.
 */
export function connectLive(
  open: (init: { signal: AbortSignal; headers: Record<string, string> }) => Promise<Response>,
  handlers: LiveHandlers
): LiveConnection {
  const controller = new AbortController();
  let lastId: string | undefined;
  let attempt = 0;

  const dispatch = (message: ParsedMessage) => {
    if (message.id) lastId = message.id;
    try {
      const payload = JSON.parse(message.data);
      if (message.event === 'notification') handlers.onNotification?.(payload as LiveNotification);
      else if (message.event === 'xp') handlers.onXp?.(payload as { totalXp: number });
    } catch {
      // A malformed message is skipped rather than ending the stream.
    }
  };

  void (async () => {
    while (!controller.signal.aborted) {
      let failure: Error | null = null;
      try {
        const response = await open({
          signal: controller.signal,
          headers: lastId ? { 'Last-Event-ID': lastId } : {},
        });
        if (!response.ok || !response.body) {
          // A refusal that will not change, such as a bad token, is not worth retrying.
          if (response.status === 401 || response.status === 403) {
            handlers.onDisconnect?.(new Error(`The live stream was refused (${response.status})`));
            return;
          }
          throw new Error(`The live stream returned ${response.status}`);
        }

        attempt = 0;
        handlers.onOpen?.();
        const parse = createEventParser(dispatch);
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          parse(decoder.decode(value, { stream: true }));
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        failure = err instanceof Error ? err : new Error(String(err));
      }

      if (controller.signal.aborted) return;
      handlers.onDisconnect?.(failure);
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5))));
    }
  })();

  return { close: () => controller.abort() };
}
