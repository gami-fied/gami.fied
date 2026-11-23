/* global document, window, getComputedStyle -- the page.evaluate callbacks run in the browser. */
// Opens every dashboard page in a real browser, the way a person would, and fails when a page
// breaks. It checks each page for script errors, failed loads, sideways scrolling, text smaller
// than 12 px and accessibility problems (axe), and saves a screenshot of each.
//
//   DASHBOARD_URL=http://localhost:3000 pnpm --filter @gami/dashboard walk
//
// It signs up a new account, creates an organization and a project with a little data, and walks
// the project pages in the dark and light themes at desktop width, and at phone width. It then
// invites a second person as a plain member and walks what they can open, and checks that the
// admin pages turn them away. With
// PLATFORM_BOOTSTRAP_SECRET set, and no administrator on the server yet, it also claims platform
// admin and walks the admin area. Screenshots go to apps/dashboard/walk-output/.
//
// It drives a browser that is already installed (Chrome by default, or CHROME_PATH).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const out = join(root, 'walk-output');
const dashboard = (process.env.DASHBOARD_URL || 'http://localhost:3000').replace(/\/$/, '');
const suffix = Date.now().toString(36);
const axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

const PROJECT_PAGES = [
  '',
  'rules',
  'levels',
  'achievements',
  'challenges',
  'streaks',
  'journeys',
  'passes',
  'store',
  'boxes',
  'cosmetics',
  'boosts',
  'users',
  'leaderboard',
  'leaderboard-prizes',
  'leagues',
  'teams',
  'segments',
  'invites',
  'translations',
  'campaigns',
  'events',
  'xp',
  'analytics',
  'api-keys',
  'webhooks',
  'connectors',
  'integrations',
  'developer',
  'organization/members',
  'organization/invitations',
  'organization/data',
  'system',
  'audit-logs',
  'settings',
  'promotion',
  'profile',
].map((page) => `/dashboard${page ? `/${page}` : ''}`);

/** What a plain member can open. The rest is for owners and admins, and is checked to be refused. */
const MEMBER_PAGES = ['', 'rules', 'levels', 'achievements', 'challenges', 'streaks', 'journeys', 'passes', 'store', 'boxes', 'cosmetics', 'boosts', 'users', 'leaderboard', 'leaderboard-prizes', 'leagues', 'teams', 'segments', 'invites', 'translations', 'events', 'xp', 'analytics', 'organization/members', 'profile'].map(
  (page) => `/dashboard${page ? `/${page}` : ''}`
);
const ADMIN_ONLY_PAGES = ['/dashboard/api-keys', '/dashboard/settings', '/dashboard/audit-logs'];

const ADMIN_PAGES = ['', 'organizations', 'features', 'policies', 'system', 'backups', 'storage', 'security', 'sessions', 'audit-logs', 'settings'].map(
  (page) => `/admin${page ? `/${page}` : ''}`
);

/** Accessibility problems that fail the walk. Lesser ones are listed but do not fail it. */
const FAILING_IMPACTS = ['critical'];

/** Colour pairs that fall short of 4.5:1, with how many times each was seen. */
const contrast = new Map();

/** Someone signed in: their cookies, and a way to call the API as them. */
function person() {
  const self = { cookie: '', send: (path, options) => send(self, path, options) };
  return self;
}

