import { describe, expect, it } from 'vitest';
import { onRequestPost } from '../../../functions/api/waitlist';

/** A stand-in for the Cloudflare KV namespace the function writes to. */
function fakeKv() {
  const entries = new Map<string, string>();
  return { entries, put: async (key: string, value: string) => void entries.set(key, value) };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request('https://gami.fied.cc/api/waitlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('the waitlist function', () => {
  it('keeps an address once, in lower case, under its plan', async () => {
    const kv = fakeKv();
    const first = await onRequestPost({ request: post({ email: ' Ada@Example.com ', plan: 'Enterprise' }), env: { WAITLIST: kv } });
    await onRequestPost({ request: post({ email: 'ada@example.com', plan: 'Enterprise' }), env: { WAITLIST: kv } });

    expect(first.status).toBe(201);
    expect([...kv.entries.keys()]).toEqual(['enterprise:ada@example.com']);
    expect(JSON.parse(kv.entries.get('enterprise:ada@example.com')!)).toMatchObject({ email: 'ada@example.com', plan: 'Enterprise' });
  });

  it('files an unknown plan under Cloud', async () => {
    const kv = fakeKv();
    await onRequestPost({ request: post({ email: 'ada@example.com', plan: 'Free forever' }), env: { WAITLIST: kv } });
    expect([...kv.entries.keys()]).toEqual(['cloud:ada@example.com']);
  });

  it('refuses a bad address, a body that is not JSON, and another site', async () => {
    const kv = fakeKv();
    const env = { WAITLIST: kv };
    expect((await onRequestPost({ request: post({ email: 'not an address' }), env })).status).toBe(400);
    expect((await onRequestPost({ request: post({ email: `${'a'.repeat(250)}@example.com` }), env })).status).toBe(400);
    expect((await onRequestPost({ request: post('email=ada@example.com'), env })).status).toBe(400);
    expect((await onRequestPost({ request: post({ email: 'ada@example.com' }, { origin: 'https://elsewhere.example' }), env })).status).toBe(403);
    expect(kv.entries.size).toBe(0);
  });

  it('says so when the storage is not set up', async () => {
    const response = await onRequestPost({ request: post({ email: 'ada@example.com' }), env: {} });
    expect(response.status).toBe(503);
  });
});
