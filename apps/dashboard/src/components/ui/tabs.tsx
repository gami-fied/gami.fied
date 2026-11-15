'use client';

import React, { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** Shown before the label. */
  icon?: ReactNode;
  /** Shown after the label, such as a count of things waiting. */
  badge?: ReactNode;
}

interface TabsProps<T extends string> {
  /** What these tabs switch between, for screen readers. */
  label: string;
  items: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
}

/**
 * The one set of tabs for the dashboard. Only the selected tab is in the Tab order, and the arrow,
 * Home and End keys move between tabs, which is what a keyboard user expects of tabs.
 */
export function Tabs<T extends string>({ label, items, value, onChange, className = '' }: TabsProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = items.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    const target = items[next];
    if (!target) return;
    onChange(target.id);
    buttons.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={`flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {items.map((item, index) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-1.5 text-sm transition-colors ${
              selected ? 'border-brand-500 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {item.icon}
            {item.label}
            {item.badge}
          </button>
        );
      })}
    </div>
  );
}
