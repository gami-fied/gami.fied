/**
 * The site's one reveal style (WEB-34): sections and cards fade in while rising 16 px, once, as
 * they scroll into view. `data-reveal` reveals an element; `data-reveal-group` reveals its children
 * one after another.
 *
 * `data-reveal-media` limits the reveal to a media query, for content that another scene animates
 * the rest of the time, such as the "how it works" steps.
 *
 * Content is only hidden while this script is running (`html[data-motion]`), so without
 * JavaScript, or with reduced motion, everything is simply there.
 */
import { animate, inView, stagger } from 'motion';
import { prefersReducedMotion, scene } from './lifecycle';
import { MOTION } from './tokens';

const SELECTOR = '[data-reveal], [data-reveal-group]';

function arm(root: HTMLElement) {
  if (prefersReducedMotion()) delete root.dataset.motion;
  else root.dataset.motion = '';
}

// The next page arrives already armed, so nothing in view flashes before its reveal starts.
document.addEventListener('astro:before-swap', (event) => arm((event as unknown as { newDocument: Document }).newDocument.documentElement));
arm(document.documentElement);

scene(SELECTOR, (element, { reduced, signal }) => {
  const media = element.dataset.revealMedia;
  if (reduced || (media && !window.matchMedia(media).matches)) {
    element.dataset.revealed = '';
    return;
  }
  const targets = element.hasAttribute('data-reveal-group') ? [...element.children] : [element];
  const stop = inView(
    element,
    () => {
      animate(targets, { opacity: [0, 1], y: [MOTION.rise, 0] }, { duration: MOTION.enter, ease: MOTION.easeOut, delay: stagger(MOTION.stagger) });
      element.dataset.revealed = '';
      stop();
    },
    { amount: 0.15 }
  );
  signal.addEventListener('abort', () => stop());
});
