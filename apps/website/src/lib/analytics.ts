/**
 * Cookie-free analytics. The provider's script is only added when it is configured (see
 * `components/Analytics.astro`), and nothing here stores anything in the visitor's browser, so the
 * site needs no consent banner.
 *
 * Mark anything worth counting with `data-track="<event>"`, or call `track()` from an island.
 */

/** The events Phase 9 counts. Keep names stable: dashboards and goals are built on them. */
export const EVENTS = {
  installStarted: 'install_started',
  playgroundRun: 'playground_run',
  demoStarted: 'demo_started',
  docsSearched: 'docs_searched',
} as const;

export type TrackedEvent = (typeof EVENTS)[keyof typeof EVENTS];

type Props = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: Props }) => void;
    umami?: { track: (event: string, data?: Props) => void };
    __gamiTracking?: boolean;
  }
}

/** Counts an event with whichever provider is loaded. Does nothing when none is configured. */
export function track(event: TrackedEvent | string, props?: Props): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.plausible) window.plausible(event, props ? { props } : undefined);
    else if (window.umami) window.umami.track(event, props);
  } catch {
    // Analytics must never break the page.
  }
}

/**
 * Counts clicks on `[data-track]` elements. Set up once per visit, so it survives page transitions.
 * Extra properties come from `data-track-*` attributes, for example `data-track-method="docker"`.
 */
export function setupTracking(): void {
  if (typeof window === 'undefined' || window.__gamiTracking) return;
  window.__gamiTracking = true;
  document.addEventListener(
    'click',
    (event) => {
      const target = (event.target as Element | null)?.closest<HTMLElement>('[data-track]');
      if (!target?.dataset.track) return;
      const props: Props = {};
      for (const [key, value] of Object.entries(target.dataset)) {
        if (key.startsWith('track') && key !== 'track' && value !== undefined) {
          props[key.slice(5, 6).toLowerCase() + key.slice(6)] = value;
        }
      }
      track(target.dataset.track, Object.keys(props).length ? props : undefined);
    },
    { capture: true }
  );
}
