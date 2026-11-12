// The page-speed half of the animation budget (WEB-35): Lighthouse on a simulated mid-range phone.
// Run it against the built site, served by `pnpm preview`:
//
//   SITE_URL=http://localhost:4321 node scripts/check-lighthouse.mjs
//
// It uses an installed Chrome (CHROME_PATH, or the usual places), so nothing is downloaded.
import { existsSync } from 'node:fs';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const site = (process.env.SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
const PAGES = ['/', '/features/progression/', '/playground/'];
const LIMITS = { performance: 95, lcpMs: 2000, cls: 0.01 };

const chromePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (path) => path && existsSync(path)
);
const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox'] });
let failed = false;
try {
  for (const page of PAGES) {
    // The mobile preset is Lighthouse's default: a mid-range phone on a slow 4G connection.
    const result = await lighthouse(`${site}${page}`, { port: chrome.port, onlyCategories: ['performance'], logLevel: 'error' });
    const { categories, audits } = result.lhr;
    const score = Math.round((categories.performance.score ?? 0) * 100);
    const lcp = audits['largest-contentful-paint'].numericValue ?? Infinity;
    const cls = audits['cumulative-layout-shift'].numericValue ?? Infinity;
    // The playground is a whole app, so only its layout shift is held to the limit.
    const isApp = page === '/playground/';
    const ok = cls <= LIMITS.cls && (isApp || (score >= LIMITS.performance && lcp <= LIMITS.lcpMs));
    failed ||= !ok;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${page.padEnd(26)} performance ${String(score).padStart(3)}  LCP ${(lcp / 1000).toFixed(2)} s  CLS ${cls.toFixed(3)}${isApp ? '  (app: layout shift only)' : ''}`);
    // Name what moved, so a shift is quick to track down.
    if (cls > 0) {
      for (const item of audits['layout-shifts']?.details?.items ?? []) {
        console.log(`       shift ${Number(item.score ?? 0).toFixed(3)}  ${item.node?.selector ?? ''}  ${(item.node?.snippet ?? '').slice(0, 110)}`);
      }
    }
  }
} finally {
  await chrome.kill();
}
if (failed) {
  console.error(`\nLimits: performance ${LIMITS.performance}+, largest content within ${LIMITS.lcpMs / 1000} s, layout shift under ${LIMITS.cls}.`);
  process.exit(1);
}
