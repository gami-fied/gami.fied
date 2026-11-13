/**
 * The home page's smaller touches (WEB-39). With reduced motion none of them run, and everything
 * is shown in its final state.
 */
import { inView } from 'motion';
import { loadGsap, type Gsap } from '../gsap';
import { scene, whenIdle } from '../lifecycle';

const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

/** Feature cards tilt up to 3 degrees towards the pointer, and their icon draws itself once. */
scene('[data-tilt]', (card, { reduced, signal }) => {
  if (reduced || !finePointer()) return;
  const icon = card.querySelectorAll<SVGGeometryElement>('[data-tilt-icon] svg :is(path, circle, line, polyline, rect)');
  let gsap: Gsap | null = null;
  let tilt: { x: (value: number) => void; y: (value: number) => void } | null = null;
  let drawing: ReturnType<Gsap['fromTo']> | null = null;

  // GSAP loads on the first hover, so the cards cost nothing until someone points at one.
  card.addEventListener(
    'pointerenter',
    async () => {
      gsap ??= await loadGsap('DrawSVGPlugin');
      if (signal.aborted) return;
      if (!tilt) {
        gsap.set(card, { transformPerspective: 800 });
        tilt = {
          x: gsap.quickTo(card, 'rotateX', { duration: 0.5, ease: 'power3.out' }),
          y: gsap.quickTo(card, 'rotateY', { duration: 0.5, ease: 'power3.out' }),
        };
      }
      if (drawing?.isActive() || icon.length === 0) return;
      drawing = gsap.fromTo(icon, { drawSVG: '0%' }, { drawSVG: '100%', duration: 1, ease: 'power2.inOut', stagger: 0.08 });
    },
    { signal }
  );
  card.addEventListener(
    'pointermove',
    (event) => {
      if (!tilt) return;
      const box = card.getBoundingClientRect();
      tilt.y(((event.clientX - box.left) / box.width - 0.5) * 6);
      tilt.x(-((event.clientY - box.top) / box.height - 0.5) * 6);
    },
    { signal }
  );
  card.addEventListener(
    'pointerleave',
    () => {
      tilt?.x(0);
      tilt?.y(0);
    },
    { signal }
  );
  return () => {
    drawing?.revert();
    gsap?.set(card, { clearProps: 'transform' });
  };
});

/** The tour starts tilted back and flattens to face the reader as it scrolls into view. */
scene('[data-flatten]', async (figure, { reduced, signal }) => {
  if (reduced || !(await whenIdle(signal))) return;
  const gsap = await loadGsap('ScrollTrigger');
  if (signal.aborted) return;
  const tween = gsap.fromTo(
    figure,
    { rotateX: 12, transformPerspective: 1400, transformOrigin: '50% 100%', opacity: 0.6 },
    { rotateX: 0, opacity: 1, ease: 'none', scrollTrigger: { trigger: figure, start: 'top 95%', end: 'top 35%', scrub: 0.5 } }
  );
  return () => {
    tween.scrollTrigger?.kill();
    tween.revert();
  };
});

/** Each number counts up once, over 1.2 seconds, when it comes into view. */
scene('[data-count-to]', (element, { reduced, signal }) => {
  const target = Number(element.dataset.countTo);
  if (reduced || !Number.isFinite(target)) return;
  const format = new Intl.NumberFormat('en');
  element.textContent = '0';
  // GSAP loads when the first number comes into view, not with the page.
  const stop = inView(element, () => {
    stop();
    void loadGsap().then((gsap) => {
      if (signal.aborted) return;
      const value = { n: 0 };
      gsap.to(value, { n: target, duration: 1.2, ease: 'expo.out', onUpdate: () => (element.textContent = format.format(Math.round(value.n))) });
    });
  });
  signal.addEventListener('abort', () => {
    stop();
    element.textContent = format.format(target);
  });
});

/** A soft glow follows the pointer over the final call to action, through CSS variables only. */
scene('[data-glow]', (panel, { reduced, signal }) => {
  if (reduced || !finePointer()) return;
  panel.addEventListener(
    'pointermove',
    (event) => {
      const box = panel.getBoundingClientRect();
      panel.style.setProperty('--glow-x', `${event.clientX - box.left}px`);
      panel.style.setProperty('--glow-y', `${event.clientY - box.top}px`);
      panel.style.setProperty('--glow-opacity', '1');
    },
    { signal }
  );
  panel.addEventListener('pointerleave', () => panel.style.setProperty('--glow-opacity', '0'), { signal });
});
