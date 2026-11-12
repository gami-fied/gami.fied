/* global document, window, scrollY -- the page.evaluate callbacks run in the browser. */
// Records a short clip of every animated scene, with motion and with reduced motion, so changes to
// them can be reviewed in a pull request (WEB-44). Clips go to motion-recordings/, which git ignores.
//
//   pnpm --filter @gami/website preview   (in another terminal)
//   SITE_URL=http://localhost:4321 node scripts/record-scenes.mjs
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const site = (process.env.SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
const out = join(root, 'motion-recordings');
const chromePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].find(
  (path) => path && existsSync(path)
);

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

/** Each scene: where it is, and what to do while recording. */
const SCENES = [
  { name: 'hero-and-engine', path: '/', run: async () => wait(7000) },
  {
    name: 'how-it-works',
    path: '/',
    run: async (page) => {
      const top = await page.evaluate(() => document.querySelector('[data-how-it-works]').getBoundingClientRect().top + scrollY - 200);
      await page.evaluate((y) => window.scrollTo(0, y), top);
      for (let i = 0; i < 40; i++) {
        await page.mouse.wheel(0, 50);
        await wait(160);
      }
    },
  },
  {
    name: 'home-touches',
    path: '/',
    run: async (page) => {
      await page.locator('[data-tilt]').first().scrollIntoViewIfNeeded();
      const card = await page.locator('[data-tilt]').first().boundingBox();
      for (let i = 0; i <= 20; i++) {
        await page.mouse.move(card.x + (card.width * i) / 20, card.y + card.height / 3);
        await wait(60);
      }
      await page.locator('[data-code-tabs] [role=tab]').nth(1).click();
      await wait(800);
      await page.locator('[data-glow]').scrollIntoViewIfNeeded();
      const glow = await page.locator('[data-glow]').boundingBox();
      for (let i = 0; i <= 20; i++) {
        await page.mouse.move(glow.x + (glow.width * i) / 20, glow.y + glow.height / 2);
        await wait(60);
      }
    },
  },
  ...['progression', 'economy', 'competition', 'community', 'integrations', 'administration'].map((slug) => ({
    name: `feature-${slug}`,
    path: `/features/${slug}/`,
    run: async () => wait(6000),
  })),
  {
    name: 'playground',
    path: '/playground/',
    run: async (page) => {
      await wait(800);
      await page.getByRole('button', { name: 'Send event' }).click();
      await wait(3500);
    },
  },
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: chromePath });
try {
  for (const reducedMotion of ['no-preference', 'reduce']) {
    for (const scene of SCENES) {
      const raw = join(out, 'raw');
      const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion, recordVideo: { dir: raw, size: { width: 1280, height: 800 } } });
      const page = await context.newPage();
      await page.goto(`${site}${scene.path}`, { waitUntil: 'networkidle' });
      await scene.run(page);
      const video = page.video();
      await context.close();
      const file = join(out, `${scene.name}${reducedMotion === 'reduce' ? '.reduced-motion' : ''}.webm`);
      renameSync(await video.path(), file);
      rmSync(raw, { recursive: true, force: true });
      console.log(`Recorded ${file.slice(root.length + 1)}`);
    }
  }
} finally {
  await browser.close();
}
