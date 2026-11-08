'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { usePermissions } from '@/hooks/use-permissions';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { UserPlus } from 'lucide-react';

interface Program {
  enabled: boolean;
  qualifyingEvent: string | null;
  referrerXp: number;
  refereeXp: number;
  currencyKey: string | null;
  referrerCurrency: number;
  maxRewardsPerReferrer: number | null;
  referrals: number;
}

interface Referral {
  id: string;
  status: 'pending' | 'rewarded' | 'capped';
  createdAt: string;
  referrerId: string;
  referrerName: string | null;
  referrerExternalId: string;
  refereeId: string;
  refereeName: string | null;
  refereeExternalId: string;
}

const STATUS = { pending: ['orange', 'Waiting'], rewarded: ['emerald', 'Rewarded'], capped: ['zinc', 'Over the limit'] } as const;

export function ReferralsView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const { isAdminOrOwner } = usePermissions();

  const [program, setProgram] = useState<Program | null>(null);
  const [list, setList] = useState<Referral[] | null>(null);
  const [currencies, setCurrencies] = useState<{ value: string; label: string }[]>([]);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [when, setWhen] = useState<'signup' | 'event'>('signup');
  const [event, setEvent] = useState('');
  const [referrerXp, setReferrerXp] = useState('100');
  const [refereeXp, setRefereeXp] = useState('50');
  const [currency, setCurrency] = useState('');
  const [currencyAmount, setCurrencyAmount] = useState('0');
  const [cap, setCap] = useState('');

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(false);
    try {
      const [p, r, c] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/referral-program`),
        apiFetch(`/api/projects/${projectId}/referrals?limit=100`),
        apiFetch(`/api/projects/${projectId}/currencies`),
      ]);
      if (!p.ok || !r.ok) throw new Error('failed');
      const loaded = (await p.json()) as Program;
      setProgram(loaded);
      setList((await r.json()).data);
      if (c.ok) setCurrencies(((await c.json()).data as { key: string; name: string }[]).map((item) => ({ value: item.key, label: item.name })));
      setEnabled(loaded.enabled);
      setWhen(loaded.qualifyingEvent ? 'event' : 'signup');
      setEvent(loaded.qualifyingEvent ?? '');
      setReferrerXp(String(loaded.referrerXp));
      setRefereeXp(String(loaded.refereeXp));
      setCurrency(loaded.currencyKey ?? '');
      setCurrencyAmount(String(loaded.referrerCurrency));
      setCap(loaded.maxRewardsPerReferrer ? String(loaded.maxRewardsPerReferrer) : '');
    } catch {
      setError(true);
    }
  }, [projectId]);

  useEffect(() => {
    setProgram(null);
    void load();
  }, [load]);

  const save = async (submit: React.FormEvent) => {
    submit.preventDefault();
    if (!projectId) return;
    if (when === 'event' && !event.trim()) {
      toast.error('Name the event that makes an invite count.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/referral-program`, {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          qualifyingEvent: when === 'event' ? event.trim() : null,
          referrerXp: Number(referrerXp) || 0,
          refereeXp: Number(refereeXp) || 0,
          currencyKey: currency || null,
          referrerCurrency: currency ? Number(currencyAmount) || 0 : 0,
          maxRewardsPerReferrer: cap ? Number(cap) : null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The program could not be saved.');
      toast.success('Invite rewards saved.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The program could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Invites" description="Reward players for bringing friends, and the friends for joining." />

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          This couldn&apos;t load. <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {!program && !error && <CardSkeleton />}

      {program && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">Rewards</CardTitle>
              <CardDescription>Every player gets an invite code. A new player can use one code in their first 30 days.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={save} className="space-y-4">
                <Switch checked={enabled} onChange={(e) => setEnabled(e.target.checked)} label="Invites are on" disabled={!isAdminOrOwner} />
                <div>
                  <span className="mb-1 block text-xs font-semibold text-zinc-300">An invite counts</span>
                  <Dropdown
                    options={[
                      { value: 'signup', label: 'As soon as they join', sublabel: 'When the code is used' },
                      { value: 'event', label: 'When they do something', sublabel: 'Such as a first purchase. Harder to game.' },
                    ]}
                    value={when}
                    onChange={(value) => setWhen(value as 'signup' | 'event')}
                    disabled={!isAdminOrOwner}
                  />
                </div>
                {when === 'event' && <Input label="Event *" value={event} onChange={(e) => setEvent(e.target.value)} placeholder="first_purchase" disabled={!isAdminOrOwner} />}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="XP for the inviter" type="number" min={0} value={referrerXp} onChange={(e) => setReferrerXp(e.target.value)} disabled={!isAdminOrOwner} />
                  <Input label="XP for the new player" type="number" min={0} value={refereeXp} onChange={(e) => setRefereeXp(e.target.value)} disabled={!isAdminOrOwner} />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <span className="mb-1 block text-xs font-semibold text-zinc-300">Also give the inviter</span>
                    <Dropdown options={[{ value: '', label: 'No currency' }, ...currencies]} value={currency} onChange={setCurrency} disabled={!isAdminOrOwner} />
                  </div>
                  {currency && <Input label="Amount" type="number" min={0} value={currencyAmount} onChange={(e) => setCurrencyAmount(e.target.value)} disabled={!isAdminOrOwner} />}
                </div>
                <Input label="Most rewarded invites per player (optional)" type="number" min={1} value={cap} onChange={(e) => setCap(e.target.value)} helperText="Invites past the limit are still recorded. Only the new player is rewarded." disabled={!isAdminOrOwner} />
                {isAdminOrOwner && (
                  <div className="flex justify-end">
                    <Button type="submit" variant="primary" size="sm" isLoading={saving}>Save</Button>
                  </div>
                )}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-bold">Recent invites</CardTitle>
              <CardDescription>{program.referrals.toLocaleString()} in all. Players read their code with <code>gami.me.referral()</code>.</CardDescription>
            </CardHeader>
            <CardContent>
              {list && list.length === 0 && <EmptyState icon={UserPlus} title="No invites yet" description="When a new player joins with a code, it shows up here." />}
              {list && list.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invited by</TableHead>
                      <TableHead>New player</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="text-xs"><Link href={`/dashboard/users/${item.referrerId}`} className="hover:underline">{item.referrerName || item.referrerExternalId}</Link></TableCell>
                        <TableCell className="text-xs"><Link href={`/dashboard/users/${item.refereeId}`} className="hover:underline">{item.refereeName || item.refereeExternalId}</Link></TableCell>
                        <TableCell><Badge variant={STATUS[item.status][0]}>{STATUS[item.status][1]}</Badge></TableCell>
                        <TableCell className="text-xs text-zinc-400" title={formatDateTime(item.createdAt)}>{formatRelativeTime(item.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
