/* global document, window, getComputedStyle -- the page.evaluate callbacks run in the browser. */
// Loads the built script in a real browser against a running Gami.Fied server, and checks that
// the elements draw a player's data, react to attributes, take a theme and mark notifications read.
//
//   GAMI_API_URL=http://localhost:3001 pnpm --filter @gami.fied/elements check:browser
//
// It signs up an account, makes a project with two players, and uses a browser that is already
// installed (Chrome by default, or CHROME_PATH). Build the package first.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const api = (process.env.GAMI_API_URL || 'http://localhost:3001').replace(/\/$/, '');
// The dashboard's address, which the server trusts for signing up.
const origin = process.env.DASHBOARD_URL || 'http://localhost:3100';
const suffix = Date.now().toString(36);
const script = readFileSync(fileURLToPath(new URL('../dist/gami-elements.js', import.meta.url)), 'utf8');

const CHROME_PATHS = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);

let cookie = '';
async function send(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { origin, ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = response.headers.getSetCookie();
  if (set.length > 0) cookie = set.map((value) => value.split(';')[0]).join('; ');
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Not every answer is JSON.
  }
  if (!response.ok) throw new Error(`${method} ${path} answered ${response.status}: ${text.slice(0, 200)}`);
  return json;
}

const problems = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) problems.push(what);
};

