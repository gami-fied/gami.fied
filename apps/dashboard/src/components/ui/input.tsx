import React, { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, label, error, helperText, type = 'text', id, leftIcon, rightIcon, ...props },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-[13px] font-medium text-zinc-300 tracking-tight"
          >
            {label}
          </label>
        )}
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
                'w-full h-10 bg-zinc-900/70 border border-zinc-800 rounded-none px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-400 shadow-none outline-none',
                'hover:border-zinc-700 hover:bg-zinc-900/90',
                'focus:outline-none focus:border-brand-500 focus:bg-zinc-900 transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-zinc-800 disabled:hover:bg-zinc-900/70',
                leftIcon && 'pl-10',
                rightIcon && 'pr-10',
                error && 'border-danger-500/80 focus:border-danger-500 hover:border-danger-500/80',
                className
              )
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3.5 flex items-center text-zinc-400">{rightIcon}</div>
          )}
        </div>
        {error && <p className="text-xs text-danger-400 font-medium tracking-tight mt-1">{error}</p>}
        {helperText && !error && (
          <p className="text-xs text-zinc-400 tracking-tight mt-1">{helperText}</p>
        )}
      </div>
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
    const textareaId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-[13px] font-medium text-zinc-300 tracking-tight"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={rows}
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
        {error && <p className="text-xs text-danger-400 font-medium tracking-tight mt-1">{error}</p>}
        {helperText && !error && (
          <p className="text-xs text-zinc-400 tracking-tight mt-1">{helperText}</p>
        )}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';
