import React, { HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'emerald' | 'amber' | 'rose' | 'blue' | 'purple' | 'zinc' | 'orange';
}

export function Badge({ className, variant = 'zinc', ...props }: BadgeProps) {
  const variants = {
    emerald: 'bg-emerald-950/60 text-emerald-300 border-emerald-800/60',
    amber: 'bg-amber-950/60 text-amber-300 border-amber-800/60',
    rose: 'bg-rose-950/60 text-rose-300 border-rose-800/60',
    blue: 'bg-blue-950/60 text-blue-300 border-blue-800/60',
    purple: 'bg-purple-950/60 text-purple-300 border-purple-800/60',
    zinc: 'bg-zinc-800/80 text-zinc-300 border-zinc-700/80',
    orange: 'bg-orange-950/60 text-orange-300 border-orange-800/60',
  };

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center px-2 py-0.5 rounded-none text-[10px] font-mono font-semibold border tracking-wider uppercase select-none',
          variants[variant],
          className
        )
      )}
      {...props}
    />
  );
}
