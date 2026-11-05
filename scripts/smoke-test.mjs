// Checks a running stack from the outside, the way a user would. Everything goes through the
// dashboard's address, because that is what published images depend on.
//   DASHBOARD_URL=http://localhost:3000 API_URL=http://localhost:3001 node scripts/smoke-test.mjs

const dashboard = process.env.DASHBOARD_URL ?? 'http://localhost:3000';
const api = process.env.API_URL ?? 'http://localhost:3001';
const suffix = Date.now().toString(36);

let cookie = '';

function check(condition, message) {
  if (!condition) throw new Error(`Smoke test failed: ${message}`);
  console.log(`ok - ${message}`);
}

async function send(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${dashboard}${path}`, {
    method,
    redirect: 'manual',
    headers: {
      origin: dashboard,
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) cookie = setCookies.map((value) => value.split(';')[0]).join('; ');

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Pages are HTML
  }
  return { status: response.status, json, location: response.headers.get('location') };
}

async function main() {
  // Redis connects a moment after the process starts.
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt++) {
    ready = await fetch(`${api}/ready`).then((res) => res.ok, () => false);
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  check(ready, 'the API reports ready');

  const spec = await send('/openapi.json');
  check(spec.json?.paths?.['/v1/events'], 'the image serves the OpenAPI spec');

  check((await send('/login')).status === 200, 'the dashboard serves the login page');

  const signedOut = await send('/dashboard');
  check(signedOut.status === 307, 'signed-out visitors are redirected');

  const signUp = await send('/api/auth/sign-up/email', {
    method: 'POST',
    body: {
      email: `smoke_${suffix}@example.com`,
      password: `Smoke-test-${suffix}`,
      name: 'Smoke Test',
    },
  });
  if (signUp.status !== 200) console.error(signUp.status, signUp.json?.message);
  check(signUp.status === 200, 'a user can sign up through the dashboard');
  check(cookie.length > 0, 'sign-up sets a session cookie');

  const org = await send('/api/organizations', {
    method: 'POST',
    body: { name: 'Smoke Test', slug: `smoke-${suffix}` },
  });
  check(org.status === 201, 'a user can create an organization');

  const project = await send('/api/projects', {
    method: 'POST',
    body: { organizationId: org.json.id, name: 'Smoke Test', slug: `smoke-${suffix}` },
  });
  check(project.status === 201, 'a user can create a project');
  const base = `/api/projects/${project.json.id}`;

  const rule = await send(`${base}/rules`, {
    method: 'POST',
    body: {
      name: 'Smoke',
      trigger: 'smoke_test',
      actions: [{ type: 'award_xp', params: { amount: 5 } }],
    },
  });
  check(rule.status === 201, 'a user can create a rule');

  const key = await send(`${base}/api-keys`, {
    method: 'POST',
    body: { name: 'Smoke', scopes: ['*'] },
  });
  check(key.status === 201, 'a user can create an API key');
  const apiKey = key.json.rawSecret ?? key.json.key;
  check(typeof apiKey === 'string', 'the API key is returned once');

  const event = await send('/v1/events', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: { event: 'smoke_test', user_id: 'smoke_user' },
  });
  check(event.status === 202, 'the dashboard forwards events to the API');

  let totalXp = 0;
  for (let attempt = 0; attempt < 30 && totalXp === 0; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const balance = await send('/v1/users/smoke_user/xp', { headers: { 'x-api-key': apiKey } });
    totalXp = balance.json?.totalXp ?? 0;
  }
  check(totalXp === 5, 'the worker processed the event and awarded XP');

  const removed = await send(`/api/organizations/${org.json.id}`, { method: 'DELETE' });
  check(removed.status === 200, 'the test organization was removed');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
