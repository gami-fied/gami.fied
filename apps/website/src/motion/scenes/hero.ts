/**
 * The hero headline (WEB-36). It is in the page and readable from the first paint. If the fonts
 * arrive quickly, before anyone could have started reading, each word lifts from behind a mask,
 * 40 ms apart, and the text under it fades in just after. Otherwise, and with reduced motion, it
 * stays exactly as it is.
 *
 * The words are wrapped here rather than with SplitText, which keeps it out of the page.
 */
import { scene } from '../lifecycle';
import { loadGsap } from '../gsap';
import { GSAP_EASE, MOTION } from '../tokens';

/** Past this, the headline has been on screen long enough that moving it would be distracting. */
const LATEST_START_MS = 700;

scene('[data-hero-headline]', async (headline, { reduced, signal }) => {
  if (reduced || window.scrollY > 0) return;
  const startedAt = performance.now();
  await document.fonts.ready;
  if (signal.aborted || performance.now() - startedAt > LATEST_START_MS) return;

  const gsap = await loadGsap();
  if (signal.aborted) return;

  // Each word sits in a mask it rises out of. Screen readers keep reading the original text.
  const original = headline.innerHTML;
  const text = headline.textContent ?? '';
  headline.setAttribute('aria-label', text.trim());
  headline.innerHTML = text
    .trim()
    .split(/\s+/)
    .map((word) => `<span aria-hidden="true" style="display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:0.08em;margin-bottom:-0.08em"><span style="display:inline-block">${word.replace(/</g, '&lt;')}</span></span>`)
    .join(' ');
  const words = [...headline.querySelectorAll<HTMLElement>(':scope > span > span')];
  const after = headline.parentElement?.querySelectorAll('[data-hero-after]') ?? [];
  const timeline = gsap
    .timeline()
    .from(words, { yPercent: 105, duration: MOTION.scene, ease: GSAP_EASE.out, stagger: 0.04 })
    .from(after, { opacity: 0, y: 8, duration: MOTION.enter, ease: GSAP_EASE.out, stagger: MOTION.stagger }, 0.15);

  return () => {
    timeline.kill();
    headline.innerHTML = original;
    headline.removeAttribute('aria-label');
  };
});
