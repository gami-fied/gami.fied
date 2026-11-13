// The page-speed half of the animation budget (WEB-35): Lighthouse on a simulated mid-range phone.
// Run it against the built site, served by `pnpm preview`:
//
//   SITE_URL=http://localhost:4321 node scripts/check-lighthouse.mjs
//
// Each page runs three times and the median counts, because one run on a shared CI machine is
// noisy. When a page falls short, the metrics behind its score and the scripts that kept the main
// thread busy are printed. CPU_SLOWDOWN=8 simulates a slower machine, to reproduce a CI result
// locally (Lighthouse's own default is 4).
//
// It uses an installed Chrome (CHROME_PATH, or the usual places), so nothing is downloaded.
import { existsSync } from 'node:fs';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';

const site = (process.env.SITE_URL || 'http://localhost:4321').replace(/\/$/, '');
const PAGES = ['/', '/features/progression/', '/playground/'];
const LIMITS = { performance: 95, lcpMs: 2000, cls: 0.01 };
const RUNS = Number(process.env.LIGHTHOUSE_RUNS) || 3;
const cpuSlowdown = Number(process.env.CPU_SLOWDOWN) || undefined;

const chromePath = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(
  (path) => path && existsSync(path)
);

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const ms = (value) => `${Math.round(value)} ms`;

/** One Lighthouse run of a page: its score, the metrics behind it, and where the main thread went. */
async function measure(port, page) {
  const result = await lighthouse(
    `${site}${page}`,
    { port, onlyCategories: ['performance'], logLevel: 'error' },
    cpuSlowdown ? { extends: 'lighthouse:default', settings: { throttling: { cpuSlowdownMultiplier: cpuSlowdown } } } : undefined
  );
  const { categories, audits } = result.lhr;
  return {
    score: Math.round((categories.performance.score ?? 0) * 100),
    fcp: audits['first-contentful-paint'].numericValue ?? 0,
    lcp: audits['largest-contentful-paint'].numericValue ?? Infinity,
    tbt: audits['total-blocking-time'].numericValue ?? 0,
    si: audits['speed-index'].numericValue ?? 0,
    cls: audits['cumulative-layout-shift'].numericValue ?? Infinity,
    scripts: (audits['bootup-time']?.details?.items ?? []).slice(0, 5).map((item) => `${ms(item.total)}  ${String(item.url).replace(site, '')}`),
    shifts: (audits['layout-shifts']?.details?.items ?? []).map((item) => `${Number(item.score ?? 0).toFixed(3)}  ${item.node?.selector ?? ''}`),
  };
}

const chrome = await chromeLauncher.launch({ chromePath, chromeFlags: ['--headless=new', '--no-sandbox'] });
let failed = false;
try {
  if (cpuSlowdown) console.log(`Simulating a CPU ${cpuSlowdown} times slower than this machine.\n`);
  for (const page of PAGES) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) runs.push(await measure(chrome.port, page));
    // The run with the median score stands for the page.
    const run = runs.find((r) => r.score === median(runs.map((r) => r.score)));
    // The playground is a whole app, so only its layout shift is held to the limit.
    const isApp = page === '/playground/';
    const ok = run.cls <= LIMITS.cls && (isApp || (run.score >= LIMITS.performance && run.lcp <= LIMITS.lcpMs));
    failed ||= !ok;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${page.padEnd(26)} performance ${String(run.score).padStart(3)} (runs: ${runs.map((r) => r.score).join(', ')})  LCP ${(run.lcp / 1000).toFixed(2)} s  CLS ${run.cls.toFixed(3)}${isApp ? '  (app: layout shift only)' : ''}`
    );
    if (!ok || run.score < LIMITS.performance) {
      console.log(`       first paint ${ms(run.fcp)}, speed index ${ms(run.si)}, total blocking time ${ms(run.tbt)}`);
      for (const line of run.scripts) console.log(`       main thread  ${line}`);
    }
    for (const line of run.shifts.filter((s) => !s.startsWith('0.000'))) console.log(`       shift ${line}`);
  }
} finally {
  await chrome.kill();
}
if (failed) {
  console.error(`\nLimits: performance ${LIMITS.performance}+, largest content within ${LIMITS.lcpMs / 1000} s, layout shift under ${LIMITS.cls}.`);
  process.exit(1);
}
