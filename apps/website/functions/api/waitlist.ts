/**
 * Keeps an email address from the pricing page's waitlist form, on Cloudflare Pages.
 *
 * It needs a KV namespace bound as `WAITLIST` (Pages project > Settings > Functions > KV bindings),
 * and `PUBLIC_WAITLIST_ENDPOINT=/api/waitlist` at build time so the form appears. Without the
 * binding it answers 503, and the form says it did not go through.
 *
 * Read the list with `wrangler kv key list --binding WAITLIST`.
 *
 * Its behaviour is tested in src/lib/__tests__/waitlist.test.ts. It has not yet run on Cloudflare
 * itself: send one address on a preview deployment before relying on it.
 */
interface KvNamespace {
  put(key: string, value: string): Promise<void>;
}

interface Context {
  request: Request;
  env: { WAITLIST?: KvNamespace };
}

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const PLANS = ['Cloud', 'Enterprise'];

export async function onRequestPost({ request, env }: Context): Promise<Response> {
  if (!env.WAITLIST) return json(503, { message: 'The waitlist is not set up.' });

  // Only this site's own form may post here.
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json(403, { message: 'Not allowed from this site.' });

  let body: { email?: unknown; plan?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return json(400, { message: 'Send JSON with an email address.' });
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(400, { message: 'Enter a valid email address.' });
  const plan = typeof body.plan === 'string' && PLANS.includes(body.plan) ? body.plan : 'Cloud';

  // Keyed by address, so signing up twice keeps one entry.
  await env.WAITLIST.put(`${plan.toLowerCase()}:${email}`, JSON.stringify({ email, plan, at: new Date().toISOString() }));
  return json(201, { ok: true });
}
