/* global document -- the page.evaluate callbacks run in the browser. */
// Takes the feature page screenshots and records the product tour, from a live demo instance, so
// both can be made again for every release instead of going stale.
//
//   DEMO_URL=https://demo.gami.fied.cc pnpm --filter @gami/website capture
//
// It starts one demo through /demo, waits for the worker to process its month of events, then
// visits each page. Screenshots go to src/assets/screenshots/<feature>.png. The tour is recorded
// to public/video/tour.webm, and to tour.mp4 when ffmpeg is available (FFMPEG=path/to/ffmpeg).
//
// It drives a browser that is already installed (Chrome by default, or CHROME_PATH), so nothing
// is downloaded. Add --screenshots or --video to do only one of the two.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const demoUrl = (process.env.DEMO_URL || 'http://localhost:3100').replace(/\/$/, '');
const only = process.argv.find((arg) => arg === '--screenshots' || arg === '--video');
const VIEWPORT = { width: 1440, height: 900 };
// The dashboard follows the system theme; the website is dark, so its screenshots are too.
const COLOR_SCHEME = 'dark';

const CHROME_PATHS = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

/** The page that shows each feature area best, for its feature page on the website. */
const SCREENSHOTS = [
  { feature: 'progression', path: '/dashboard/achievements' },
  { feature: 'economy', path: '/dashboard/store' },
  { feature: 'competition', path: '/dashboard/leaderboard' },
  { feature: 'community', path: '/dashboard/users' },
  { feature: 'integrations', path: '/dashboard/developer' },
  { feature: 'administration', path: '/dashboard/rules' },
];

/** The tour: about two minutes, one caption per scene. The home page prints the same captions as a transcript. */
const TOUR = JSON.parse(readFileSync(join(root, 'src/lib/tour.json'), 'utf8'));

const wait = (ms) => new Promise((done) => setTimeout(done, ms));

function browserPath() {
  const found = CHROME_PATHS.find((path) => existsSync(path));
  if (!found) throw new Error('No Chrome found. Set CHROME_PATH to an installed Chrome or Chromium.');
  return found;
}

/** Hides development overlays, so they never end up in a screenshot. */
async function tidy(page) {
  await page.addStyleTag({ content: 'nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }' }).catch(() => {});
}

async function settle(page) {
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await tidy(page);
  await wait(1200);
}

/** Starts a demo and waits until the worker has processed its events. */
async function startDemo(context) {
  const page = await context.newPage();
  await page.goto(`${demoUrl}/demo`);
  await page.getByRole('button', { name: 'Start the demo' }).click({ timeout: 30_000 });
  await page.waitForURL(/\/dashboard/, { timeout: 60_000 });
  // A month of events takes the worker a little while.
  await wait(Number(process.env.CAPTURE_SETTLE_MS) || 15_000);
  return page;
}

async function caption(page, text) {
  await page.evaluate((value) => {
    let bar = document.getElementById('gami-caption');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'gami-caption';
      bar.style.cssText =
        'position:fixed;left:50%;bottom:36px;transform:translateX(-50%);z-index:2147483647;max-width:min(980px,90vw);padding:14px 22px;background:rgba(9,9,11,.92);border:1px solid #3f3f46;border-left:4px solid #f97316;color:#fafafa;font:600 20px/1.4 "Space Grotesk",system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.5);transition:opacity .3s';
      document.body.appendChild(bar);
    }
    bar.style.opacity = '0';
    setTimeout(() => {
      bar.textContent = value;
      bar.style.opacity = '1';
    }, 150);
  }, text);
}

async function screenshots(context, page) {
  const dir = join(root, 'src/assets/screenshots');
  mkdirSync(dir, { recursive: true });
  for (const shot of SCREENSHOTS) {
    await page.goto(`${demoUrl}${shot.path}`);
    await settle(page);
    // The demo banner is about the demo, not the feature, so screenshots leave it out.
    await page.addStyleTag({ content: '[aria-label="Live demo"] { display: none !important; }' });
    const file = join(dir, `${shot.feature}.png`);
    await page.screenshot({ path: file });
    console.log(`Saved ${shot.feature}: ${shot.path}`);
  }
}

async function tour(browser, storageState) {
  const dir = join(root, 'public/video');
  const raw = join(dir, 'raw');
  rmSync(raw, { recursive: true, force: true });
  mkdirSync(raw, { recursive: true });
  const context = await browser.newContext({ viewport: VIEWPORT, colorScheme: COLOR_SCHEME, storageState, recordVideo: { dir: raw, size: VIEWPORT } });
  const page = await context.newPage();
  // When each caption went up, so the same text can be offered as a caption track with exact times.
  const startedAt = Date.now();
  const cues = [];
  for (const scene of TOUR) {
    if (new URL(page.url() || 'about:blank', demoUrl).pathname !== scene.path) {
      await page.goto(`${demoUrl}${scene.path}`);
      await settle(page);
    }
    await caption(page, scene.caption);
    cues.push({ at: Date.now() - startedAt, text: scene.caption });
    if (scene.action === 'traffic') {
      await wait(1500);
      await page.getByRole('button', { name: 'Send traffic' }).click().catch(() => {});
    }
    // A slow scroll, so long pages are seen whole.
    const steps = Math.max(1, scene.seconds * 2);
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, 40);
      await wait(500);
    }
  }
  const endedAt = Date.now() - startedAt;
  const stamp = (ms) => new Date(ms).toISOString().slice(11, 23);
  const vtt = ['WEBVTT', '', ...cues.flatMap((cue, index) => [`${stamp(cue.at)} --> ${stamp(cues[index + 1]?.at ?? endedAt)}`, cue.text, ''])].join('\n');
  writeFileSync(join(dir, 'tour.vtt'), vtt);
  console.log('Saved the caption track: public/video/tour.vtt');

  const video = page.video();
  await context.close();
  const webm = join(dir, 'tour.webm');
  renameSync(await video.path(), webm);
  rmSync(raw, { recursive: true, force: true });
  console.log('Saved the tour: public/video/tour.webm');

  const ffmpeg = process.env.FFMPEG || 'ffmpeg';
  try {
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '28', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(dir, 'tour.mp4')]);
    execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-ss', '2', '-i', webm, '-frames:v', '1', '-q:v', '3', join(dir, 'tour-poster.jpg')]);
    rmSync(webm);
    console.log('Converted it to public/video/tour.mp4, with a poster frame');
  } catch {
    console.log('ffmpeg was not found, so only the WebM was kept. Set FFMPEG to convert it to MP4.');
  }
}

const browser = await chromium.launch({ executablePath: browserPath(), headless: true });
try {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, colorScheme: COLOR_SCHEME });
  const page = await startDemo(context);
  if (only !== '--video') await screenshots(context, page);
  if (only !== '--screenshots') await tour(browser, await context.storageState());
  await context.close();
} finally {
  await browser.close();
}
