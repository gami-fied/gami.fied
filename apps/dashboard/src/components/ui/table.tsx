import React, {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
  forwardRef,
} from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const Table = forwardRef<HTMLTableElement, TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto rounded-none border border-zinc-800/80">
      <table
        ref={ref}
        className={twMerge(clsx('w-full text-left text-sm text-zinc-300', className))}
        {...props}
      />
    </div>
  )
);
Table.displayName = 'Table';

export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={twMerge(
      clsx(
        'bg-zinc-950/80 text-zinc-400 uppercase text-[11px] font-mono tracking-wider border-b border-zinc-800',
        className
      )
    )}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = forwardRef<
  HTMLTableSectionElement,
  HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={twMerge(clsx('divide-y divide-zinc-800/60 bg-zinc-900/40', className))}
    {...props}
  />
));
TableBody.displayName = 'TableBody';

export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={twMerge(clsx('hover:bg-zinc-800/40 transition-colors', className))}
      {...props}
    />
  )
);
TableRow.displayName = 'TableRow';

export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={twMerge(clsx('px-4 py-3 font-semibold text-zinc-400', className))}
      {...props}
    />
  )
);
TableHead.displayName = 'TableHead';

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={twMerge(clsx('px-4 py-3 align-middle', className))} {...props} />
  )
);
TableCell.displayName = 'TableCell';

export interface PaginationProps {
  page: number;
  limit: number;
  hasMore?: boolean;
  onPageChange: (newPage: number) => void;
}

export function TablePagination({ page, onPageChange, hasMore = false }: PaginationProps) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 bg-zinc-950/40 text-xs font-mono text-zinc-400">
      <span>PAGE {page}</span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-none text-zinc-200 transition"
        >
          Previous
        </button>
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={!hasMore}
          className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-none text-zinc-200 transition"
        >
          Next
        </button>
      </div>
    </div>
  );
}