async function main() {
  await send('/api/auth/sign-up/email', { method: 'POST', body: { email: `elements_${suffix}@example.com`, password: `Elements-${suffix}`, name: 'Elements' } });
  const org = await send('/api/organizations', { method: 'POST', body: { name: 'Elements', slug: `elements-${suffix}` } });
  const project = await send('/api/projects', { method: 'POST', body: { organizationId: org.id, name: 'Elements', slug: `elements-${suffix}` } });
  const base = `/api/projects/${project.id}`;
  const key = await send(`${base}/api-keys`, { method: 'POST', body: { name: 'Browser check', scopes: ['*'] } });
  const apiKey = key.rawSecret ?? key.key ?? key.secret;
  if (!apiKey) throw new Error('The server did not return the new API key');

  // A new project comes with levels of its own, which is all the level bar needs.
  const players = {};
  for (const [id, name, xp] of [['ada', 'Ada', 250], ['grace', 'Grace', 400], ['linus', 'Linus', 120]]) {
    players[id] = await send(`${base}/users`, { method: 'POST', body: { externalId: id, name } });
    await send(`${base}/users/${players[id].id}/xp/adjust`, { method: 'POST', body: { amount: xp, reason: 'Browser check' } });
  }
  const { token } = await send('/v1/end-user-tokens', { method: 'POST', body: { userId: 'ada', access: 'write' }, headers: { 'x-api-key': apiKey } });

  const found = CHROME_PATHS.find((path) => existsSync(path));
  if (!found) throw new Error('No Chrome found. Set CHROME_PATH to an installed Chrome or Chromium.');
  // The test page is answered by this script, not a real server, so Chrome sees it as a public site
  // calling a local one and would ask the person at the keyboard. There is nobody to ask here.
  const browser = await chromium.launch({ executablePath: found, args: ['--disable-features=LocalNetworkAccessChecks,BlockInsecurePrivateNetworkRequests'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // What the page itself reports is printed, so a failure here explains itself.
  page.on('console', (message) => message.type() === 'error' && console.log(`     page: ${message.text().slice(0, 200)}`));
  page.on('requestfailed', (request) => console.log(`     failed: ${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`));

  // The page is served from its own address (another port), as a real site would be, so the calls cross origins.
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>gami-leaderboard { --gami-accent: rgb(37, 99, 235); }</style></head><body>
    <gami-level-progress></gami-level-progress>
    <gami-leaderboard limit="2"></gami-leaderboard>
    <gami-notification-inbox></gami-notification-inbox>
    <gami-toasts></gami-toasts>
    <script src="/gami-elements.js"></script>
  </body></html>`;
  await page.route('http://localhost:4599/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    return path === '/gami-elements.js' ? route.fulfill({ contentType: 'text/javascript', body: script }) : route.fulfill({ contentType: 'text/html', body: html });
  });
  await page.goto('http://localhost:4599/');

  const text = (tag) => page.evaluate((name) => document.querySelector(name)?.shadowRoot?.lastElementChild?.textContent ?? '', tag);
  check((await text('gami-level-progress')).trim() === '', 'nothing is drawn before configure is called');

  await page.evaluate(({ baseUrl, playerToken }) => window.GamiElements.configure({ baseUrl, token: playerToken, live: false }), { baseUrl: api, playerToken: token });
  await page.waitForFunction(() => /XP/.test(document.querySelector('gami-level-progress')?.shadowRoot?.lastElementChild?.textContent ?? ''), null, { timeout: 15_000 });

  const level = await text('gami-level-progress');
  check(/Level \d+/.test(level) && /250 XP/.test(level), `the level bar shows the player's level and XP (${level.replace(/\s+/g, ' ').slice(0, 80)})`);

  await page.waitForFunction(() => (document.querySelector('gami-leaderboard')?.shadowRoot?.querySelectorAll('.gami-board-row').length ?? 0) > 0, null, { timeout: 15_000 });
  const rows = () => page.evaluate(() => [...document.querySelector('gami-leaderboard').shadowRoot.querySelectorAll('.gami-board-row')].map((row) => row.textContent.replace(/\s+/g, ' ').trim()));
  const two = await rows();
  check(two.length === 2 && /Grace/.test(two[0]) && /Ada/.test(two[1]), `the leaderboard shows the top two, highest first (${two.join(' | ')})`);

  await page.evaluate(() => document.querySelector('gami-leaderboard').setAttribute('limit', '3'));
  await page.waitForFunction(() => document.querySelector('gami-leaderboard').shadowRoot.querySelectorAll('.gami-board-row').length === 3, null, { timeout: 15_000 }).catch(() => undefined);
  check((await rows()).length === 3, 'changing the limit attribute draws a third row');

  const colours = await page.evaluate(() => {
    const read = (tag, selector, property) => {
      const node = document.querySelector(tag)?.shadowRoot?.querySelector(selector);
      return node ? getComputedStyle(node)[property] : null;
    };
    return { themed: read('gami-leaderboard', '.gami-me', 'backgroundColor'), plain: read('gami-level-progress', '.gami-bar-fill', 'backgroundColor') };
  });
  check(colours.plain === 'rgb(234, 88, 12)', `an element with no theme keeps the default accent (${colours.plain})`);
  check(typeof colours.themed === 'string' && colours.themed !== 'rgba(0, 0, 0, 0)' && !colours.themed.includes('234, 88, 12'), `a variable set on the element from the page reaches inside it (${colours.themed})`);

  const leak = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'gami-card';
    document.body.append(probe);
    const padding = getComputedStyle(probe).paddingTop;
    probe.remove();
    return padding;
  });
  check(leak === '0px', 'the styles do not leak out to the page');

  await page.waitForFunction(() => /Inbox/.test(document.querySelector('gami-notification-inbox')?.shadowRoot?.lastElementChild?.textContent ?? ''), null, { timeout: 15_000 });
  await page.waitForFunction(() => !document.querySelector('gami-notification-inbox').shadowRoot.querySelector('[aria-busy]'), null, { timeout: 15_000 });
  const inbox = await text('gami-notification-inbox');
  if (/unread/.test(inbox)) {
    await page.evaluate(() => [...document.querySelector('gami-notification-inbox').shadowRoot.querySelectorAll('button')].find((button) => /Mark all read/.test(button.textContent)).click());
    await page.waitForFunction(() => /All read/.test(document.querySelector('gami-notification-inbox').shadowRoot.lastElementChild.textContent), null, { timeout: 15_000 }).catch(() => undefined);
    check(/All read/.test(await text('gami-notification-inbox')), '"Mark all read" empties the unread count');
  } else {
    check(/All read|Nothing here yet/.test(inbox), `the inbox draws with nothing unread (${inbox.replace(/\s+/g, ' ').slice(0, 60)})`);
  }

  check(await page.evaluate(() => Boolean(document.querySelector('gami-toasts').shadowRoot.querySelector('[role="status"]'))), 'the toast area is a live region');
  check(errors.length === 0, `no script errors${errors.length ? `: ${errors.join('; ')}` : ''}`);
  await browser.close();
}

main()
  .then(() => {
    if (problems.length > 0) {
      console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
      process.exit(1);
    }
    console.log('\nNo problems.');
  })
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
