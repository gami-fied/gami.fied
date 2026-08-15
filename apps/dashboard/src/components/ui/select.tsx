import React, { SelectHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, children, id, ...props }, ref) => {
    const selectId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="space-y-1.5 w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-[13px] font-medium text-zinc-300 tracking-tight"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={twMerge(
              clsx(
                'w-full h-10 bg-zinc-900/70 border border-zinc-800 rounded-none px-3.5 py-2 text-sm text-zinc-100 appearance-none cursor-pointer pr-10 shadow-none outline-none',
                'hover:border-zinc-700 hover:bg-zinc-900/90',
                'focus:outline-none focus:ring-0 focus:border-orange-500 focus:bg-zinc-900 transition-colors duration-150',
                'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-zinc-800 disabled:hover:bg-zinc-900/70',
                error && 'border-rose-500/80 focus:border-rose-500 hover:border-rose-500/80',
                className
              )
            )}
            {...props}
          >
            {children}
          </select>
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-zinc-400">
            <svg className="w-4 h-4 fill-current opacity-70" viewBox="0 0 20 20">
              <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
            </svg>
          </div>
        </div>
        {error && <p className="text-xs text-rose-400 font-medium tracking-tight mt-1">{error}</p>}
        {helperText && !error && (
          <p className="text-xs text-zinc-500 tracking-tight mt-1">{helperText}</p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';
