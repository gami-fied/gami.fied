/**
 * Shared timing for every animation on the site, so CSS, GSAP and Motion all move alike. The same
 * values are CSS variables in `styles/site.css` (`--motion-*`); keep the two in step.
 */
export const MOTION = {
  /** Hovers, presses, toggles. */
  instant: 0.12,
  /** Page transitions, menus, tooltips. */
  quick: 0.2,
  /** Scroll reveals. */
  enter: 0.45,
  /** Headline reveals and scene steps. */
  scene: 0.7,
  /** Between items in a group. */
  stagger: 0.06,
  /** How far a revealed item travels, in pixels. */
  rise: 16,
  /** Things arriving: expo out. */
  easeOut: [0.16, 1, 0.3, 1] as [number, number, number, number],
  /** Things moving from place to place. */
  easeInOut: [0.65, 0, 0.35, 1] as [number, number, number, number],
  /** Interactive things that follow the pointer or a value. */
  spring: { type: 'spring' as const, stiffness: 260, damping: 24 },
} as const;

/** The same curves, written for GSAP. */
export const GSAP_EASE = {
  out: 'expo.out',
  inOut: 'power3.inOut',
} as const;
