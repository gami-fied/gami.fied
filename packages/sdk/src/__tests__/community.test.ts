import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gami } from '../client.js';

describe('segments, leagues, social and invites', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const respond = (body: unknown, status = 200) => {
    const mockFetch = vi.fn().mockResolvedValue({ ok: status < 400, status, text: async () => JSON.stringify(body), headers: new Headers() });
    global.fetch = mockFetch;
    return mockFetch;
  };
  const server = () => new Gami({ apiKey: 'gami_test_key', baseUrl: 'http://api.test' });
  const player = () => new Gami({ endUserToken: 'eut', baseUrl: 'http://api.test' });

  it('passes segment and friend filters to the leaderboard, and asks for group boards', async () => {
    const mockFetch = respond({ entries: [] });
    await server().leaderboards.list({ segment: 'india', friendsOf: 'u 1' });
    const url = new URL(mockFetch.mock.calls[0]![0]);
    expect(url.searchParams.get('segment')).toBe('india');
    expect(url.searchParams.get('friendsOf')).toBe('u 1');

    await server().leaderboards.groups({ groupBy: 'metadata.team', score: 'average' });
    const groups = new URL(mockFetch.mock.calls[1]![0]);
    expect(groups.searchParams.get('groupBy')).toBe('metadata.team');
    expect(groups.searchParams.get('score')).toBe('average');
    await expect(server().leaderboards.groups({ groupBy: '' })).rejects.toThrow('groupBy is required');
  });

  it('calls the server routes with encoded IDs', async () => {
    const mockFetch = respond({ data: [] });
    const gami = server();
    await gami.leagues.forUser({ userId: 'a b' });
    await gami.social.friends({ userId: 'a b' });
    await gami.social.addFriend({ userId: 'a', friendId: 'b' });
    await gami.social.giveKudos({ userId: 'a', to: 'b', message: 'Nice' });
    await gami.referrals.claim({ userId: 'new', code: 'ABCD2345' });
    const calls = mockFetch.mock.calls.map(([url, init]) => `${init.method} ${new URL(url).pathname}`);
    expect(calls).toEqual([
      'GET /v1/users/a%20b/leagues',
      'GET /v1/users/a%20b/friends',
      'POST /v1/users/a/friends',
      'POST /v1/users/a/kudos',
      'POST /v1/users/new/referral',
    ]);
    expect(JSON.parse(mockFetch.mock.calls[4]![1].body)).toEqual({ code: 'ABCD2345' });
    await expect(gami.social.feed({ userId: '' })).rejects.toThrow('userId is required');
  });

  it('gives players their own social calls', async () => {
    const mockFetch = respond({ data: [] });
    const me = player().me;
    await me.leaderboard({ scope: 'friends', sameAs: 'metadata.country' });
    await me.leagues();
    await me.referral();
    await me.useReferral('CODE2345');
    await me.addFriend('FRIEND23');
    await me.giveKudos('FRIEND23', 'Well done');
    await me.feed();
    await me.shareAchievement('first win');
    const urls = mockFetch.mock.calls.map(([url]) => new URL(url));
    expect(urls[0]!.searchParams.get('scope')).toBe('friends');
    expect(urls[0]!.searchParams.get('sameAs')).toBe('metadata.country');
    expect(urls.slice(1).map((url) => url.pathname)).toEqual([
      '/v1/me/leagues',
      '/v1/me/referral',
      '/v1/me/referral',
      '/v1/me/friends',
      '/v1/me/kudos',
      '/v1/me/feed',
      '/v1/me/achievements/first%20win/share',
    ]);
  });
});
