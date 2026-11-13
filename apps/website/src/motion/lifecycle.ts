/**
 * Starts and stops the site's animations around page transitions.
 *
 * A component registers a scene for a selector. On every `astro:page-load` the scene starts once
 * for each matching element, and on `astro:before-swap` every scene is cleaned up, so nothing runs
 * twice, keeps a ScrollTrigger alive, or leaks after a page transition. When reduced motion is
 * switched on or off, every scene is stopped and started again in the other mode.
 *
 *   scene('[data-engine-diagram]', async (el, { reduced }) => {
 *     if (reduced) return;
 *     const tl = ...;
 *     return () => tl.kill();
 *   });
 */

export interface SceneContext {
  /** True when the reader asked for reduced motion. Show the still version. */
  reduced: boolean;
  /** Aborted when the scene is stopped, for listeners and async work. */
  signal: AbortSignal;
}

type Cleanup = () => void;
type SceneStart = (element: HTMLElement, context: SceneContext) => void | Cleanup | Promise<void | Cleanup>;

interface Running {
  controller: AbortController;
  cleanup: Promise<void | Cleanup>;
}

const scenes = new Map<string, SceneStart>();
const running = new Map<HTMLElement, Running>();
let wired = false;

const reducedQuery = () => window.matchMedia('(prefers-reduced-motion: reduce)');

/** The one reduced-motion switch for the site. */
export const prefersReducedMotion = () => reducedQuery().matches;

function startAll() {
  const reduced = prefersReducedMotion();
  for (const [selector, start] of scenes) {
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (running.has(element)) continue;
      const controller = new AbortController();
      const cleanup = Promise.resolve()
        .then(() => start(element, { reduced, signal: controller.signal }))
        .catch((error) => {
          // An animation must never break the page; the still version stays.
          console.warn(`Animation for ${selector} did not start`, error);
        });
      running.set(element, { controller, cleanup });
    }
  }
}

function stopAll() {
  for (const [element, scene] of running) {
    scene.controller.abort();
    void scene.cleanup.then((cleanup) => cleanup?.());
    running.delete(element);
  }
}

function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener('astro:page-load', startAll);
  document.addEventListener('astro:before-swap', stopAll);
  reducedQuery().addEventListener('change', () => {
    stopAll();
    startAll();
  });
}

/** Registers an animation for every element matching `selector`, on this page and later ones. */
export function scene(selector: string, start: SceneStart): void {
  scenes.set(selector, start);
  wire();
  // The page may have loaded before this module did.
  if (document.readyState !== 'loading') startAll();
}

/**
 * Resolves once the page has loaded and the browser has a quiet moment, so a scene's setup never
 * competes with the page's first paint and first input. Resolves false if the scene was stopped
 * meanwhile.
 */
export function whenIdle(signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    const run = () => resolve(!signal.aborted);
    // Safari has no requestIdleCallback.
    const wait = () => (typeof window.requestIdleCallback === 'function' ? window.requestIdleCallback(run, { timeout: 2000 }) : setTimeout(run, 300));
    if (document.readyState === 'complete') wait();
    else window.addEventListener('load', wait, { once: true });
  });
}

/** Runs `onVisible` while the element is on screen and the tab is visible, and `onHidden` otherwise. */
export function whileVisible(element: Element, signal: AbortSignal, onVisible: () => void, onHidden: () => void): void {
  let inView = false;
  const update = () => (inView && document.visibilityState === 'visible' ? onVisible() : onHidden());
  const observer = new IntersectionObserver(([entry]) => {
    inView = Boolean(entry?.isIntersecting);
    update();
  });
  observer.observe(element);
  document.addEventListener('visibilitychange', update, { signal });
  signal.addEventListener('abort', () => observer.disconnect());
}
