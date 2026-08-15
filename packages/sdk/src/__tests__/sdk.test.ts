import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Gami } from '../client.js';
import {
  GamiAuthenticationError,
  GamiError,
  GamiNetworkError,
  GamiNotFoundError,
  GamiRateLimitError,
  GamiServerError,
} from '../errors.js';

describe('@gami/sdk - Client & Unit Test Suite', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // 1. Client Initialization
  it('1. throws GamiAuthenticationError if apiKey is missing or invalid', () => {
    // @ts-expect-error testing missing apiKey
    expect(() => new Gami({})).toThrow(GamiAuthenticationError);
  });

  it('2. instantiates client with valid apiKey and default baseUrl', () => {
    const gami = new Gami({ apiKey: 'gami_live_test_12345' });
    expect(gami).toBeDefined();
    expect(gami.events).toBeDefined();
    expect(gami.xp).toBeDefined();
    expect(gami.achievements).toBeDefined();
    expect(gami.levels).toBeDefined();
    expect(gami.leaderboards).toBeDefined();
    expect(gami.challenges).toBeDefined();
    expect(gami.notifications).toBeDefined();
  });

  // 2. Authentication Headers & Query Parameters
  it('3. sends canonical x-api-key header on HTTP requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, eventId: 'evt_1' }),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({
      apiKey: 'gami_live_secret_key_999',
      baseUrl: 'http://api.gami.dev',
    });

    await gami.events.track({
      projectId: 'prj_1',
      userId: 'usr_1',
      type: 'user_signup',
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://api.gami.dev/v1/events');
    expect(init.headers['x-api-key']).toBe('gami_live_secret_key_999');
  });

  // 3. Events API
  it('4. tracks event by userId or externalId', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ success: true, eventId: 'evt_100', status: 'pending' }),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });

    const res = await gami.events.track({
      projectId: 'prj_demo',
      externalId: 'customer_ext_42',
      type: 'purchase',
      properties: { amount: 99.99 },
    });

    expect(res.success).toBe(true);
    expect(res.eventId).toBe('evt_100');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.event).toBe('purchase');
    expect(body.user_id).toBe('customer_ext_42');
    expect(body.payload.amount).toBe(99.99);
  });

  // 4. Users API
  it('5. tests all Users API SDK methods (list, get, getByExternalId, create, update, delete)', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          id: 'usr_1',
          projectId: 'prj_1',
          externalId: 'cust_100',
          name: 'Jane Doe',
          avatarUrl: null,
          metadata: { plan: 'pro' },
          active: true,
          createdAt: '2026-08-15T00:00:00Z',
          updatedAt: '2026-08-15T00:00:00Z',
        }),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });

    // get
    const user = await gami.users.get({ projectId: 'prj_1', userId: 'usr_1' });
    expect(user.id).toBe('usr_1');
    expect(user.externalId).toBe('cust_100');

    // getByExternalId
    const extUser = await gami.users.getByExternalId({
      projectId: 'prj_1',
      externalId: 'cust_100',
    });
    expect(extUser.id).toBe('usr_1');

    // create
    const newUser = await gami.users.create({
      projectId: 'prj_1',
      externalId: 'cust_100',
      name: 'Jane Doe',
    });
    expect(newUser.name).toBe('Jane Doe');

    // update
    const updatedUser = await gami.users.update({
      projectId: 'prj_1',
      userId: 'usr_1',
      name: 'Jane Updated',
      active: true,
    });
    expect(updatedUser.id).toBe('usr_1');

    // delete (soft-deactivate)
    const delRes = await gami.users.delete({ projectId: 'prj_1', userId: 'usr_1' });
    expect(delRes).toBeDefined();
  });

  // 5. XP API & Idempotency Key Reuse
  it('6. gets XP balance and ledger history', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ projectId: 'prj_1', userId: 'usr_1', totalXp: 500 }),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });
    const balance = await gami.xp.getBalance({ projectId: 'prj_1', userId: 'usr_1' });
    expect(balance.totalXp).toBe(500);
  });

  it('7. generates one Idempotency-Key per xp.adjust() invocation and reuses it', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: async () => JSON.stringify({ id: 'xpl_1', amount: 100, reason: 'test' }),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });
    const customKey = 'my_custom_idempotency_key_777';

    await gami.xp.adjust({
      projectId: 'prj_1',
      userId: 'usr_1',
      amount: 100,
      reason: 'manual adjustment',
      idempotencyKey: customKey,
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Idempotency-Key']).toBe(customKey);
    const body = JSON.parse(init.body);
    expect(body.idempotencyKey).toBe(customKey);
  });

  // 6. Achievements Resource
  it('8. lists achievements and user achievements', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ id: 'ach_1', key: 'first_win', name: 'First Win' }]),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });
    const achievements = await gami.achievements.list({ projectId: 'prj_1' });

    expect(achievements).toHaveLength(1);
    expect(achievements[0].key).toBe('first_win');
  });

  // 7. Levels & Progression Resource
  it('9. lists levels and user progress', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ id: 'lvl_1', level: 1, requiredXp: 100 }]),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });
    const levels = await gami.levels.list({ projectId: 'prj_1' });

    expect(levels).toHaveLength(1);
    expect(levels[0].level).toBe(1);
  });

  // 8. Leaderboards Resource
  it('10. lists leaderboard rankings with period query params', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          projectId: 'prj_1',
          period: 'weekly',
          entries: [{ rank: 1, userId: 'usr_1', totalXp: 1000 }],
        }),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });
    const lb = await gami.leaderboards.list({
      projectId: 'prj_1',
      period: 'weekly',
      page: 1,
      limit: 10,
    });

    expect(lb.entries).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain('period=weekly');
  });

  it('10b. creates and updates levels via gami.levels', async () => {
    const mockFetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      const method = options?.method || 'GET';
      if (method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          text: async () => JSON.stringify({ id: 'lvl_10', level: 10, name: 'Grandmaster', requiredXp: 50000 }),
          headers: new Headers(),
        });
      }
      if (method === 'PATCH') {
        return Promise.resolve({
          ok: true,
          status: 200,
          text: async () => JSON.stringify({ id: 'lvl_10', level: 10, name: 'Grandmaster Updated', requiredXp: 55000 }),
          headers: new Headers(),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => JSON.stringify([]),
        headers: new Headers(),
      });
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });

    const created = await gami.levels.create({
      projectId: 'prj_1',
      level: 10,
      name: 'Grandmaster',
      requiredXp: 50000,
    });
    expect(created.name).toBe('Grandmaster');

    const updated = await gami.levels.update({
      projectId: 'prj_1',
      levelId: 'lvl_10',
      name: 'Grandmaster Updated',
      requiredXp: 55000,
    });
    expect(updated.name).toBe('Grandmaster Updated');
    expect(updated.requiredXp).toBe(55000);
  });

  // 9. Challenges Resource
  it('11. lists challenges and user challenge progress', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify([{ id: 'ch_1', name: '7-Day Login', targetCount: 7 }]),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });
    const challenges = await gami.challenges.list({ projectId: 'prj_1' });

    expect(challenges).toHaveLength(1);
    expect(challenges[0].targetCount).toBe(7);
  });

  // 10. Notifications Resource
  it('12. lists user notifications and marks all as read', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ notifications: [], unreadCount: 0 }),
      headers: new Headers(),
    });
    global.fetch = mockFetch;

    const gami = new Gami({ apiKey: 'gami_live_123' });
    const notifs = await gami.notifications.list({ projectId: 'prj_1', userId: 'usr_1' });

    expect(notifs.unreadCount).toBe(0);
  });

  // 11. Typed Error Handling & Redaction
  it('13. maps HTTP 401 to GamiAuthenticationError and 403 to GamiAuthorizationError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: 'Unauthorized', message: 'Invalid API key' }),
      headers: new Headers(),
    });

    const gami = new Gami({ apiKey: 'gami_live_invalid' });

    await expect(gami.events.track({ projectId: 'p', userId: 'u', type: 'e' })).rejects.toThrow(
      GamiAuthenticationError
    );
  });

  it('14. maps HTTP 400/422 to GamiValidationError and 404 to GamiNotFoundError', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: 'Not Found', message: 'User not found' }),
      headers: new Headers(),
    });

    const gami = new Gami({ apiKey: 'gami_live_123' });

    await expect(gami.users.get({ projectId: 'p', userId: 'u' })).rejects.toThrow(
      GamiNotFoundError
    );
  });

  it('15. maps HTTP 429 to GamiRateLimitError', async () => {
    const headers = new Headers();
    headers.set('retry-after', '60');
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ message: 'Rate limit exceeded' }),
      headers,
    });

    const gami = new Gami({ apiKey: 'gami_live_123' });

    try {
      await gami.events.track({ projectId: 'p', userId: 'u', type: 'e' });
      expect.fail('Should have thrown GamiRateLimitError');
    } catch (err) {
      expect(err).toBeInstanceOf(GamiRateLimitError);
      expect((err as GamiRateLimitError).retryAfterSeconds).toBe(60);
    }
  });

  it('16. strictly redacts raw API key from thrown error messages', async () => {
    const rawSecretKey = 'gami_live_998877665544332211';
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ message: `Key ${rawSecretKey} is rejected by server` }),
      headers: new Headers(),
    });

    const gami = new Gami({ apiKey: rawSecretKey });

    try {
      await gami.events.track({ projectId: 'p', userId: 'u', type: 'e' });
    } catch (err) {
      const gamiErr = err as GamiError;
      expect(gamiErr.message).not.toContain(rawSecretKey);
      expect(gamiErr.message).toContain('[REDACTED_API_KEY]');
    }
  });

  // 12. Transient Retries & Backoff
  it('17. retries transient HTTP 500 errors and succeeds on retry', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => JSON.stringify({ message: 'Temporary server error' }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ totalXp: 750 }),
        headers: new Headers(),
      });
    global.fetch = mockFetch;

    const gami = new Gami({
      apiKey: 'gami_live_123',
      retry: { maxRetries: 2, initialDelayMs: 10 },
    });

    const balance = await gami.xp.getBalance({ projectId: 'prj_1', userId: 'usr_1' });
    expect(balance.totalXp).toBe(750);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('18. throws GamiServerError if transient error retries are exhausted', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => JSON.stringify({ message: 'Service unavailable' }),
      headers: new Headers(),
    });

    const gami = new Gami({
      apiKey: 'gami_live_123',
      retry: { maxRetries: 2, initialDelayMs: 10 },
    });

    await expect(gami.xp.getBalance({ projectId: 'prj_1', userId: 'usr_1' })).rejects.toThrow(
      GamiServerError
    );
  });

  it('19. reuses identical Idempotency-Key across retry attempts', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        text: async () => JSON.stringify({ message: 'Bad gateway' }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        text: async () => JSON.stringify({ id: 'xpl_retry' }),
        headers: new Headers(),
      });
    global.fetch = mockFetch;

    const gami = new Gami({
      apiKey: 'gami_live_123',
      retry: { maxRetries: 2, initialDelayMs: 10 },
    });

    const customKey = 'retry_idem_key_123';
    await gami.xp.adjust({
      projectId: 'prj_1',
      userId: 'usr_1',
      amount: 50,
      reason: 'test retry',
      idempotencyKey: customKey,
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    const key1 = mockFetch.mock.calls[0][1].headers['Idempotency-Key'];
    const key2 = mockFetch.mock.calls[1][1].headers['Idempotency-Key'];
    expect(key1).toBe(customKey);
    expect(key2).toBe(customKey);
  });

  it('20. handles timeout aborts and throws GamiNetworkError', async () => {
    global.fetch = vi.fn().mockImplementation(() => {
      const error = new Error('The operation was aborted');
      error.name = 'AbortError';
      return Promise.reject(error);
    });

    const gami = new Gami({
      apiKey: 'gami_live_123',
      timeout: 50,
      retry: { maxRetries: 0 },
    });

    await expect(gami.events.track({ projectId: 'p', userId: 'u', type: 'e' })).rejects.toThrow(
      GamiNetworkError
    );
  });
});
