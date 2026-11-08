import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gami } from '../client.js';
import { createEventParser } from '../stream.js';

const encoder = new TextEncoder();

/** A response that delivers the given chunks and then ends. */
function streamOf(...chunks: string[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } }
  );
}

const waitFor = async (condition: () => boolean, ms = 3000) => {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > ms) throw new Error('Timed out waiting');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
};

describe('createEventParser', () => {
  it('reads messages split across chunks, and ignores keep-alive comments', () => {
    const seen: unknown[] = [];
    const parse = createEventParser((message) => seen.push(message));

    parse(': ping\n\nevent: xp\nda');
    parse('ta: {"totalXp":5}\n\nid: 7:abc\nevent: notification\n');
    parse('data: {"title":"Hi"}\n\n');

    expect(seen).toEqual([
      { event: 'xp', data: '{"totalXp":5}', id: undefined },
      { event: 'notification', data: '{"title":"Hi"}', id: '7:abc' },
    ]);
  });

  it('handles Windows line endings and multi-line data', () => {
    const seen: unknown[] = [];
    createEventParser((message) => seen.push(message))('event: x\r\ndata: one\r\ndata: two\r\n\r\n');
    expect(seen).toEqual([{ event: 'x', data: 'one\ntwo', id: undefined }]);
  });
});

describe('gami.me.subscribe', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  const client = () => new Gami({ endUserToken: 'geu_test', baseUrl: 'http://api.test' });

  it('delivers notifications and XP, sending the token', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      streamOf(
        'event: ready\ndata: {}\n\n',
        'id: 1:a\nevent: notification\ndata: {"id":"a","type":"xp_awarded","title":"XP","message":"+10","data":{},"createdAt":"x"}\n\n',
        'event: xp\ndata: {"totalXp":10}\n\n'
      )
    );
    // After the first stream ends the client reconnects, so give it one that never ends.
    mockFetch.mockImplementation(() => new Promise(() => undefined));
    global.fetch = mockFetch;

    const notifications: string[] = [];
    const xp: number[] = [];
    const live = client().me.subscribe({
      onNotification: (n) => notifications.push(n.message),
      onXp: (u) => xp.push(u.totalXp),
    });

    await waitFor(() => xp.length === 1);
    expect(notifications).toEqual(['+10']);
    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://api.test/v1/me/stream');
    expect(init.headers.Authorization).toBe('Bearer geu_test');
    expect(init.headers.Accept).toBe('text/event-stream');
    live.close();
  });

  it('reconnects and resumes from the last notification it saw', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(streamOf('id: 5:z\nevent: notification\ndata: {"message":"first"}\n\n'))
      .mockImplementation(() => new Promise(() => undefined));
    global.fetch = mockFetch;

    const seen: string[] = [];
    const disconnects: unknown[] = [];
    const live = client().me.subscribe({
      onNotification: (n) => seen.push(n.message),
      onDisconnect: (reason) => disconnects.push(reason),
    });

    await waitFor(() => disconnects.length === 1);
    await vi.advanceTimersByTimeAsync(5000);
    await waitFor(() => mockFetch.mock.calls.length === 2);

    expect(seen).toEqual(['first']);
    expect(mockFetch.mock.calls[1]![1].headers['Last-Event-ID']).toBe('5:z');
    live.close();
  });

  it('stops for good when the token is refused', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('no', { status: 401 }));
    global.fetch = mockFetch;

    const reasons: Error[] = [];
    client().me.subscribe({ onDisconnect: (reason) => reasons.push(reason as Error) });

    await waitFor(() => reasons.length === 1);
    expect(reasons[0]!.message).toContain('401');
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('does not reconnect after close()', async () => {
    const mockFetch = vi.fn().mockImplementation(() => new Promise(() => undefined));
    global.fetch = mockFetch;
    const live = client().me.subscribe({});
    await waitFor(() => mockFetch.mock.calls.length === 1);
    live.close();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
