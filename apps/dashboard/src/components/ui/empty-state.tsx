import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';

interface EmptyStateProps {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: ReactNode;
  action?: { label: string; href: string } | { label: string; onClick: () => void };
}

const ACTION_CLASS =
  'inline-flex items-center px-3 py-2 bg-brand-500 hover:bg-brand-600 text-on-accent text-xs font-bold transition-colors';

/** What a list shows with nothing in it: what belongs here, and how to add the first one. */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="py-12 px-6 text-center max-w-md mx-auto space-y-3">
      <div className="w-10 h-10 bg-zinc-900 border border-zinc-800 text-zinc-400 flex items-center justify-center mx-auto">
        <Icon className="w-5 h-5" />
      </div>
      <h2 className="text-sm font-bold text-zinc-100">{title}</h2>
      <p className="text-xs text-zinc-400 leading-relaxed">{description}</p>
      {action &&
        ('href' in action ? (
          <Link href={action.href} className={ACTION_CLASS}>
            {action.label}
          </Link>
        ) : (
          <button onClick={action.onClick} className={ACTION_CLASS}>
            {action.label}
          </button>
        ))}
    </div>
  );
}
