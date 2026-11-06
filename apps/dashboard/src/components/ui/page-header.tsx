import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Buttons. The first keeps its label on phones, and the rest shrink to their icons. */
  actions?: ReactNode;
  /** Tabs and filters. They scroll sideways on phones rather than wrapping. */
  toolbar?: ReactNode;
}

/** The top of every page, so each one lines up the same way at every screen size. */
export function PageHeader({ title, description, actions, toolbar }: PageHeaderProps) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 sm:items-start">
        <h1 className="truncate text-lg font-bold tracking-tight text-zinc-100 sm:text-xl">
          {title}
        </h1>
        {actions && (
          <div className="page-actions flex items-center gap-2 sm:row-span-2">{actions}</div>
        )}
        {description && (
          <p className="col-span-2 mt-0.5 text-xs text-zinc-400 sm:col-span-1 sm:col-start-1 sm:text-sm">
            {description}
          </p>
        )}
      </div>
      {toolbar && <div className="page-toolbar flex items-center gap-3">{toolbar}</div>}
    </div>
  );
}
