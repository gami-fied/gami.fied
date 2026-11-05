import React, { HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'zinc' | 'orange' | 'cyan';
}

export function Badge({ className, variant = 'zinc', ...props }: BadgeProps) {
  const variants = {
    emerald: 'bg-success-950/60 text-success-300 border-success-800/60',
    amber: 'bg-warning-950/60 text-warning-300 border-warning-800/60',
    rose: 'bg-danger-950/60 text-danger-300 border-danger-800/60',
    blue: 'bg-info-950/60 text-info-300 border-info-800/60',
    purple: 'bg-info-950/60 text-info-300 border-info-800/60',
    zinc: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/80',
    orange: 'bg-brand-950/60 text-brand-300 border-brand-800/60',
    cyan: 'bg-info-950/60 text-info-300 border-info-800/60',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center px-2 py-0.5 rounded-none text-xs font-semibold border select-none',
          variants[variant],
          className
        )
      )}
      {...props}
    />
  );
}
