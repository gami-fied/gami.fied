import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'cyan' | 'orange' | 'rose' | 'emerald';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      children,
      disabled,
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-none';

    const variants = {
      primary:
        'bg-brand-500 hover:bg-brand-400 text-on-accent focus:ring-brand-500 active:scale-[0.98]',
      secondary:
        'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/80 focus:ring-zinc-500 active:scale-[0.98]',
      outline:
        'bg-transparent hover:bg-zinc-800/60 text-zinc-200 border border-zinc-700 focus:ring-zinc-500 active:scale-[0.98]',
      ghost: 'bg-transparent hover:bg-zinc-800 text-zinc-300 hover:text-white focus:ring-zinc-500',
      danger: 'bg-danger-600 hover:bg-danger-500 text-on-accent focus:ring-danger-500 active:scale-[0.98]',
      cyan: 'bg-info-600 hover:bg-info-500 text-on-accent focus:ring-info-500 active:scale-[0.98]',
      orange: 'bg-brand-600 hover:bg-brand-500 text-on-accent focus:ring-brand-500 active:scale-[0.98]',
      rose: 'bg-danger-950/80 hover:bg-danger-900 text-danger-300 border border-danger-800 focus:ring-danger-500 active:scale-[0.98]',
      emerald: 'bg-success-950/80 hover:bg-success-900 text-success-300 border border-success-800 focus:ring-success-500 active:scale-[0.98]',
    };

    const sizes = {
      sm: 'px-2.5 py-1.5 text-xs gap-1.5',
      md: 'px-4 py-2 text-sm gap-2',
      lg: 'px-5 py-2.5 text-base gap-2.5',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={twMerge(clsx(baseStyles, variants[variant], sizes[size], className))}
        {...props}
      >
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-current shrink-0" />}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';
