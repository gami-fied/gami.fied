import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch, apiJson, ApiError, queryClient } from './api-client';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('apiFetch', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    queryClient.clear();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('labels a text body as JSON, unless the caller chose a type', async () => {
    fetchMock.mockImplementation(async () => json({}));

    await apiFetch('/api/things', { method: 'POST', body: JSON.stringify({ a: 1 }) });
    await apiFetch('/api/things', { method: 'POST', body: 'a=1', headers: { 'Content-Type': 'text/plain' } });
    await apiFetch('/api/things', { method: 'POST' });

    const typeOf = (call: number) => new Headers(fetchMock.mock.calls[call]![1].headers).get('content-type');
    expect(typeOf(0)).toBe('application/json');
    expect(typeOf(1)).toBe('text/plain');
    expect(typeOf(2)).toBeNull();
  });

  it('shares identical reads made at the same time', async () => {
    fetchMock.mockImplementation(async () => json({ ok: true }));

    await Promise.all([apiFetch('/api/projects'), apiFetch('/api/projects')]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives every caller a readable body', async () => {
    fetchMock.mockImplementation(async () => json({ id: 1 }));

    const [first, second] = await Promise.all([apiFetch('/api/a'), apiFetch('/api/a')]);

    await expect(first.json()).resolves.toEqual({ id: 1 });
    await expect(second.json()).resolves.toEqual({ id: 1 });
  });

  it('does not cancel a read in progress when an auth read finishes', async () => {
    let finishRead: (value: Response) => void = () => undefined;
    fetchMock.mockImplementation((url: string) =>
      url.startsWith('/api/auth')
        ? Promise.resolve(json({}))
        : new Promise((resolve) => {
            finishRead = resolve;
          })
    );

    const read = apiFetch('/api/projects');
    await new Promise((resolve) => setTimeout(resolve));
    await apiFetch('/api/auth/otp/status');
    finishRead(json([{ id: 'prj_1' }]));

    await expect((await read).json()).resolves.toEqual([{ id: 'prj_1' }]);
  });

  it('does not cancel a read in progress when a write finishes', async () => {
    let finishRead: (value: Response) => void = () => undefined;
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      init?.method === 'POST'
        ? Promise.resolve(json({}, 201))
        : new Promise((resolve) => {
            finishRead = resolve;
          })
    );

    const read = apiFetch('/api/projects');
    await new Promise((resolve) => setTimeout(resolve));
    await apiFetch('/api/rules', { method: 'POST' });
    finishRead(json([{ id: 'prj_1' }]));

    await expect((await read).json()).resolves.toEqual([{ id: 'prj_1' }]);
  });

  it('reads fresh data after a write', async () => {
    fetchMock.mockImplementation(async () => json({ ok: true }));

    await apiFetch('/api/rules');
    await apiFetch('/api/rules', { method: 'POST' });
    await apiFetch('/api/rules');

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('never caches a failure', async () => {
    fetchMock.mockImplementation(async () => json({ message: 'nope' }, 404));

    await apiFetch('/api/missing');
    await apiFetch('/api/missing');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('turns a failure into an ApiError with the API message', async () => {
    fetchMock.mockImplementation(async () =>
      json({ error: { code: 'NOT_FOUND', message: 'User not found', requestId: 'req_1' } }, 404)
    );

    const error = await apiJson('/api/users/x').catch((err: unknown) => err);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ message: 'User not found', code: 'NOT_FOUND', status: 404 });
  });
});
