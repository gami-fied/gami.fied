'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { formatTimeUntil } from '@/hooks/use-relative-time';
import { usePermissions } from '@/hooks/use-permissions';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { AdminOnly } from '@/components/ui/admin-only';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton, Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ArrowDown, ArrowUp, Edit2, Plus, Shield, Trash2 } from 'lucide-react';

interface League {
  id: string;
  key: string;
  name: string;
  tiers: string[];
  groupSize: number;
  promote: number;
  relegate: number;
  cadence: 'daily' | 'weekly';
  enabled: boolean;
  season: { startsAt: string; endsAt: string; members: number; groups: number };
}

interface Group {
  tier: number;
  tierName: string;
  groupNo: number;
  members: number;
}

interface Standing {
  rank: number;
  userId: string;
  externalId: string;
  name: string | null;
  xp: number;
  zone: 'promotion' | 'relegation' | 'safe';
}

const DEFAULT_TIERS = 'Bronze, Silver, Gold, Sapphire, Diamond';

export function LeaguesView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdminOrOwner } = usePermissions();

  const [leagues, setLeagues] = useState<League[] | null>(null);
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [openGroup, setOpenGroup] = useState<Group | null>(null);
  const [standings, setStandings] = useState<Standing[] | null>(null);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<League | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [tiers, setTiers] = useState(DEFAULT_TIERS);
  const [groupSize, setGroupSize] = useState('30');
  const [promote, setPromote] = useState('5');
  const [relegate, setRelegate] = useState('5');
  const [cadence, setCadence] = useState<'daily' | 'weekly'>('weekly');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(false);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/leagues`);
      if (!res.ok) throw new Error('failed');
      const list = (await res.json()).data as League[];
      setLeagues(list);
      setSelected((current) => current ?? list[0]?.id ?? null);
    } catch {
      setError(true);
    }
  }, [projectId]);

  useEffect(() => {
    setLeagues(null);
    setSelected(null);
    void load();
  }, [load]);

  useEffect(() => {
    if (!projectId || !selected) {
      setGroups(null);
      return;
    }
    setGroups(null);
    setOpenGroup(null);
    apiFetch(`/api/projects/${projectId}/leagues/${selected}/groups`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body: { data: Group[] }) => setGroups(body.data))
      .catch(() => setGroups([]));
  }, [projectId, selected]);

  useEffect(() => {
    if (!projectId || !selected || !openGroup) {
      setStandings(null);
      return;
    }
    setStandings(null);
    apiFetch(`/api/projects/${projectId}/leagues/${selected}/groups/${openGroup.tier}/${openGroup.groupNo}`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((body: { data: Standing[] }) => setStandings(body.data))
      .catch(() => setStandings([]));
  }, [projectId, selected, openGroup]);

  const openDialog = (league: League | null) => {
    setEditing(league);
    setName(league?.name ?? '');
    setKey(league?.key ?? '');
    setTiers(league ? league.tiers.join(', ') : DEFAULT_TIERS);
    setGroupSize(String(league?.groupSize ?? 30));
    setPromote(String(league?.promote ?? 5));
    setRelegate(String(league?.relegate ?? 5));
    setCadence(league?.cadence ?? 'weekly');
    setFormError(null);
    setOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: name.trim(),
        tiers: tiers.split(',').map((tier) => tier.trim()).filter(Boolean),
        groupSize: Number(groupSize),
        promote: Number(promote),
        relegate: Number(relegate),
        ...(editing ? {} : { key: key.trim(), cadence }),
      };
      const res = await apiFetch(editing ? `/api/projects/${projectId}/leagues/${editing.id}` : `/api/projects/${projectId}/leagues`, {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The league could not be saved.');
      toast.success(editing ? 'League saved.' : 'League created.');
      setOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The league could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (league: League, enabled: boolean) => {
    if (!projectId) return;
    const res = await apiFetch(`/api/projects/${projectId}/leagues/${league.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    if (!res.ok) toast.error('The change could not be saved.');
    await load();
  };

  const remove = async (league: League) => {
    if (!projectId) return;
    const ok = await confirm({ title: `Delete “${league.name}”?`, message: 'Every season, group and result goes with it. XP is not affected.', confirmText: 'Delete', isDanger: true });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/${projectId}/leagues/${league.id}`, { method: 'DELETE' });
    if (res.ok) toast.success('Deleted.');
    else toast.error('It could not be deleted.');
    setSelected(null);
    await load();
  };

  const current = leagues?.find((league) => league.id === selected) ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Leagues"
        description="Put players in small groups at their own level. Each season the best move up a tier and the last move down."
        actions={
          <AdminOnly>
            <Button variant="primary" size="sm" onClick={() => openDialog(null)}>
              <Plus className="h-4 w-4" />
              New league
            </Button>
          </AdminOnly>
        }
      />

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          This couldn&apos;t load. <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {!leagues && !error && <CardSkeleton />}

      {leagues && leagues.length === 0 && (
        <EmptyState icon={Shield} title="No leagues yet" description="Create a weekly league, like Bronze to Diamond, and players join it as soon as they earn XP." action={isAdminOrOwner ? { label: 'Create a league', onClick: () => openDialog(null) } : undefined} />
      )}

      {leagues && leagues.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {leagues.map((league) => (
              <Card key={league.id} className={league.id === selected ? 'border-brand-500/60' : undefined}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <button type="button" className="min-w-0 text-left" onClick={() => setSelected(league.id)}>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-zinc-100">{league.name}</h2>
                        <Badge variant={league.enabled ? 'emerald' : 'zinc'}>{league.enabled ? 'On' : 'Off'}</Badge>
                        <Badge variant="zinc">{league.cadence === 'weekly' ? 'Weekly' : 'Daily'}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">{league.tiers.join(' → ')}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        Groups of {league.groupSize}. Top {league.promote} move up, bottom {league.relegate} move down.
                      </p>
                      <p className="mt-1 text-xs text-zinc-500" title={formatDateTime(league.season.endsAt)}>
                        {league.season.members.toLocaleString()} playing in {league.season.groups} {league.season.groups === 1 ? 'group' : 'groups'}. Season ends {formatTimeUntil(league.season.endsAt)}.
                      </p>
                    </button>
                    <AdminOnly>
                      <Switch checked={league.enabled} onChange={(e) => void toggle(league, e.target.checked)} aria-label={`${league.name} is on`} />
                    </AdminOnly>
                  </div>
                  <AdminOnly>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openDialog(league)} aria-label={`Edit ${league.name}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => void remove(league)} aria-label={`Delete ${league.name}`}><Trash2 className="h-3.5 w-3.5 text-danger-400" /></Button>
                    </div>
                  </AdminOnly>
                </CardContent>
              </Card>
            ))}
          </div>

          {current && (
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">{current.name}: this season</CardTitle>
                  <CardDescription>Groups by tier, highest first.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!groups && <Skeleton className="h-24 w-full" />}
                  {groups && groups.length === 0 && <p className="text-sm text-zinc-400">Nobody has joined yet. Players join when they earn XP this season.</p>}
                  {groups && groups.length > 0 && (
                    <ul className="divide-y divide-zinc-800">
                      {groups.map((group) => (
                        <li key={`${group.tier}-${group.groupNo}`}>
                          <button
                            type="button"
                            onClick={() => setOpenGroup(group)}
                            className={`flex w-full items-center justify-between gap-2 px-2 py-2 text-left text-sm transition-colors hover:bg-zinc-900 ${openGroup?.tier === group.tier && openGroup.groupNo === group.groupNo ? 'bg-zinc-900' : ''}`}
                          >
                            <span className="text-zinc-200">{group.tierName} <span className="text-zinc-500">· group {group.groupNo}</span></span>
                            <span className="text-xs text-zinc-400">{group.members} players</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">{openGroup ? `${openGroup.tierName}, group ${openGroup.groupNo}` : 'Standings'}</CardTitle>
                  <CardDescription>XP earned this season. Ties go to whoever joined first.</CardDescription>
                </CardHeader>
                <CardContent>
                  {!openGroup && <p className="text-sm text-zinc-400">Choose a group to see its table.</p>}
                  {openGroup && !standings && <Skeleton className="h-32 w-full" />}
                  {standings && standings.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-14">Rank</TableHead>
                          <TableHead>Player</TableHead>
                          <TableHead>XP</TableHead>
                          <TableHead>Next season</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {standings.map((row) => (
                          <TableRow key={row.userId}>
                            <TableCell className="text-xs font-bold text-zinc-300">#{row.rank}</TableCell>
                            <TableCell className="text-xs"><Link href={`/dashboard/users/${row.userId}`} className="hover:underline">{row.name || row.externalId}</Link></TableCell>
                            <TableCell className="text-xs font-semibold text-brand-400">{row.xp.toLocaleString()}</TableCell>
                            <TableCell className="text-xs">
                              {row.zone === 'promotion' ? (
                                <span className="inline-flex items-center gap-1 text-success-300"><ArrowUp className="h-3 w-3" /> Moving up</span>
                              ) : row.zone === 'relegation' ? (
                                <span className="inline-flex items-center gap-1 text-danger-300"><ArrowDown className="h-3 w-3" /> Moving down</span>
                              ) : (
                                <span className="text-zinc-500">Staying</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      <Dialog isOpen={open} onClose={() => setOpen(false)} title={editing ? `Edit ${editing.name}` : 'New league'} description="Players earn XP as usual. The league only decides who they are compared with.">
        <form onSubmit={save} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name *" value={name} onChange={(e) => setName(e.target.value)} placeholder="Weekly league" required />
            {!editing && <Input label="Key *" value={key} onChange={(e) => setKey(e.target.value)} placeholder="weekly" helperText="Used by the API. It cannot change later." required />}
          </div>
          <Input label="Tiers, lowest first *" value={tiers} onChange={(e) => setTiers(e.target.value)} helperText="Comma separated. Everyone starts in the first." required />
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Group size *" type="number" min={4} max={200} value={groupSize} onChange={(e) => setGroupSize(e.target.value)} required />
            <Input label="Move up *" type="number" min={0} value={promote} onChange={(e) => setPromote(e.target.value)} helperText="From the top" required />
            <Input label="Move down *" type="number" min={0} value={relegate} onChange={(e) => setRelegate(e.target.value)} helperText="From the bottom" required />
          </div>
          {!editing && (
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-300">Season length</span>
              <Dropdown
                options={[
                  { value: 'weekly', label: 'A week', sublabel: 'Monday to Monday, UTC' },
                  { value: 'daily', label: 'A day', sublabel: 'Midnight to midnight, UTC' },
                ]}
                value={cadence}
                onChange={(value) => setCadence(value as 'daily' | 'weekly')}
              />
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>{editing ? 'Save changes' : 'Create league'}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
