'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { usePermissions } from '@/hooks/use-permissions';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Flag } from 'lucide-react';

interface Settings {
  enabled: boolean;
  xpPerHour: number | null;
  eventsPerHour: number | null;
  autoHide: boolean;
}

interface FlagRow {
  id: string;
  userId: string;
  externalId: string;
  name: string | null;
  kind: 'xp_velocity' | 'event_velocity';
  observed: number;
  threshold: number;
  autoHidden: boolean;
  rankingHidden: boolean;
  createdAt: string;
}

/** Flags people who earn or send events unusually fast, for someone to review. */
export function AbuseFlagsPanel({ projectId }: { projectId: string }) {
  const toast = useToast();
  const { isAdminOrOwner } = usePermissions();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [xp, setXp] = useState('');
  const [eventsLimit, setEventsLimit] = useState('');
  const [status, setStatus] = useState('open');
  const [flags, setFlags] = useState<FlagRow[] | null>(null);
  const [saving, setSaving] = useState(false);

  const loadFlags = useCallback(async () => {
    setFlags(null);
    const res = await apiFetch(`/api/projects/${projectId}/abuse/flags?status=${status}`);
    setFlags(res.ok ? (await res.json()).data : []);
  }, [projectId, status]);

  useEffect(() => {
    apiFetch(`/api/projects/${projectId}/abuse/settings`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: Settings | null) => {
        if (!body) return;
        setSettings(body);
        setXp(body.xpPerHour ? String(body.xpPerHour) : '');
        setEventsLimit(body.eventsPerHour ? String(body.eventsPerHour) : '');
      })
      .catch(() => undefined);
  }, [projectId]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  const save = async (next: Partial<Settings>) => {
    if (!settings) return;
    const body = { ...settings, xpPerHour: xp ? Number(xp) : null, eventsPerHour: eventsLimit ? Number(eventsLimit) : null, ...next };
    setSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/abuse/settings`, { method: 'PUT', body: JSON.stringify(body) });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.message ?? 'The settings could not be saved.');
      setSettings(saved);
      toast.success('Flag settings saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const resolve = async (flag: FlagRow, action: 'dismiss' | 'confirm') => {
    const res = await apiFetch(`/api/projects/${projectId}/abuse/flags/${flag.id}`, { method: 'POST', body: JSON.stringify({ action }) });
    if (!res.ok) return toast.error('The flag could not be updated.');
    toast.success(action === 'confirm' ? 'Kept off the rankings.' : flag.autoHidden ? 'Dismissed and back on the rankings.' : 'Dismissed.');
    setFlags((current) => current?.filter((item) => item.id !== flag.id) ?? null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">When to flag</CardTitle>
          <CardDescription>Measured over the last hour, per person. A flag never blocks XP.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!settings ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <>
              <Switch checked={settings.enabled} onChange={(e) => void save({ enabled: e.target.checked })} label="Flag unusual activity" disabled={!isAdminOrOwner || saving} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="XP in an hour, over" type="number" min={1} value={xp} onChange={(e) => setXp(e.target.value)} placeholder="5000" disabled={!isAdminOrOwner} />
                <Input label="Events in an hour, over" type="number" min={1} value={eventsLimit} onChange={(e) => setEventsLimit(e.target.value)} placeholder="600" disabled={!isAdminOrOwner} />
              </div>
              <Switch checked={settings.autoHide} onChange={(e) => void save({ autoHide: e.target.checked })} label="Hide flagged people from rankings until reviewed" disabled={!isAdminOrOwner || saving} />
              {isAdminOrOwner && (
                <div className="flex justify-end">
                  <Button variant="primary" size="sm" isLoading={saving} onClick={() => void save({})}>Save thresholds</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-bold">Flags</CardTitle>
            <CardDescription>Confirm to keep someone off the rankings. Dismiss to clear it.</CardDescription>
          </div>
          <div className="w-40">
            <Dropdown options={[{ value: 'open', label: 'To review' }, { value: 'confirmed', label: 'Confirmed' }, { value: 'dismissed', label: 'Dismissed' }]} value={status} onChange={setStatus} />
          </div>
        </CardHeader>
        <CardContent>
          {!flags && <Skeleton className="h-24 w-full" />}
          {flags && flags.length === 0 && <EmptyState icon={Flag} title={status === 'open' ? 'Nothing to review' : 'None'} description="When someone passes a threshold, they show up here." />}
          <ul className="divide-y divide-zinc-800">
            <AnimatePresence initial={false}>
              {flags?.map((flag) => (
                <motion.li
                  key={flag.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.2 } }}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0">
                    <Link href={`/dashboard/users/${flag.userId}`} className="text-sm font-semibold text-zinc-100 hover:underline">{flag.name || flag.externalId}</Link>
                    <p className="text-xs text-zinc-400" title={formatDateTime(flag.createdAt)}>
                      {flag.kind === 'xp_velocity' ? `${flag.observed.toLocaleString()} XP` : `${flag.observed.toLocaleString()} events`} in an hour, over {flag.threshold.toLocaleString()} · {formatRelativeTime(flag.createdAt)}
                    </p>
                    {flag.rankingHidden && <Badge variant="zinc" className="mt-1">Hidden from rankings</Badge>}
                  </div>
                  {status === 'open' && isAdminOrOwner && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void resolve(flag, 'dismiss')}>Dismiss</Button>
                      <Button variant="secondary" size="sm" onClick={() => void resolve(flag, 'confirm')}>Confirm</Button>
                    </div>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
