/**
 * The hero "live engine" (WEB-37), the home page's one big moment. Events leave the app, travel
 * along the paths into the engine, light up a rule, and come out as rewards: the XP bar fills, a
 * badge pops in, and the player climbs the leaderboard. It loops every 6 seconds, pauses when off
 * screen, in a background tab or when the reader presses pause, and with reduced motion it stays
 * the still, labelled diagram it starts as.
 */
import { scene, whileVisible } from '../lifecycle';
import { loadGsap } from '../gsap';

const SVG_NS = 'http://www.w3.org/2000/svg';

scene('[data-engine-diagram]', async (figure, { reduced, signal }) => {
  const button = figure.querySelector<HTMLButtonElement>('[data-engine-toggle]');
  if (reduced) {
    button?.setAttribute('hidden', '');
    return;
  }

  const gsap = await loadGsap('MotionPathPlugin');
  if (signal.aborted) return;
  const svg = figure.querySelector('svg')!;
  const part = <T extends SVGElement = SVGElement>(name: string) => svg.querySelector<T>(`[data-part="${name}"]`)!;

  const dots = [part<SVGCircleElement>('event-dot-1'), part<SVGCircleElement>('event-dot-2')];
  const pathsIn = [part<SVGPathElement>('path-in-1'), part<SVGPathElement>('path-in-2')];
  const pathsOut = [1, 2, 3].map((n) => part<SVGPathElement>(`path-out-${n}`));
  const rules = [1, 2, 3].map((n) => part(`rule-${n}`));
  const engine = part('engine').querySelector('rect')!;
  const xpFill = part('xp-fill');
  const badge = part('reward-badge');
  const rank = part('reward-rank').querySelector<SVGTextElement>('text:last-of-type')!;

  // Dots for rewards on their way out, made here so the still diagram stays simple.
  const outDots = pathsOut.map((_, i) => {
    const dot = document.createElementNS(SVG_NS, 'circle');
    dot.setAttribute('r', '4');
    dot.setAttribute('fill', ['var(--color-brand-400)', 'var(--color-warning-400)', 'var(--color-success-400)'][i]!);
    dot.setAttribute('opacity', '0');
    svg.appendChild(dot);
    return dot;
  });

  const ctx = gsap.context(() => {
    // Dots follow the paths' own coordinates, so they start from the origin.
    gsap.set([...dots, ...outDots], { attr: { cx: 0, cy: 0 } });
    gsap.set(xpFill, { scaleX: 0.25, transformOrigin: '0% 50%' });
    gsap.set(badge, { scale: 0.6, opacity: 0, transformOrigin: '50% 50%' });
    gsap.set(dots, { opacity: 0 });

    const travel = (dot: SVGCircleElement, path: SVGPathElement, at: number, duration = 0.9) => {
      timeline.set(dot, { opacity: 1 }, at);
      timeline.to(dot, { duration, ease: 'power1.inOut', motionPath: { path, autoRotate: false } }, at);
      timeline.to(dot, { opacity: 0, duration: 0.15 }, at + duration - 0.1);
    };
    const pulse = (ruleIndex: number, at: number) => {
      timeline.to(engine, { attr: { 'stroke-opacity': 1 }, duration: 0.15, yoyo: true, repeat: 1 }, at);
      timeline.fromTo(rules[ruleIndex]!, { opacity: 0.55 }, { opacity: 1, duration: 0.2, yoyo: true, repeat: 1 }, at);
    };

    const timeline = gsap.timeline({ repeat: -1, repeatDelay: 0.4, defaults: { ease: 'power2.out' } });
    // Each loop starts with the player at #5.
    timeline.call(() => (rank.textContent = '#5'), [], 0);
    // First event: a lesson, worth XP.
    travel(dots[0]!, pathsIn[0]!, 0);
    pulse(0, 0.9);
    travel(outDots[0]!, pathsOut[0]!, 1.05, 0.6);
    timeline.to(xpFill, { scaleX: 1, duration: 0.6 }, 1.6);
    // Second event: an order, which unlocks a badge.
    travel(dots[1]!, pathsIn[1]!, 1.9);
    pulse(1, 2.8);
    travel(outDots[1]!, pathsOut[1]!, 2.95, 0.6);
    timeline.to(badge, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2.4)' }, 3.5);
    // The XP lifts the player up the leaderboard.
    pulse(2, 3.7);
    travel(outDots[2]!, pathsOut[2]!, 3.85, 0.6);
    timeline.call(() => (rank.textContent = '#5 → #4'), [], 4.4);
    timeline.fromTo(rank, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, immediateRender: false }, 4.4);
    timeline.call(() => (rank.textContent = '#5 → #3'), [], 4.9);
    timeline.fromTo(rank, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, immediateRender: false }, 4.9);
    // The bar is drawn at 110 of 152 pixels, so 1.35 nearly fills the track.
    timeline.to(xpFill, { scaleX: 1.35, duration: 0.4 }, 4.9);
    // Reset quietly before the next loop.
    timeline.to([badge], { opacity: 0, scale: 0.6, duration: 0.3 }, 5.6);
    timeline.to(xpFill, { scaleX: 0.25, duration: 0.3 }, 5.6);
    timeline.call(() => (rank.textContent = '#5'), [], 5.9);

    // Pausing: off screen, in a background tab, or by the reader (WCAG 2.2.2).
    let pausedByReader = false;
    let visible = false;
    const sync = () => (visible && !pausedByReader ? timeline.play() : timeline.pause());
    whileVisible(figure, signal, () => ((visible = true), sync()), () => ((visible = false), sync()));
    if (button) {
      button.hidden = false;
      button.addEventListener(
        'click',
        () => {
          pausedByReader = !pausedByReader;
          button.setAttribute('aria-pressed', String(pausedByReader));
          button.querySelector('[data-label]')!.textContent = pausedByReader ? 'Play animation' : 'Pause animation';
          sync();
        },
        { signal }
      );
    }
  }, svg);

  return () => {
    ctx.revert();
    outDots.forEach((dot) => dot.remove());
    rank.textContent = '#5 → #3';
    button?.setAttribute('hidden', '');
  };
});
