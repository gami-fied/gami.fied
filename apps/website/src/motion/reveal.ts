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
// motion/mini runs on the browser's own animation engine, so the reveal costs only a few KB.
import { animate } from 'motion/mini';
import { inView } from 'motion';
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
  let settle: number | undefined;
  const stop = inView(
    element,
    () => {
      const animations = targets.map((target, index) =>
        animate(target, { opacity: [0, 1], transform: [`translateY(${MOTION.rise}px)`, 'none'] }, { duration: MOTION.enter, ease: MOTION.easeOut, delay: index * MOTION.stagger })
      );
      element.dataset.revealed = '';
      stop();
      // A busy or throttled page can stall a fade part-way. Shortly after it should have
      // ended, every fade is finished, so content is never left half-visible.
      const total = (MOTION.enter + MOTION.stagger * targets.length) * 1000 + 400;
      settle = window.setTimeout(() => animations.forEach((animation) => animation.complete()), total);
    },
    // Anything already scrolled past counts as reached: a fast scroll or a jump to an anchor can
    // carry a section past the screen without it ever being seen intersecting.
    { amount: 0.15, margin: '100000px 0px 0px 0px' }
  );
  signal.addEventListener('abort', () => {
    stop();
    window.clearTimeout(settle);
  });
});

/** Images in long-form text fade in once they load, instead of appearing in pieces. */
scene('.prose-site img', (image) => {
  const done = () => (image.dataset.loaded = '');
  if ((image as HTMLImageElement).complete) done();
  else {
    image.addEventListener('load', done, { once: true });
    image.addEventListener('error', done, { once: true });
  }
});
