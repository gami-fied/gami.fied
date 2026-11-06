'use client';

import React, { InputHTMLAttributes, ReactNode, forwardRef, useEffect, useRef } from 'react';
import { Check, Minus } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type ToggleProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  label?: ReactNode;
  /** Smaller text under the label. */
  description?: ReactNode;
};

/** Wraps a control and its text, so clicking either one works. */
function ToggleLabel({
  children,
  label,
  description,
  className,
}: Pick<ToggleProps, 'label' | 'description' | 'className'> & { children: ReactNode }) {
  return (
    <label
      className={twMerge(
        'inline-flex items-start gap-2 text-xs text-zinc-300 cursor-pointer has-disabled:cursor-not-allowed has-disabled:opacity-50',
        className
      )}
    >
      {children}
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block">{label}</span>}
          {description && <span className="block text-zinc-400">{description}</span>}
        </span>
      )}
    </label>
  );
}

const BOX =
  'peer m-0 block h-4 w-4 cursor-pointer appearance-none border border-zinc-600 bg-zinc-900 transition-colors hover:border-zinc-500 checked:border-brand-500 checked:bg-brand-500 indeterminate:border-brand-500 indeterminate:bg-brand-500 disabled:cursor-not-allowed';

export interface CheckboxProps extends ToggleProps {
  /** Shows a dash, for a "select all" with only some items selected. */
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, description, className, indeterminate = false, ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
      if (inputRef.current) inputRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
      <ToggleLabel label={label} description={description} className={className}>
        <span className="relative mt-px block h-4 w-4 shrink-0">
          <input
            ref={(node) => {
              inputRef.current = node;
              if (typeof ref === 'function') ref(node);
              else if (ref) ref.current = node;
            }}
            type="checkbox"
            className={BOX}
            {...props}
          />
          <Check
            aria-hidden="true"
            strokeWidth={3}
            className="pointer-events-none absolute inset-0.5 h-3 w-3 text-on-accent opacity-0 peer-checked:opacity-100 peer-indeterminate:opacity-0"
          />
          <Minus
            aria-hidden="true"
            strokeWidth={3}
            className="pointer-events-none absolute inset-0.5 h-3 w-3 text-on-accent opacity-0 peer-indeterminate:opacity-100"
          />
        </span>
      </ToggleLabel>
    );
  }
);
Checkbox.displayName = 'Checkbox';

export const Radio = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, description, className, ...props }, ref) => (
    <ToggleLabel label={label} description={description} className={className}>
      <span className="relative mt-px block h-4 w-4 shrink-0">
        <input ref={ref} type="radio" className={twMerge(BOX, 'rounded-full')} {...props} />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-[5px] rounded-full bg-on-accent opacity-0 peer-checked:opacity-100"
        />
      </span>
    </ToggleLabel>
  )
);
Radio.displayName = 'Radio';

/** On or off, taking effect straight away. Use a Checkbox for choices saved with a form. */
export const Switch = forwardRef<HTMLInputElement, ToggleProps>(
  ({ label, description, className, ...props }, ref) => (
    <ToggleLabel label={label} description={description} className={className}>
      <span className="relative block h-4 w-8 shrink-0">
        <input
          ref={ref}
          type="checkbox"
          role="switch"
          className="peer m-0 block h-4 w-8 cursor-pointer appearance-none bg-zinc-700 transition-colors checked:bg-success-600 disabled:cursor-not-allowed"
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-0.5 top-0.5 h-3 w-3 bg-zinc-100 transition-transform peer-checked:translate-x-4"
        />
      </span>
    </ToggleLabel>
  )
);
Switch.displayName = 'Switch';
