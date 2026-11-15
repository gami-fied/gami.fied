'use client';

import React, { useId, useRef, useState, type ReactNode } from 'react';

interface TooltipProps {
  /** What the tooltip says. The control inside still needs its own accessible name. */
  label: string;
  /** Which side of the control it appears on. */
  side?: 'right' | 'top' | 'bottom';
  /** Show nothing, for a control that already has its label next to it. */
  disabled?: boolean;
  children: ReactNode;
  className?: string;
}

const GAP = 8;

/**
 * A label that appears on hover and on keyboard focus. The browser's own `title` tooltip only
 * shows for a mouse, after a delay, so keyboard and touch users never see it.
 *
 * It is placed against the window, not its parent, so a scrolling container such as the sidebar
 * cannot cut it off.
 */
export function Tooltip({ label, side = 'top', disabled, children, className = '' }: TooltipProps) {
  const anchor = useRef<HTMLSpanElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const id = useId();

  if (disabled) return <>{children}</>;

  const show = () => {
    const box = anchor.current?.getBoundingClientRect();
    if (!box) return;
    setPosition(
      side === 'right'
        ? { left: box.right + GAP, top: box.top + box.height / 2 }
        : { left: box.left + box.width / 2, top: side === 'top' ? box.top - GAP : box.bottom + GAP }
    );
  };
  const hide = () => setPosition(null);

  const shift =
    side === 'right' ? '-translate-y-1/2' : side === 'top' ? '-translate-x-1/2 -translate-y-full' : '-translate-x-1/2';

  return (
    <span
      ref={anchor}
      className={`inline-flex ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={(event) => event.key === 'Escape' && hide()}
    >
      {children}
      {position && (
        <span
          id={id}
          role="tooltip"
          style={{ left: position.left, top: position.top }}
          className={`pointer-events-none fixed z-50 whitespace-nowrap border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs font-medium text-zinc-100 shadow-lg ${shift}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
