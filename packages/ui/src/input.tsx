import React, { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef, useId } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { CONTROL_HEIGHT, CONTROL_TEXT, Field, type ControlSize } from './field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** `md` (36 px, the default) or `sm` (32 px), to match the buttons and dropdowns beside it. */
  controlSize?: ControlSize;
}

/** The rest of the props, without the key handler that the number guard already calls. */
function withoutKeyDown<T extends { onKeyDown?: unknown }>(props: T): Omit<T, 'onKeyDown'> {
  const { onKeyDown: _handled, ...rest } = props;
  void _handled;
  return rest;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, error, helperText, type = 'text', id, leftIcon, rightIcon, controlSize = 'md', ...props },
    ref
  ) => {
    // A generated ID, so two fields with the same label on one page never share one.
    const generatedId = useId();
    const inputId = id || generatedId;
    const messageId = error || helperText ? `${inputId}-message` : undefined;

    return (
      <Field label={label} htmlFor={inputId} helperText={helperText} error={error} messageId={messageId}>
        <div className="relative flex items-center w-full">
          {leftIcon && (
            <div className="absolute left-3.5 flex items-center pointer-events-none text-zinc-400">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            type={type}
            className={twMerge(
              clsx(
                'w-full bg-zinc-900/70 border border-zinc-800 rounded-none px-3.5 py-0 text-zinc-100 placeholder:text-zinc-400 shadow-none outline-none',
                'hover:border-zinc-700 hover:bg-zinc-900/90',
                'focus:outline-none focus:border-brand-500 focus:bg-zinc-900 transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-zinc-800 disabled:hover:bg-zinc-900/70',
                CONTROL_HEIGHT[controlSize],
                CONTROL_TEXT[controlSize],
                leftIcon && 'pl-10',
                rightIcon && 'pr-10',
                error && 'border-danger-500/80 focus:border-danger-500 hover:border-danger-500/80',
                className
              )
            )}
            {...withoutKeyDown(props)}
            // A field with no visible label is still named for screen readers.
            aria-label={props['aria-label'] ?? (label ? undefined : props.placeholder)}
            aria-invalid={error ? true : undefined}
            aria-describedby={messageId ?? props['aria-describedby']}
            // Scrolling the page over a number field must not change its value.
            onWheel={type === 'number' ? (event) => event.currentTarget.blur() : undefined}
            // Browsers accept "e" and "+" in a number field, and "-" even where the smallest value is 0.
            onKeyDown={
              type === 'number'
                ? (event) => {
                    const blocked = ['e', 'E', '+'].includes(event.key) || (event.key === '-' && Number(props.min) >= 0);
                    if (blocked) event.preventDefault();
                    props.onKeyDown?.(event);
                  }
                : props.onKeyDown
            }
          />
          {rightIcon && (
            <div className="absolute right-3.5 flex items-center text-zinc-400">{rightIcon}</div>
          )}
        </div>
      </Field>
    );
  }
);
Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, rows = 3, ...props }, ref) => {
    const generatedId = useId();
    const textareaId = id || generatedId;
    const messageId = error || helperText ? `${textareaId}-message` : undefined;

    return (
      <Field label={label} htmlFor={textareaId} helperText={helperText} error={error} messageId={messageId}>
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
          aria-label={label ? undefined : (props['aria-label'] ?? props.placeholder)}
          aria-invalid={error ? true : undefined}
          aria-describedby={messageId}
          className={twMerge(
            clsx(
              'w-full bg-zinc-900/70 border border-zinc-800 rounded-none px-3.5 py-2.5 text-xs text-zinc-100 placeholder:text-zinc-400 leading-relaxed shadow-none outline-none resize-y',
              'hover:border-zinc-700 hover:bg-zinc-900/90',
              'focus:outline-none focus:border-brand-500 focus:bg-zinc-900 transition-colors duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-zinc-800 disabled:hover:bg-zinc-900/70',
              error && 'border-danger-500/80 focus:border-danger-500 hover:border-danger-500/80',
              className
            )
          )}
          {...props}
        />
      </Field>
    );
  }
);
Textarea.displayName = 'Textarea';
