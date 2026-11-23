import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The two control heights. Inputs, dropdowns and buttons of the same size are the same height,
 * so controls placed side by side line up: 36 px by default, 32 px for small.
 */
export const CONTROL_HEIGHT = {
  md: 'h-9',
  sm: 'h-8',
} as const;

export type ControlSize = keyof typeof CONTROL_HEIGHT;

/** Text size that goes with each control height. */
export const CONTROL_TEXT = {
  md: 'text-sm',
  sm: 'text-xs',
} as const;

/** How every form label looks. Use it for a label written by hand, so it matches `Field`. */
export const FIELD_LABEL_CLASS = 'block text-[13px] font-medium text-zinc-300 tracking-tight';

export interface FieldProps {
  label?: React.ReactNode;
  /** The control's id, so the label is a real `<label for>`. */
  htmlFor?: string;
  /** For a control that is not a form element (a dropdown button): the label gets this id instead. */
  labelId?: string;
  helperText?: React.ReactNode;
  error?: React.ReactNode;
  /** The id the control's `aria-describedby` points at. */
  messageId?: string;
  className?: string;
  children: React.ReactNode;
}

/** A label, a control, and help or an error under it, spaced the same way on every form. */
export function Field({ label, htmlFor, labelId, helperText, error, messageId, className, children }: FieldProps) {
  return (
    <div className={twMerge(clsx('space-y-1.5 w-full', className))}>
      {label &&
        (htmlFor ? (
          <label htmlFor={htmlFor} id={labelId} className={FIELD_LABEL_CLASS}>
            {label}
          </label>
        ) : (
          <span id={labelId} className={FIELD_LABEL_CLASS}>
            {label}
          </span>
        ))}
      {children}
      {error ? (
        <p id={messageId} className="text-xs text-danger-400 font-medium tracking-tight">
          {error}
        </p>
      ) : helperText ? (
        <p id={messageId} className="text-xs text-zinc-400 tracking-tight">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}
