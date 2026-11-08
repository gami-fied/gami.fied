import { afterEach, describe, expect, it, vi } from 'vitest';
import { Gami } from '../client.js';

describe('gami.store', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const respond = (body: unknown, status = 200) => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
      headers: new Headers(),
    });
    global.fetch = mockFetch;
    return mockFetch;
  };

  const client = () => new Gami({ apiKey: 'gami_live_test_key', baseUrl: 'http://api.test' });

  it('lists rewards and reads a balance with the user ID encoded', async () => {
    const mockFetch = respond({ data: [{ key: 'mug' }] });
    expect(await client().store.rewards()).toEqual([{ key: 'mug' }]);
    expect(mockFetch.mock.calls[0]![0]).toBe('http://api.test/v1/rewards');

    respond({ data: [{ currency: 'coins', balance: 5 }] });
    const wallets = await client().store.wallets({ userId: 'ada lovelace' });
    expect(wallets[0]).toMatchObject({ currency: 'coins', balance: 5 });
  });

  it('buys with an idempotency key in the body', async () => {
    const mockFetch = respond({ id: 'rdm_1', status: 'pending' }, 201);
    await client().store.redeem({ userId: 'u1', rewardKey: 'free mug', idempotencyKey: 'order-9' });

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toBe('http://api.test/v1/users/u1/rewards/free%20mug/redeem');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ idempotencyKey: 'order-9' });
  });

  it('refuses to call without a user or a reward', async () => {
    await expect(client().store.redeem({ userId: '', rewardKey: 'x' })).rejects.toThrow('userId is required');
    await expect(client().store.redeem({ userId: 'u', rewardKey: '' })).rejects.toThrow('rewardKey is required');
  });

  it('exposes the end-user store calls', async () => {
    const mockFetch = respond({ data: [] });
    const me = new Gami({ endUserToken: 'eut_test', baseUrl: 'http://api.test' });
    await me.me.store();
    await me.me.wallets();
    await me.me.redemptions();
    expect(mockFetch.mock.calls.map((call) => call[0])).toEqual(['http://api.test/v1/me/rewards', 'http://api.test/v1/me/wallets', 'http://api.test/v1/me/redemptions']);
  });
});
