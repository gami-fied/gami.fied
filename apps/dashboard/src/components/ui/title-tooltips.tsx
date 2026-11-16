'use client';

import { useEffect, useState } from 'react';

const GAP = 8;

interface Shown {
  text: string;
  left: number;
  top: number;
  below: boolean;
}

/**
 * Turns every `title` on the page into a tooltip that also shows on keyboard focus. The browser's
 * own tooltip needs a mouse and a wait, so keyboard and touch users never see it.
 *
 * One listener covers every button and link, present and future. While the tooltip is up, the
 * `title` is set aside so the browser does not show its own on top, and an icon-only control with
 * no name of its own takes the title as its name.
 */
export function TitleTooltips() {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    let current: HTMLElement | null = null;

    const restore = () => {
      if (current?.dataset['tip']) current.setAttribute('title', current.dataset['tip']);
      current = null;
      setShown(null);
    };

    const show = (event: Event) => {
      const target = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[title]');
      if (!target || target === current) return;
      const text = target.getAttribute('title')?.trim();
      if (!text) return;
      restore();

      current = target;
      target.dataset['tip'] = text;
      target.removeAttribute('title');
      if (!target.getAttribute('aria-label') && !target.textContent?.trim()) target.setAttribute('aria-label', text);

      const box = target.getBoundingClientRect();
      const below = box.top < 48;
      setShown({ text, left: Math.min(Math.max(box.left + box.width / 2, 80), window.innerWidth - 80), top: below ? box.bottom + GAP : box.top - GAP, below });
    };

    const hide = (event: Event) => {
      if (!current) return;
      const related = (event as MouseEvent | FocusEvent).relatedTarget as Node | null;
      if (related && current.contains(related)) return;
      restore();
    };
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && restore();

    document.addEventListener('mouseover', show);
    document.addEventListener('focusin', show);
    document.addEventListener('mouseout', hide);
    document.addEventListener('focusout', hide);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', restore, true);
    return () => {
      restore();
      document.removeEventListener('mouseover', show);
      document.removeEventListener('focusin', show);
      document.removeEventListener('mouseout', hide);
      document.removeEventListener('focusout', hide);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', restore, true);
    };
  }, []);

  if (!shown) return null;
  return (
    <span
      role="tooltip"
      style={{ left: shown.left, top: shown.top }}
      className={`pointer-events-none fixed z-[60] max-w-xs -translate-x-1/2 border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-100 shadow-lg ${shown.below ? '' : '-translate-y-full'}`}
    >
      {shown.text}
    </span>
  );
}