async function send(who, path, { method = 'GET', body } = {}) {
  const response = await fetch(`${dashboard}${path}`, {
    method,
    redirect: 'manual',
    headers: { origin: dashboard, ...(body ? { 'content-type': 'application/json' } : {}), ...(who.cookie ? { cookie: who.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const setCookies = response.headers.getSetCookie();
  if (setCookies.length > 0) who.cookie = setCookies.map((value) => value.split(';')[0]).join('; ');
  const text = await response.text();
  try {
    return { status: response.status, json: JSON.parse(text) };
  } catch {
    return { status: response.status, json: null };
  }
}

function must(condition, message) {
  if (!condition) throw new Error(`Walk failed while setting up: ${message}`);
}

/** An account with one project that has a rule, a level, a badge and a player with XP. */
async function setUp() {
  const owner = person();
  const send = owner.send;
  const signUp = await send('/api/auth/sign-up/email', {
    method: 'POST',
    body: { email: `walk_${suffix}@example.com`, password: `Walk-through-${suffix}`, name: 'Walk Through' },
  });
  must(signUp.status === 200, `sign-up answered ${signUp.status}`);

  const org = await send('/api/organizations', { method: 'POST', body: { name: 'Walk Through', slug: `walk-${suffix}` } });
  must(org.status === 201, `creating an organization answered ${org.status}`);
  const project = await send('/api/projects', { method: 'POST', body: { organizationId: org.json.id, name: 'Walk Through', slug: `walk-${suffix}` } });
  must(project.status === 201, `creating a project answered ${project.status}`);
  const base = `/api/projects/${project.json.id}`;

  await send(`${base}/rules`, { method: 'POST', body: { name: 'Lesson reward', trigger: 'lesson_completed', actions: [{ type: 'award_xp', params: { amount: 50 } }] } });
  await send(`${base}/achievements`, { method: 'POST', body: { key: 'first_lesson', name: 'First lesson', description: 'Finished a lesson.' } });
  // A rule that gives a badge, for checkRuleEditor().
  await send(`${base}/rules`, {
    method: 'POST',
    body: { name: 'Badge for a lesson', trigger: 'lesson_completed', actions: [{ type: 'award_achievement', params: { achievementKey: 'first_lesson' } }] },
  });
  for (const user of ['ada', 'grace', 'linus']) {
    await send(`${base}/events/test`, { method: 'POST', body: { event: 'lesson_completed', user_id: user, payload: { score: 90 } } });
  }

  // One of each newer mechanic, so those pages are walked with something on them.
  const make = async (path, body) => {
    const made = await send(`${base}${path}`, { method: 'POST', body });
    must(made.status === 201, `creating ${path} answered ${made.status}: ${made.json?.message ?? ''}`);
    return made.json;
  };
  await make('/currencies', { key: 'gems', name: 'Gems', symbol: '💎' });
  await make('/cosmetics', { key: 'night_owl', name: 'Night owl', kind: 'title', achievement: 'first_lesson' });
  await make('/boxes', {
    key: 'daily_chest',
    name: 'Daily chest',
    dailyLimit: 3,
    guaranteeAfter: 10,
    items: [
      { name: '50 XP', weight: 90, rare: false, prizes: [{ type: 'xp', amount: 50 }] },
      { name: '100 gems', weight: 10, rare: true, prizes: [{ type: 'currency', currency: 'gems', amount: 100 }, { type: 'cosmetic', cosmetic: 'night_owl' }] },
    ],
  });
  await make('/passes', {
    key: 'season_1',
    name: 'Season 1',
    startAt: new Date(Date.now() - 86_400_000).toISOString(),
    endAt: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    premiumCurrency: 'gems',
    premiumCost: 500,
    tiers: [
      { xp: 50, free: [{ type: 'xp', amount: 25 }], premium: [{ type: 'currency', currency: 'gems', amount: 50 }] },
      { xp: 500, free: [{ type: 'achievement', achievement: 'first_lesson' }], premium: [] },
    ],
  });
  await make('/teams', { key: 'red', name: 'Red team', maxMembers: 50 });
  await make('/goals', { key: 'thousand_lessons', name: 'A thousand lessons', trigger: 'lesson_completed', target: 1000, rewards: [{ type: 'xp', amount: 100 }] });
  await make('/challenges', { key: 'first_steps', name: 'First steps', trigger: 'lesson_completed', target: 1, rewards: [] });
  await make('/challenges', { key: 'keep_going', name: 'Keep going', trigger: 'lesson_completed', target: 5, rewards: [] });
  await make('/journeys', { key: 'onboarding', name: 'Getting started', steps: ['first_steps', 'keep_going'], rewards: [{ type: 'xp', amount: 200 }] });
  await make('/leaderboard-prizes', { name: 'Weekly top 3', period: 'weekly', fromRank: 1, toRank: 3, rewards: [{ type: 'currency', currency: 'gems', amount: 100 }] });

  let isPlatformAdmin = false;
  const secret = process.env.PLATFORM_BOOTSTRAP_SECRET;
  if (secret) {
    const claimed = await send('/api/admin/bootstrap', { method: 'POST', body: { bootstrapSecret: secret } });
    isPlatformAdmin = claimed.status === 200;
    console.log(isPlatformAdmin ? 'claimed platform admin, so the admin area is walked too' : `platform admin was not claimed (${claimed.status}), so the admin area is skipped`);
  }
  // A second person, invited as a plain member of that one project.
  const member = person();
  const memberEmail = `walk_member_${suffix}@example.com`;
  const invited = await send(`/api/organizations/${org.json.id}/invitations`, {
    method: 'POST',
    body: { email: memberEmail, role: 'member', projectIds: [project.json.id] },
  });
  must(invited.status === 201, `inviting a member answered ${invited.status}`);
  const token = new URL(invited.json.invitationUrl).searchParams.get('token');
  const joined = await member.send('/api/auth/sign-up/email', {
    method: 'POST',
    body: { email: memberEmail, password: `Walk-member-${suffix}`, name: 'Walk Member' },
  });
  must(joined.status === 200, `the member's sign-up answered ${joined.status}`);
  const accepted = await member.send(`/api/invitations/${token}/accept`, { method: 'POST', body: {} });
  must(accepted.status < 300, `accepting the invitation answered ${accepted.status}`);

  return { owner, member, projectId: project.json.id, isPlatformAdmin };
}

function browserPath() {
  const found = CHROME_PATHS.find((path) => existsSync(path));
  if (!found) throw new Error('No Chrome found. Set CHROME_PATH to an installed Chrome or Chromium.');
  return found;
}

/** What is wrong with the page as it stands, measured in the page itself. */
async function inspect(page) {
  await page.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }' }).catch(() => {});
  const measured = await page.evaluate(() => {
    const main = document.querySelector('main') ?? document.body;
    const tiny = [...main.querySelectorAll('*')].filter(
      (element) => element.children.length === 0 && (element.textContent || '').trim() && parseFloat(getComputedStyle(element).fontSize) < 12
    ).length;
    return {
      title: document.title,
      heading: document.querySelector('h1')?.textContent?.trim() ?? '',
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tiny,
      text: (main.innerText || '').length,
    };
  });

  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.length,
      // For contrast, which colours fall short, so the fix is a token and not a hunt through pages.
      pairs:
        violation.id === 'color-contrast'
          ? violation.nodes
              .map((node) => node.any[0]?.data)
              .filter(Boolean)
              .map((data) => `${data.fgColor} on ${data.bgColor} (${data.contrastRatio}:1)`)
          : [],
    }));
  });
  return { ...measured, violations };
}

