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
    // Focusable, so a keyboard can scroll a table that is wider than the screen.
    <div tabIndex={0} role="region" aria-label="Table" className="w-full overflow-x-auto rounded-none border border-zinc-800/80">
      <table
        ref={ref}
        className={twMerge(
          clsx(
            // Sideways scrolling is fine on phones, but the first column has to stay readable.
            'w-full text-left text-sm text-zinc-300 max-sm:[&_td:first-child]:min-w-36',
            className
          )
        )}
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
        'bg-zinc-950/80 text-zinc-400 uppercase text-xs tracking-wider border-b border-zinc-800',
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
  ({ className, onClick, onKeyDown, ...props }, ref) => (
    <tr
      ref={ref}
      className={twMerge(clsx('hover:bg-zinc-800/40 transition-colors', className))}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (onClick && event.target === event.currentTarget && event.key === 'Enter') {
          event.currentTarget.click();
        }
      }}
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

interface SortableHeadProps<K extends string> extends ThHTMLAttributes<HTMLTableCellElement> {
  /** The column this header sorts by. */
  sortKey: K;
  sort: { key: K | null; direction: 'ascending' | 'descending'; toggle: (key: K) => void };
}

/**
 * A column header that sorts the table when pressed. `aria-sort` tells a screen reader which
 * column the rows are sorted by and which way.
 */
export function SortableHead<K extends string>({ sortKey, sort, children, className, ...props }: SortableHeadProps<K>) {
  const active = sort.key === sortKey;
  return (
    <th aria-sort={active ? sort.direction : 'none'} className={twMerge(clsx('px-4 py-3 font-semibold text-zinc-400', className))} {...props}>
      <button
        type="button"
        onClick={() => sort.toggle(sortKey)}
        className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-zinc-100 transition-colors"
      >
        {children}
        <span aria-hidden="true" className={active ? 'text-brand-400' : 'text-zinc-600'}>
          {active ? (sort.direction === 'ascending' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={twMerge(clsx('px-4 py-3 align-middle', className))} {...props} />
  )
);
TableCell.displayName = 'TableCell';

export interface PaginationProps {
  page: number;
  /** Rows per page. Kept for callers that pass it; the control does not need it. */
  limit?: number;
  /** For lists that only know whether another page exists. */
  hasMore?: boolean;
  /** For lists that know how many pages there are. */
  totalPages?: number;
  /** How many rows there are in all, shown when known. */
  total?: number;
  /** Stops both buttons while a page is loading. */
  disabled?: boolean;
  onPageChange: (newPage: number) => void;
}

/** The one pagination control for tables, so every list pages the same way. */
export function TablePagination({ page, onPageChange, hasMore = false, totalPages, total, disabled = false }: PaginationProps) {
  const canGoOn = totalPages !== undefined ? page < totalPages : hasMore;
  const button =
    'px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-none text-zinc-200 transition';
  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between px-4 py-3 border-t border-zinc-800 bg-zinc-950/40 text-xs text-zinc-400"
    >
      <span aria-live="polite">
        Page {page}
        {totalPages !== undefined ? ` of ${Math.max(1, totalPages)}` : ''}
        {total !== undefined ? ` · ${total.toLocaleString()} in all` : ''}
      </span>
      <div className="flex gap-2">
        <button type="button" onClick={() => onPageChange(page - 1)} disabled={disabled || page <= 1} className={button}>
          Previous
        </button>
        <button type="button" onClick={() => onPageChange(page + 1)} disabled={disabled || !canGoOn} className={button}>
          Next
        </button>
      </div>
    </nav>
  );
}
