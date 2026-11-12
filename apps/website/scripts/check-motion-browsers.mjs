/* global document, window, getComputedStyle -- the page.evaluate callbacks run in the browser. */
// Motion quality checks across browsers (WEB-44): every animated page in Chrome, Firefox and WebKit
// (Safari's engine), at desktop and phone sizes, with reduced motion on and off. It looks for
// script errors, content left hidden, layout shift, the engine's pause control, the scroll story
// pinning only where it should, and the playground's results.
//
//   pnpm --filter @gami/website preview          (in another terminal)
//   SITE_URL=http://localhost:4321 node scripts/check-motion-browsers.mjs
//
// Firefox and WebKit are Playwright's own builds: install them once with
// `npx playwright-core install firefox webkit`. Chrome is the installed one (CHROME_PATH).
import { existsSync } from 'node:fs';
import { chromium, devices, firefox, webkit } from 'playwright-core';

const site = (process.env.SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
const chromePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(
  (path) => path && existsSync(path)
);

const BROWSERS = [
  { name: 'chrome', type: chromium, launch: { executablePath: chromePath }, phone: devices['Pixel 7'] },
  { name: 'firefox', type: firefox, launch: {}, phone: { viewport: { width: 393, height: 851 }, hasTouch: true } },
  { name: 'webkit', type: webkit, launch: {}, phone: devices['iPhone 15'] },
];
const PAGES = ['/', '/features/progression/', '/features/competition/', '/features/administration/', '/pricing/', '/blog/gami-fied-1-1/', '/playground/', '/this-page-does-not-exist'];

async function checkPage(page, path, { desktop, reducedMotion }) {
  await page.goto(`${site}${path}`, { waitUntil: 'networkidle' });
  const height = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < height; y += 500) {
    // Scrolls the page itself, since phones (and mobile WebKit) have no mouse wheel.
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(110);
  }
  // Long enough for the last staggered reveal to finish, even in a slow emulated phone.
  await page.waitForTimeout(1500);
  return page.evaluate(
    ({ desktop, reducedMotion }) => {
      const problems = [];
      const story = document.querySelector('[data-how-it-works]');
      for (const group of document.querySelectorAll('[data-reveal],[data-reveal-group]')) {
        // The scroll story holds its own steps out of view; that is not a stuck reveal.
        if (story?.classList.contains('is-story') && story.contains(group)) continue;
        const targets = group.hasAttribute('data-reveal-group') ? [...group.children] : [group];
        if (targets.some((el) => parseFloat(getComputedStyle(el).opacity) < 0.99)) problems.push('content left hidden');
      }
      const shift = performance.getEntriesByType?.('layout-shift')?.reduce((sum, e) => sum + (e.hadRecentInput ? 0 : e.value), 0) ?? 0;
      if (shift > 0.01) problems.push(`layout shift ${shift.toFixed(3)}`);
      if (story) {
        const pinned = story.classList.contains('is-story');
        if (pinned !== (desktop && !reducedMotion)) problems.push(`story ${pinned ? 'pinned' : 'not pinned'} when it should ${pinned ? 'not' : ''} be`);
      }
      const toggle = document.querySelector('[data-engine-toggle]');
      if (toggle && toggle.hidden !== reducedMotion) problems.push(`engine pause control ${toggle.hidden ? 'missing' : 'shown with reduced motion'}`);
      return problems;
    },
    { desktop, reducedMotion }
  );
}

let failures = 0;
for (const browser of BROWSERS) {
  let instance;
  try {
    instance = await browser.type.launch(browser.launch);
  } catch (err) {
    console.log(`skip ${browser.name}: ${err.message.split('\n')[0]}`);
    continue;
  }
  for (const size of ['desktop', 'phone']) {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const options = size === 'desktop' ? { viewport: { width: 1440, height: 900 } } : browser.phone;
      const context = await instance.newContext({ ...options, reducedMotion });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (err) => errors.push(err.message));
      const found = [];
      for (const path of PAGES) {
        const problems = await checkPage(page, path, { desktop: size === 'desktop', reducedMotion: reducedMotion === 'reduce' });
        for (const problem of problems) found.push(`${path}: ${problem}`);
      }
      // The playground answers a sent event with a badge toast.
      await page.goto(`${site}/playground/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(500);
      await page.getByRole('button', { name: 'Send event' }).click();
      const toast = await page.locator('[role=status]:has-text("Badge unlocked")').waitFor({ timeout: 4000 }).then(() => true, () => false);
      if (!toast) found.push('/playground/: no badge toast after sending an event');
      for (const error of new Set(errors)) found.push(`script error: ${error}`);
      const label = `${browser.name.padEnd(8)} ${size.padEnd(8)} ${reducedMotion === 'reduce' ? 'reduced motion' : 'motion        '}`;
      console.log(`${found.length ? 'FAIL' : 'ok  '} ${label}${found.length ? `\n       ${found.join('\n       ')}` : ''}`);
      failures += found.length;
      await context.close();
    }
  }
  await instance.close();
}
if (failures) process.exit(1);