async function walk(browser, { label, pages, viewport, colorScheme, projectId, who, refused = [] }) {
  const context = await browser.newContext({ viewport, colorScheme, baseURL: dashboard });
  const { hostname } = new URL(dashboard);
  await context.addCookies(
    who.cookie.split('; ').map((pair) => {
      const [name, ...value] = pair.split('=');
      return { name, value: value.join('='), domain: hostname, path: '/' };
    })
  );
  // The dashboard follows this choice over the system setting.
  await context.addInitScript((theme) => window.localStorage.setItem('gami.theme', theme), colorScheme);

  const page = await context.newPage();
  const problems = [];
  const notes = [];
  let pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  // Something the Content-Security-Policy blocked: a script, style, image or connection the page
  // needs. The browser only reports these on the console.
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) {
      pageErrors.push(`blocked by the Content-Security-Policy: ${message.text().slice(0, 200)}`);
    }
  });
  // Requests that were refused, kept to explain a page that did not draw.
  let blocked = [];
  page.on('response', (response) => {
    if (response.status() >= 500) pageErrors.push(`${response.status()} from ${new URL(response.url()).pathname}`);
    else if (response.status() >= 400) blocked.push(`${response.status()} from ${new URL(response.url()).pathname}`);
  });
  page.on('requestfailed', (request) => blocked.push(`${request.failure()?.errorText ?? 'failed'} for ${new URL(request.url()).pathname}`));

  for (const path of pages) {
    pageErrors = [];
    blocked = [];
    const url = path.startsWith('/dashboard') ? `${path}?project=${projectId}` : path;
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);

    const name = `${label} ${path}`;
    if (!new URL(page.url()).pathname.startsWith(path.split('?')[0])) {
      problems.push(`${name}: ended up at ${new URL(page.url()).pathname}`);
      continue;
    }
    const found = await inspect(page);
    await page.screenshot({ path: join(out, `${label}${path.replace(/\//g, '_')}.png`) });

    if (pageErrors.length) problems.push(`${name}: ${[...new Set(pageErrors)].join('; ')}`);
    if (!found.heading) problems.push(`${name}: no page heading${blocked.length ? ` (${[...new Set(blocked)].slice(0, 5).join('; ')})` : ''}`);
    if (found.title === 'Gami.Fied Dashboard') problems.push(`${name}: the browser tab has no page title`);
    if (found.overflow > 1) problems.push(`${name}: scrolls sideways by ${found.overflow}px`);
    if (found.tiny > 0) problems.push(`${name}: ${found.tiny} pieces of text under 12px`);
    for (const violation of found.violations) {
      const line = `${name}: ${violation.impact} accessibility problem "${violation.help}" (${violation.id}, ${violation.nodes} places)`;
      if (FAILING_IMPACTS.includes(violation.impact)) problems.push(line);
      else notes.push(line);
      for (const pair of violation.pairs) contrast.set(`${colorScheme}: ${pair}`, (contrast.get(`${colorScheme}: ${pair}`) ?? 0) + 1);
    }
  }
  // Pages this person must not get into: the page has to say so, not show its contents.
  for (const path of refused) {
    await page.goto(`${path}?project=${projectId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const text = await page.evaluate(() => document.querySelector('main')?.innerText ?? '');
    if (!/is for admins/i.test(text)) problems.push(`${label} ${path}: a plain member was not turned away`);
  }
  await context.close();
  return { problems, notes, count: pages.length + refused.length };
}

/**
 * Clicks through the rule editor, in a fresh browser so no other page has filled the cache:
 * - editing a rule that gives a badge shows that badge, not "No achievements yet" (DASH-21)
 * - saving an edit closes the dialog, rather than leaving it open as "Create Rule" (DASH-20)
 * - with no toasts showing, the toast area takes no clicks, so it can't cover buttons in the
 *   bottom-right corner such as Previous and Next (DASH-22).
 */
async function checkRuleEditor(browser, { projectId, who }) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, baseURL: dashboard });
  const { hostname } = new URL(dashboard);
  await context.addCookies(
    who.cookie.split('; ').map((pair) => {
      const [name, ...value] = pair.split('=');
      return { name, value: value.join('='), domain: hostname, path: '/' };
    })
  );
  const page = await context.newPage();
  const problems = [];
  try {
    await page.goto(`/dashboard/rules?project=${projectId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
    const row = page.locator('tr', { hasText: 'Badge for a lesson' });
    await row.getByTitle('Edit Rule').click();
    const dialog = page.getByRole('dialog');
    await dialog.getByText('First lesson').waitFor({ timeout: 10_000 }).catch(() => {});
    if (await dialog.getByText(/No achievements yet/).isVisible()) {
      problems.push('rule editor: "Award achievement" shows no badges until the Achievements page is opened');
    }
    await dialog.getByRole('button', { name: 'Update Rule' }).click();
    const closed = await dialog.waitFor({ state: 'hidden', timeout: 10_000 }).then(() => true, () => false);
    if (!closed) problems.push('rule editor: saving an edited rule leaves the dialog open');

    // Wait for any toasts to leave, then see what takes a click in the bottom-right corner.
    await page.waitForTimeout(7_000);
    const cornerIsToastArea = await page.evaluate(() => {
      const hit = document.elementFromPoint(window.innerWidth - 40, window.innerHeight - 40);
      return Boolean(hit?.closest('.fixed.bottom-5.right-5'));
    });
    if (cornerIsToastArea) problems.push('toast area: with no toasts it still takes clicks in the bottom-right corner');
  } catch (error) {
    problems.push(`rule editor: the check could not finish (${error.message.split('\n')[0]})`);
  } finally {
    await context.close();
  }
  return problems;
}

async function main() {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });

  const { owner, member, projectId, isPlatformAdmin } = await setUp();
  const browser = await chromium.launch({ executablePath: browserPath() });
  const desktop = { width: 1366, height: 800 };
  const phone = { width: 375, height: 812 };

  const runs = [
    { label: 'desktop-dark', who: owner, pages: PROJECT_PAGES, viewport: desktop, colorScheme: 'dark' },
    { label: 'desktop-light', who: owner, pages: PROJECT_PAGES, viewport: desktop, colorScheme: 'light' },
    { label: 'phone-dark', who: owner, pages: PROJECT_PAGES, viewport: phone, colorScheme: 'dark' },
    { label: 'member-dark', who: member, pages: MEMBER_PAGES, refused: ADMIN_ONLY_PAGES, viewport: desktop, colorScheme: 'dark' },
    ...(isPlatformAdmin ? [{ label: 'admin-dark', who: owner, pages: ADMIN_PAGES, viewport: desktop, colorScheme: 'dark' }] : []),
  ];

  const problems = [];
  const notes = [];
  let visited = 0;
  try {
    for (const run of runs) {
      const result = await walk(browser, { ...run, projectId });
      problems.push(...result.problems);
      notes.push(...result.notes);
      visited += result.count;
      console.log(`${run.label}: ${result.count} pages, ${result.problems.length} problems`);
    }
    const editorProblems = await checkRuleEditor(browser, { projectId, who: owner });
    problems.push(...editorProblems);
    console.log(`rule editor: ${editorProblems.length} problems`);
  } finally {
    await browser.close();
  }

  // Lesser accessibility findings, grouped, so they can be worked through without failing the build.
  const grouped = new Map();
  const where = new Map();
  for (const note of notes) {
    const key = note.replace(/^\S+ \S+: /, '').replace(/, \d+ places\)$/, ')');
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
    where.set(key, (where.get(key) ?? new Set()).add(note.split(': ')[0].split(' ')[1]));
  }
  // Where each finding is, unless it is on nearly every page.
  const pagesOf = (finding) => {
    const pages = [...(where.get(finding) ?? [])];
    return pages.length <= 6 ? ` on ${pages.join(', ')}` : '';
  };
  const report = [
    `Walked ${visited} page views.`,
    '',
    problems.length ? 'Problems:' : 'No problems.',
    ...problems.map((problem) => `- ${problem}`),
    '',
    'Accessibility findings that do not fail the walk (pages affected):',
    ...[...grouped.entries()].sort((a, b) => b[1] - a[1]).map(([finding, pages]) => `- ${finding}: ${pages}${pagesOf(finding)}`),
    '',
    'Colour pairs under 4.5:1 (times seen):',
    ...[...contrast.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 25)
      .map(([pair, seen]) => `- ${pair}: ${seen}`),
  ].join('\n');
  writeFileSync(join(out, 'report.txt'), `${report}\n`);
  console.log(`\n${report}\n\nScreenshots and report.txt are in ${out}`);
  if (problems.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
