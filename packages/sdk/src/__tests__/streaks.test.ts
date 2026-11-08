import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gami } from '../client.js';

describe('gami.streaks', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const respond = (body: unknown) => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify(body),
      headers: new Headers(),
    });
    global.fetch = mockFetch;
    return mockFetch;
  };

  const client = () => new Gami({ apiKey: 'gami_live_test_key', baseUrl: 'http://api.test' });

  it('lists the streaks defined in the project', async () => {
    const mockFetch = respond({ data: [{ key: 'daily_lesson' }] });
    const streaks = await client().streaks.list();

    expect(mockFetch.mock.calls[0]![0]).toBe('http://api.test/v1/streaks');
    expect(streaks).toEqual([{ key: 'daily_lesson' }]);
  });

  it("reads a user's streaks, encoding the user ID", async () => {
    const mockFetch = respond({ data: [{ key: 'daily_lesson', current: 4, atRisk: true }] });
    const streaks = await client().streaks.forUser({ userId: 'ada lovelace' });

    expect(mockFetch.mock.calls[0]![0]).toBe('http://api.test/v1/users/ada%20lovelace/streaks');
    expect(streaks[0]).toMatchObject({ current: 4, atRisk: true });
  });

  it('passes the streak and limit to the history call', async () => {
    const mockFetch = respond({ data: [] });
    await client().streaks.history({ userId: 'usr_1', streak: 'daily_lesson', limit: 10 });

    expect(mockFetch.mock.calls[0]![0]).toBe(
      'http://api.test/v1/users/usr_1/streaks/history?streak=daily_lesson&limit=10'
    );
  });

  it('can target a project explicitly', async () => {
    const mockFetch = respond({ data: [] });
    await client().streaks.list({ projectId: 'prj_9' });
    expect(mockFetch.mock.calls[0]![0]).toBe('http://api.test/api/projects/prj_9/streaks');
  });

  it('requires a user ID', async () => {
    await expect(client().streaks.forUser({ userId: '' })).rejects.toThrow('userId is required');
    await expect(client().streaks.history({ userId: '' })).rejects.toThrow('userId is required');
  });
});
