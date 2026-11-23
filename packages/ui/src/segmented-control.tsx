import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CONTROL_HEIGHT, type ControlSize } from './field';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Names the group for screen readers. */
  label: string;
  /** `md` (36 px, the default) or `sm` (32 px): the same height as the inputs and buttons beside it. */
  size?: ControlSize;
  className?: string;
}

/**
 * A row of buttons where one is chosen, such as a time range. The whole control is as tall as a
 * field of the same size, and every option has a border that is transparent until chosen, so
 * choosing one neither moves the text nor animates a border in.
 */
export function SegmentedControl<T extends string>({ options, value, onChange, label, size = 'md', className }: SegmentedControlProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      className={twMerge(clsx('inline-flex shrink-0 items-stretch gap-0.5 border border-zinc-800 bg-zinc-900 p-0.5', CONTROL_HEIGHT[size], className))}
    >
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={chosen}
            onClick={() => onChange(option.value)}
            className={clsx(
              'border px-3 text-xs font-semibold whitespace-nowrap transition-colors',
              chosen ? 'border-brand-500/30 bg-brand-500/20 text-brand-400' : 'border-transparent text-zinc-400 hover:text-zinc-100'
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
