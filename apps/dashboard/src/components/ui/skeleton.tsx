import React, { HTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={twMerge(clsx('animate-pulse rounded-none bg-zinc-800/60', className))}
      {...props}
    />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3 p-4 bg-zinc-900/40 rounded-none border border-zinc-800">
      <Skeleton className="h-6 w-full" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-none space-y-4">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

/** Keeps the shape of the app on screen while the session loads, so a refresh never blanks it. */
export function ShellSkeleton() {
  return (
    <div className="min-h-screen bg-zinc-950 flex" aria-busy="true" aria-label="Loading">
      <div className="hidden lg:block w-64 shrink-0 border-r border-zinc-800/60 p-3 space-y-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
      <div className="flex-1 min-w-0">
        <div className="h-14 border-b border-zinc-800/60" />
        <div className="p-6 md:p-8 space-y-6">
          <Skeleton className="h-7 w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
          <TableSkeleton rows={4} />
        </div>
      </div>
    </div>
  );
}
