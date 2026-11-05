'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useDashboard } from '../features/context/dashboard-context';

const PAGES = [
  ['Overview', '/dashboard'],
  ['Analytics', '/dashboard/analytics'],
  ['Events', '/dashboard/events'],
  ['Rules', '/dashboard/rules'],
  ['XP', '/dashboard/xp'],
  ['Achievements', '/dashboard/achievements'],
  ['Levels', '/dashboard/levels'],
  ['Leaderboard', '/dashboard/leaderboard'],
  ['Challenges', '/dashboard/challenges'],
  ['Users', '/dashboard/users'],
  ['Members', '/dashboard/organization/members'],
  ['Developer Hub', '/dashboard/developer'],
  ['API Keys', '/dashboard/api-keys'],
  ['Webhooks', '/dashboard/webhooks'],
  ['Integrations', '/dashboard/integrations'],
  ['Audit Logs', '/dashboard/audit-logs'],
  ['Settings', '/dashboard/settings'],
  ['Profile', '/dashboard/profile'],
] as const;

interface FoundUser {
  id: string;
  externalId: string;
  name: string | null;
}

/** Opens with Ctrl+K or Cmd+K, and finds pages and users. */
export function CommandPalette() {
  const router = useRouter();
  const { selectedProject } = useDashboard();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<FoundUser[]>([]);

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
      fetch(`/api/projects/${selectedProject.id}/users?search=${encodeURIComponent(search)}&limit=5`)
        .then((res) => (res.ok ? res.json() : null))
        .then((body) => setUsers(body?.users ?? body?.data ?? []))
        .catch(() => setUsers([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, selectedProject]);

  const pages = useMemo(
    () => PAGES.filter(([name]) => name.toLowerCase().includes(query.trim().toLowerCase())),
    [query]
  );

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
          if (e.key === 'Enter' && pages[0]) go(pages[0][1]);
        }}
      />
      <ul className="max-h-80 overflow-y-auto">
        {pages.map(([name, href]) => (
          <li key={href}>
            <button
              onClick={() => go(href)}
              className="w-full px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              {name}
            </button>
          </li>
        ))}
        {users.map((user) => (
          <li key={user.id}>
            <button
              onClick={() => go(`/dashboard/users?user=${encodeURIComponent(user.id)}`)}
              className="w-full px-2 py-1.5 text-left text-sm text-zinc-200 hover:bg-zinc-800"
            >
              {user.name || user.externalId}
              <span className="ml-2 text-xs text-zinc-400">User</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}
