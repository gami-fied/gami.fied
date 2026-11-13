/**
 * "How it works" as a scroll story (WEB-38). On wide screens with motion, the section pins while
 * the reader scrolls through the three steps, and a phone beside them shows each result as it
 * happens: the event arriving, the rule lighting up, then the XP bar filling and the badge toast.
 * Scrolling scrubs the timeline, so the reader sets the pace. On phones and with reduced motion
 * nothing pins: the steps stay stacked, with the standard reveal.
 */
import { scene, whenIdle } from '../lifecycle';
import { loadGsap } from '../gsap';

const STORY = '(min-width: 1024px) and (prefers-reduced-motion: no-preference)';

scene('[data-how-it-works]', async (root, { signal }) => {
  if (!(await whenIdle(signal))) return;
  const gsap = await loadGsap('ScrollTrigger');
  if (signal.aborted) return;
  const steps = [...root.querySelectorAll<HTMLElement>('.how-step')];
  const list = root.querySelector<HTMLElement>('.how-steps')!;
  const phone = (name: string) => root.querySelector<HTMLElement>(`[data-phone="${name}"]`)!;
  const media = gsap.matchMedia();

  media.add(STORY, () => {
    root.classList.add('is-story');
    // The story shows the steps itself, so the scroll reveal steps aside.
    list.dataset.revealed = '';
    gsap.set(steps, { clearProps: 'opacity,transform' });
    gsap.set(steps.slice(1), { opacity: 0, y: 24 });
    gsap.set([phone('event'), phone('rule'), phone('xp'), phone('toast')], { opacity: 0, y: 14 });
    gsap.set(phone('xp-fill'), { scaleX: 0.3 });

    const timeline = gsap.timeline({
      defaults: { ease: 'power2.out', duration: 1 },
      scrollTrigger: {
        trigger: root,
        // The section under the heading stays in view while the story plays.
        start: 'center center',
        end: '+=1600',
        pin: true,
        scrub: 0.6,
      },
    });

    // Step 1: the event arrives.
    timeline.to(phone('event'), { opacity: 1, y: 0 }, 0.2);
    // Step 2: a rule matches.
    // The old step is gone before the next arrives, so the two never overlap.
    timeline.to(steps[0]!, { opacity: 0, y: -24, duration: 0.4 }, 1.2).to(steps[1]!, { opacity: 1, y: 0, duration: 0.5 }, 1.65);
    timeline.to(phone('rule'), { opacity: 1, y: 0 }, 1.8);
    // Step 3: the player is rewarded.
    timeline.to(steps[1]!, { opacity: 0, y: -24, duration: 0.4 }, 2.8).to(steps[2]!, { opacity: 1, y: 0, duration: 0.5 }, 3.25);
    timeline.to(phone('xp'), { opacity: 1, y: 0 }, 3.2).to(phone('xp-fill'), { scaleX: 0.85 }, 3.4);
    timeline.to(phone('toast'), { opacity: 1, y: 0, ease: 'back.out(1.8)' }, 3.8);
    timeline.to({}, { duration: 0.6 });

    return () => {
      root.classList.remove('is-story');
      gsap.set([...steps, phone('event'), phone('rule'), phone('xp'), phone('toast'), phone('xp-fill')], { clearProps: 'all' });
    };
  });

  return () => media.revert();
});
