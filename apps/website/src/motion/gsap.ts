/**
 * GSAP and its plugins, loaded only by the components that use them and registered once. Pages
 * without a GSAP scene never download it.
 */
import type { gsap as GsapType } from 'gsap';

export type Gsap = typeof GsapType;

let core: Promise<Gsap> | null = null;
const registered = new Set<string>();

const PLUGINS = {
  ScrollTrigger: () => import('gsap/ScrollTrigger').then((m) => m.ScrollTrigger),
  SplitText: () => import('gsap/SplitText').then((m) => m.SplitText),
  Flip: () => import('gsap/Flip').then((m) => m.Flip),
  MotionPathPlugin: () => import('gsap/MotionPathPlugin').then((m) => m.MotionPathPlugin),
  DrawSVGPlugin: () => import('gsap/DrawSVGPlugin').then((m) => m.DrawSVGPlugin),
} as const;

type PluginName = keyof typeof PLUGINS;

/** GSAP with the named plugins registered. */
export async function loadGsap(...plugins: PluginName[]): Promise<Gsap> {
  core ??= import('gsap').then((m) => m.gsap);
  const gsap = await core;
  const missing = plugins.filter((name) => !registered.has(name));
  if (missing.length) {
    const loaded = await Promise.all(missing.map((name) => PLUGINS[name]()));
    gsap.registerPlugin(...loaded);
    missing.forEach((name) => registered.add(name));
  }
  return gsap;
}
