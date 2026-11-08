'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDashboard } from '../features/context/dashboard-context';
import { usePermissions } from '@/hooks/use-permissions';
import { OPEN_SEARCH_EVENT, visibleNavGroups } from '@/lib/navigation';
import { useProjectFeatures } from '@/hooks/use-project-features';

interface FoundUser {
  id: string;
  externalId: string;
  name: string | null;
}

interface Result {
  id: string;
  name: string;
  href: string;
  hint?: string;
}

/** Opens with Ctrl+K or Cmd+K, or the top bar button, and finds pages and users. */
export function CommandPalette() {
  const router = useRouter();
  const { selectedProject } = useDashboard();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<FoundUser[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const { isAdminOrOwner, isPlatformAdmin } = usePermissions();
  const { isOn } = useProjectFeatures(selectedProject?.id);

  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_SEARCH_EVENT, show);
    return () => window.removeEventListener(OPEN_SEARCH_EVENT, show);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    const search = query.trim();
    if (!open || !selectedProject || search.length < 2) {
      setUsers([]);
      return;
    }

    const timer = setTimeout(() => {
      apiFetch(
        `/api/projects/${selectedProject.id}/users?search=${encodeURIComponent(search)}&limit=5`
      )
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => setUsers(body?.users ?? body?.data ?? []))
        .catch(() => setUsers([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, selectedProject]);

  const results = useMemo(() => {
    const search = query.trim().toLowerCase();
    const pages: Result[] = visibleNavGroups(isAdminOrOwner, isOn)
      .flatMap((group) => group.items)
      .filter((item) => `${item.name} ${item.keywords ?? ''}`.toLowerCase().includes(search))
      .map((item) => ({ id: item.href, name: item.name, href: item.href }));
    if ('profile'.includes(search)) {
      pages.push({ id: 'profile', name: 'Profile', href: '/dashboard/profile' });
    }
    if (isPlatformAdmin && 'platform admin'.includes(search)) {
      pages.push({ id: 'admin', name: 'Platform Admin', href: '/admin' });
    }
    const found: Result[] = users.map((user) => ({
      id: user.id,
      name: user.name || user.externalId,
      href: `/dashboard/users?user=${encodeURIComponent(user.id)}`,
      hint: 'User',
    }));
    return [...pages, ...found];
  }, [query, users, isAdminOrOwner, isPlatformAdmin]);

  useEffect(() => setHighlighted(0), [results]);

  const go = (href: string) => {
    setOpen(false);
    setQuery('');
    router.push(href);
  };

  return (
    <Dialog isOpen={open} onClose={() => setOpen(false)} title="Search" maxWidth="lg">
      <Input
        autoFocus
        aria-label="Search pages and users"
        placeholder="Search pages and users"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const step = e.key === 'ArrowDown' ? 1 : -1;
            setHighlighted((i) => (i + step + results.length) % Math.max(results.length, 1));
          }
          const choice = results[highlighted];
          if (e.key === 'Enter' && choice) go(choice.href);
        }}
      />
      <ul className="max-h-80 overflow-y-auto mt-2">
        {results.map((result, index) => (
          <li key={result.id}>
            <button
              onClick={() => go(result.href)}
              onMouseEnter={() => setHighlighted(index)}
              className={`w-full px-2 py-1.5 text-left text-sm text-zinc-200 ${
                index === highlighted ? 'bg-zinc-800' : ''
              }`}
            >
              {result.name}
              {result.hint && <span className="ml-2 text-xs text-zinc-400">{result.hint}</span>}
            </button>
          </li>
        ))}
        {results.length === 0 && (
          <li className="px-2 py-3 text-sm text-zinc-400">Nothing matches that search.</li>
        )}
      </ul>
    </Dialog>
  );
}
