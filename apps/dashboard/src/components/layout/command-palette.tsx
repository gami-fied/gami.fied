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

/** Things people come to do, offered next to the pages. `?new=1` opens the page with its dialog ready. */
const ACTIONS: { name: string; href: string; keywords: string; adminOnly?: boolean; feature?: string }[] = [
  { name: 'Create rule', href: '/dashboard/rules?new=1', keywords: 'new add rule xp reward', adminOnly: true },
  { name: 'Create achievement', href: '/dashboard/achievements?new=1', keywords: 'new add badge', adminOnly: true, feature: 'achievements' },
  { name: 'Send test event', href: '/dashboard/events?new=1', keywords: 'try emit event playground' },
  { name: 'New API key', href: '/dashboard/api-keys?new=1', keywords: 'generate create key token', adminOnly: true },
  { name: 'Invite teammate', href: '/dashboard/organization/members?new=1', keywords: 'add member invite team colleague', adminOnly: true },
];

/** Opens with Ctrl+K or Cmd+K, or the top bar button, and finds pages, actions and users. */
export function CommandPalette() {
  const router = useRouter();
  const { selectedProject } = useDashboard();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<FoundUser[]>([]);
  const [things, setThings] = useState<Result[]>([]);
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

  // The project's rules, badges and rewards, read once each time search opens, so they can be found by name.
  useEffect(() => {
    if (!open || !selectedProject) return;
    let cancelled = false;
    const base = `/api/projects/${selectedProject.id}`;
    const list = async (path: string) => {
      const res = await apiFetch(`${base}${path}`).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as { data?: { id: string; name: string; key?: string }[] } | null) : null;
      return body?.data ?? [];
    };
    void Promise.all([list('/rules'), isOn('achievements') ? list('/achievements') : [], isOn('store') ? list('/rewards') : []]).then(([rules, achievements, rewards]) => {
      if (cancelled) return;
      setThings([
        ...rules.map((rule) => ({ id: `rule:${rule.id}`, name: rule.name, href: `/dashboard/rules?edit=${encodeURIComponent(rule.id)}`, hint: 'Rule' })),
        ...achievements.map((item) => ({ id: `achievement:${item.id}`, name: item.name, href: '/dashboard/achievements', hint: 'Achievement' })),
        ...rewards.map((item) => ({ id: `reward:${item.id}`, name: item.name, href: '/dashboard/store', hint: 'Reward' })),
      ]);
    });
    return () => {
      cancelled = true;
    };
  }, [open, selectedProject, isOn]);

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
    const actions: Result[] = ACTIONS.filter(
      (action) => (isAdminOrOwner || !action.adminOnly) && isOn(action.feature) && `${action.name} ${action.keywords}`.toLowerCase().includes(search)
    ).map((action) => ({ id: action.href, name: action.name, href: action.href, hint: 'Action' }));
    const found: Result[] = users.map((user) => ({
      id: user.id,
      name: user.name || user.externalId,
      href: `/dashboard/users?user=${encodeURIComponent(user.id)}`,
      hint: 'User',
    }));
    // With nothing typed, pages come first. Once someone types, what they can do comes first.
    const named = search.length >= 2 ? things.filter((thing) => thing.name.toLowerCase().includes(search)).slice(0, 8) : [];
    return search ? [...actions, ...pages, ...named, ...found] : [...pages, ...actions];
  }, [query, users, things, isAdminOrOwner, isPlatformAdmin, isOn]);

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
        aria-label="Search pages, actions, rules and users"
        placeholder="Search pages, actions, rules and users"
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
