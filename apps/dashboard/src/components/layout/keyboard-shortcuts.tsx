'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { usePermissions } from '@/hooks/use-permissions';
import { OPEN_SEARCH_EVENT } from '@/lib/navigation';

/** `g` then one of these keys goes to the page. Pages a member cannot open are left out for them. */
const GO_TO: { key: string; name: string; href: string; adminOnly?: boolean }[] = [
  { key: 'o', name: 'Overview', href: '/dashboard' },
  { key: 'r', name: 'Rules', href: '/dashboard/rules' },
  { key: 'u', name: 'Users', href: '/dashboard/users' },
  { key: 'e', name: 'Events', href: '/dashboard/events' },
  { key: 'l', name: 'Leaderboard', href: '/dashboard/leaderboard' },
  { key: 'a', name: 'Achievements', href: '/dashboard/achievements' },
  { key: 'k', name: 'API Keys', href: '/dashboard/api-keys', adminOnly: true },
  { key: 's', name: 'Settings', href: '/dashboard/settings', adminOnly: true },
];

/** How long after `g` the second key still counts. */
const SEQUENCE_MS = 1200;

const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(element && (element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)));
};

const Key = ({ children }: { children: React.ReactNode }) => (
  <kbd className="inline-block min-w-6 border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-center font-sans text-xs text-zinc-200">{children}</kbd>
);

/** Keyboard shortcuts for getting around, with a list of them on `?`. They never fire while typing. */
export function KeyboardShortcuts() {
  const router = useRouter();
  const { isAdminOrOwner } = usePermissions();
  const [helpOpen, setHelpOpen] = useState(false);
  const waitingForPage = useRef<number | null>(null);
  const pages = GO_TO.filter((page) => isAdminOrOwner || !page.adminOnly);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      // A dialog is open: its own keys come first.
      if (document.querySelector('[role="dialog"]') && !helpOpen) return;

      if (waitingForPage.current !== null) {
        window.clearTimeout(waitingForPage.current);
        waitingForPage.current = null;
        const page = pages.find((item) => item.key === event.key.toLowerCase());
        if (page) {
          event.preventDefault();
          router.push(page.href);
        }
        return;
      }

      if (event.key === '?') {
        event.preventDefault();
        setHelpOpen((open) => !open);
      } else if (event.key === '/') {
        event.preventDefault();
        window.dispatchEvent(new Event(OPEN_SEARCH_EVENT));
      } else if (event.key === 'g') {
        waitingForPage.current = window.setTimeout(() => (waitingForPage.current = null), SEQUENCE_MS);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [router, pages, helpOpen]);

  return (
    <Dialog isOpen={helpOpen} onClose={() => setHelpOpen(false)} title="Keyboard shortcuts" maxWidth="lg">
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-sm text-zinc-300">
        <dt className="flex gap-1">
          <Key>Ctrl</Key>
          <Key>K</Key>
        </dt>
        <dd>
          Search pages, users and actions. <Key>/</Key> works too.
        </dd>
        {pages.map((page) => (
          <React.Fragment key={page.key}>
            <dt className="flex gap-1">
              <Key>g</Key>
              <Key>{page.key}</Key>
            </dt>
            <dd>Go to {page.name}</dd>
          </React.Fragment>
        ))}
        <dt>
          <Key>?</Key>
        </dt>
        <dd>Show or hide this list</dd>
        <dt>
          <Key>Esc</Key>
        </dt>
        <dd>Close a dialog</dd>
      </dl>
    </Dialog>
  );
}
