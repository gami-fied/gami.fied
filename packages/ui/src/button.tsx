import React, { ButtonHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Loader2 } from 'lucide-react';
import { CONTROL_HEIGHT } from './field';

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
      'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed select-none rounded-none';

    const variants = {
      primary:
        'bg-brand-500 hover:bg-brand-600 text-on-accent active:scale-[0.98]',
      secondary:
        'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border border-zinc-700/80 active:scale-[0.98]',
      outline:
        'bg-transparent hover:bg-zinc-800/60 text-zinc-200 border border-zinc-700 active:scale-[0.98]',
      ghost: 'bg-transparent hover:bg-zinc-800 text-zinc-300 hover:text-white',
      danger: 'bg-danger-600 hover:bg-danger-500 text-on-accent active:scale-[0.98]',
      cyan: 'bg-info-600 hover:bg-info-500 text-on-accent active:scale-[0.98]',
      orange: 'bg-brand-600 hover:bg-brand-500 text-on-accent active:scale-[0.98]',
      rose: 'bg-danger-950/80 hover:bg-danger-900 text-danger-300 border border-danger-800 active:scale-[0.98]',
      emerald: 'bg-success-950/80 hover:bg-success-900 text-success-300 border border-success-800 active:scale-[0.98]',
    };

    // Fixed heights, the same as inputs and dropdowns of that size (CONTROL_HEIGHT), so a
    // button lines up with the fields beside it whether or not it has a border.
    const sizes = {
      sm: `${CONTROL_HEIGHT.sm} px-2.5 text-xs gap-1.5`,
      md: `${CONTROL_HEIGHT.md} px-4 text-sm gap-2`,
      lg: 'h-10 px-5 text-base gap-2.5',
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

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** What the button does. It names the button for screen readers and shows as a tooltip. */
  label: string;
  size?: 'sm' | 'md';
  /** `danger` turns red on hover, for remove and delete. */
  tone?: 'default' | 'danger';
}

/**
 * A square button holding only an icon, as tall as the inputs, dropdowns and buttons of the same
 * size, so it lines up with them on a row.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, size = 'md', tone = 'default', className, type = 'button', title, children, ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={twMerge(
        clsx(
          'inline-grid shrink-0 place-items-center rounded-none text-zinc-400 transition-colors disabled:cursor-not-allowed disabled:opacity-30',
          CONTROL_HEIGHT[size],
          size === 'sm' ? 'w-8' : 'w-9',
          tone === 'danger' ? 'hover:bg-danger-950/40 hover:text-danger-400' : 'hover:bg-zinc-800 hover:text-zinc-200',
          className
        )
      )}
      {...props}
    >
      {children}
    </button>
  )
);

IconButton.displayName = 'IconButton';
