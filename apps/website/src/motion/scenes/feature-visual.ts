/**
 * One small live demo per feature page (WEB-40), playing over the still pictures in
 * FeatureVisual.astro. Each loops, plays only while on screen and the tab is visible, and with
 * reduced motion the still picture is what stays. Only transforms and opacity move.
 */
import { loadGsap, type Gsap } from '../gsap';
import { scene, whileVisible } from '../lifecycle';

type Timeline = ReturnType<Gsap['timeline']>;
type Build = (gsap: Gsap, root: HTMLElement, timeline: Timeline) => void;

const all = (root: HTMLElement, name: string) => [...root.querySelectorAll<HTMLElement>(`[data-fv="${name}"]`)];
const one = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-fv="${name}"]`)!;
const format = new Intl.NumberFormat('en-US');

/** Counts a number shown in `element` from `from` to `to`, as part of a timeline. */
function count(timeline: Timeline, element: HTMLElement, from: number, to: number, at: number | string, duration = 0.8) {
  const value = { n: from };
  timeline.to(value, { n: to, duration, ease: 'power1.out', onUpdate: () => (element.textContent = format.format(Math.round(value.n))) }, at);
}

const BUILDS: Record<string, Build> = {
  /** A week of days fills in one by one, the streak grows, and a freeze saves a missed day. */
  progression(gsap, root, timeline) {
    const days = all(root, 'day');
    const counter = one(root, 'streak-count');
    const frozen = days.find((day) => day.dataset.state === 'frozen');
    timeline.set(days, { opacity: 0.2, scale: 0.85 }).set(one(root, 'freeze-note'), { opacity: 0 }).set(one(root, 'xp'), { scaleX: 0.45 });
    timeline.call(() => (counter.textContent = '6'));
    days.forEach((day, index) => {
      const at = 0.3 + index * 0.35;
      timeline.to(day, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2)' }, at);
      if (day.dataset.state !== 'empty') timeline.call(() => (counter.textContent = String(7 + index)), [], at);
    });
    if (frozen) timeline.to(frozen, { scale: 1.12, duration: 0.25, yoyo: true, repeat: 1 }, 1.2).to(one(root, 'freeze-note'), { opacity: 1, duration: 0.4 }, 1.2);
    timeline.to(one(root, 'xp'), { scaleX: 1, duration: 0.8, ease: 'power2.out' }, 2.3);
    timeline.to({}, { duration: 1.6 });
  },

  /** A coin drops into the wallet, the balance ticks up, then a reward is bought and it ticks down. */
  economy(gsap, root, timeline) {
    const wallet = one(root, 'wallet');
    const balance = one(root, 'balance');
    const coffee = all(root, 'reward')[0]!;
    const coin = document.createElement('span');
    coin.className = 'pointer-events-none absolute right-24 top-2 h-4 w-4 rounded-full border border-warning-300 bg-warning-400/80';
    coin.dataset.fvTemp = '';
    wallet.appendChild(coin);
    timeline.set(coin, { y: -40, opacity: 0 }).call(() => (balance.textContent = '1,240'));
    timeline.to(coin, { y: 8, opacity: 1, duration: 0.5, ease: 'bounce.out' }, 0.3).to(coin, { opacity: 0, scale: 0.4, duration: 0.2 }, 0.85);
    count(timeline, balance, 1240, 1290, 0.85, 0.5);
    timeline.to(coffee, { scale: 1.03, duration: 0.2, yoyo: true, repeat: 1 }, 2.2);
    count(timeline, balance, 1290, 790, 2.4, 0.7);
    timeline.to({}, { duration: 1.4 });
    timeline.call(() => (balance.textContent = '1,240'));
  },

  /** Rows reorder as scores change: you pass Maya and move into the promotion zone. */
  competition(gsap, root, timeline) {
    const board = one(root, 'board');
    const rows = all(root, 'row');
    const you = rows.find((row) => row.dataset.name === 'You')!;
    const maya = rows.find((row) => row.dataset.name === 'Maya')!;
    const youXp = you.querySelector<HTMLElement>('[data-fv="row-xp"]')!;
    const order = (first: HTMLElement, second: HTMLElement) => {
      board.insertBefore(first, second);
      all(root, 'row').forEach((row, index) => (row.querySelector<HTMLElement>('[data-fv="rank"]')!.textContent = String(index + 1)));
    };
    count(timeline, youXp, 3975, 4520, 0.5, 0.9);
    timeline.call(() => {
      // Flip-style move with transforms only: measure, reorder, then slide from the old place.
      const before = new Map([you, maya].map((row) => [row, row.getBoundingClientRect().top]));
      order(you, maya);
      for (const row of [you, maya]) gsap.fromTo(row, { y: before.get(row)! - row.getBoundingClientRect().top }, { y: 0, duration: 0.5, ease: 'power3.inOut' });
    }, [], 1.5);
    timeline.to(you, { scale: 1.02, duration: 0.2, yoyo: true, repeat: 1 }, 2.1);
    timeline.to({}, { duration: 1.8 });
    timeline.call(() => {
      order(maya, you);
      youXp.textContent = '3,975';
    });
  },

  /** New activity slides into the top of the feed. */
  community(gsap, root, timeline) {
    const feed = one(root, 'feed');
    [0, 1, 2].forEach((step) => {
      timeline.call(() => {
        const last = feed.lastElementChild as HTMLElement;
        const items = [...feed.children] as HTMLElement[];
        const before = new Map(items.map((item) => [item, item.getBoundingClientRect().top]));
        feed.prepend(last);
        for (const item of items) if (item !== last) gsap.fromTo(item, { y: before.get(item)! - item.getBoundingClientRect().top }, { y: 0, duration: 0.35, ease: 'power3.inOut' });
        // The new item arrives once the others have made room, so their text never overlaps.
        gsap.fromTo(last, { opacity: 0, x: -12 }, { opacity: 1, x: 0, duration: 0.35, delay: 0.3, ease: 'power3.out' });
      }, [], 0.4 + step * 1.4);
    });
    timeline.to({}, { duration: 1.2 });
  },

  /** A pulse travels from each source into the engine, which passes it on to an output. */
  integrations(gsap, root, timeline) {
    const flow = one(root, 'flow');
    const engine = one(root, 'engine');
    const sources = all(root, 'source');
    const outputs = all(root, 'output');
    const dot = document.createElement('span');
    dot.className = 'pointer-events-none absolute left-0 top-0 h-2 w-2 bg-brand-400';
    dot.dataset.fvTemp = '';
    flow.appendChild(dot);
    const centre = (element: HTMLElement) => {
      const box = element.getBoundingClientRect();
      const base = flow.getBoundingClientRect();
      return { x: box.left - base.left + box.width / 2 - 4, y: box.top - base.top + box.height / 2 - 4 };
    };
    timeline.set(dot, { opacity: 0 });
    sources.forEach((source, index) => {
      const at = index * 1.1;
      timeline.call(() => {
        const from = centre(source);
        const mid = centre(engine);
        const to = centre(outputs[index]!);
        gsap
          .timeline()
          .set(dot, { x: from.x, y: from.y, opacity: 1 })
          .to(source, { opacity: 0.6, duration: 0.15, yoyo: true, repeat: 1 }, 0)
          .to(dot, { x: mid.x, y: mid.y, duration: 0.4, ease: 'power1.inOut' }, 0)
          .to(engine, { scale: 1.05, duration: 0.15, yoyo: true, repeat: 1 }, 0.35)
          .to(dot, { x: to.x, y: to.y, duration: 0.4, ease: 'power1.inOut' }, 0.5)
          .to(outputs[index]!, { opacity: 0.6, duration: 0.15, yoyo: true, repeat: 1 }, 0.85)
          .to(dot, { opacity: 0, duration: 0.15 }, 0.9);
      }, [], at);
    });
    timeline.to({}, { duration: 1 }, sources.length * 1.1);
  },

  /** Turning off a feature switches off what depends on it, one after another. */
  administration(gsap, root, timeline) {
    const switches = all(root, 'switch');
    const byKey = (key: string) => switches.find((item) => item.dataset.key === key)!;
    const turnOff = (item: HTMLElement, at: number, note?: string) => {
      const knob = item.querySelector<HTMLElement>('[data-fv="knob"]')!;
      const off = item.querySelector<HTMLElement>('[data-fv="switch-off"]');
      const noteEl = item.querySelector<HTMLElement>('[data-fv="switch-note"]')!;
      const original = noteEl.textContent;
      timeline.to(knob, { x: -16, opacity: 0.45, duration: 0.3, ease: 'power2.inOut' }, at);
      if (off) timeline.to(off, { opacity: 1, duration: 0.3 }, at);
      if (note) timeline.call(() => (noteEl.textContent = note), [], at + 0.1);
      return () => {
        noteEl.textContent = original;
      };
    };
    const restoreStore = turnOff(byKey('store'), 1.1, 'Off: needs Currencies & wallets');
    turnOff(byKey('wallets'), 0.5);
    timeline.to({}, { duration: 1.8 });
    timeline.call(restoreStore);
    timeline.set(switches.flatMap((item) => [...item.querySelectorAll('[data-fv="knob"], [data-fv="switch-off"]')]), { clearProps: 'transform,opacity' });
  },
};

scene('[data-feature-visual]', async (root, { reduced, signal }) => {
  const build = BUILDS[root.dataset.featureVisual ?? ''];
  if (reduced || !build) return;
  const gsap = await loadGsap();
  if (signal.aborted) return;
  const ctx = gsap.context(() => {
    const timeline = gsap.timeline({ repeat: -1, repeatDelay: 1, paused: true });
    build(gsap, root, timeline);
    whileVisible(root, signal, () => timeline.play(), () => timeline.pause());
  }, root);
  return () => {
    ctx.revert();
    root.querySelectorAll('[data-fv-temp]').forEach((element) => element.remove());
  };
});
