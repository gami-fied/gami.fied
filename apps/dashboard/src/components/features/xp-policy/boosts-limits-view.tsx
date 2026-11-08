'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { usePermissions } from '@/hooks/use-permissions';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { AdminOnly } from '@/components/ui/admin-only';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Edit2, Gauge, Plus, Rocket, ShieldAlert, Trash2 } from 'lucide-react';

type Tab = 'boosts' | 'limits' | 'hits';

interface Boost {
  id: string;
  name: string;
  multiplier: number;
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  daysOfWeek: number[] | null;
  fromHour: number | null;
  toHour: number | null;
  timeZone: string;
  eventTypes: string[] | null;
}

interface Limit {
  id: string;
  name: string;
  kind: 'xp_cap' | 'award_cap' | 'cooldown';
  period: 'day' | 'week' | 'month' | null;
  amount: number;
  ruleId: string | null;
  eventType: string | null;
  enabled: boolean;
  hitsLastWeek: number;
  peopleLastWeek: number;
}

interface Hit {
  id: string;
  userId: string;
  externalId: string;
  name: string | null;
  rankingHidden: boolean;
  limitName: string;
  wanted: number;
  given: number;
  createdAt: string;
}

interface RuleOption {
  id: string;
  name: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const KIND_OPTIONS = [
  { value: 'xp_cap', label: 'Most XP in a period', sublabel: 'For example, 500 XP a day from rules' },
  { value: 'award_cap', label: 'Most awards in a period', sublabel: 'For example, 5 rewards a day' },
  { value: 'cooldown', label: 'Pause between awards', sublabel: 'For example, once a minute' },
];

const PERIOD_OPTIONS = [
  { value: 'day', label: 'Per day (UTC)' },
  { value: 'week', label: 'Per week (from Monday)' },
  { value: 'month', label: 'Per month' },
];

const toLocalInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 16) : '');

function describeBoost(boost: Boost): string {
  const parts: string[] = [];
  if (boost.daysOfWeek?.length) parts.push(boost.daysOfWeek.map((day) => DAYS[day]).join(', '));
  if (boost.fromHour !== null && boost.toHour !== null) parts.push(`${String(boost.fromHour).padStart(2, '0')}:00 to ${String(boost.toHour).padStart(2, '0')}:00 ${boost.timeZone}`);
  else if (boost.daysOfWeek?.length) parts.push(boost.timeZone);
  if (boost.startAt || boost.endAt) parts.push(`${boost.startAt ? formatDateTime(boost.startAt) : 'now'} until ${boost.endAt ? formatDateTime(boost.endAt) : 'further notice'}`);
  if (boost.eventTypes?.length) parts.push(`only ${boost.eventTypes.join(', ')}`);
  return parts.length > 0 ? parts.join(' · ') : 'All the time, for every rule';
}

function describeLimit(limit: Limit, rules: RuleOption[]): string {
  const scope = limit.ruleId ? `the rule “${rules.find((rule) => rule.id === limit.ruleId)?.name ?? 'removed'}”` : limit.eventType ? `rules for ${limit.eventType}` : 'all rules';
  if (limit.kind === 'cooldown') return `At most one award from ${scope} every ${limit.amount >= 3600 ? `${limit.amount / 3600} h` : limit.amount >= 60 ? `${Math.round(limit.amount / 60)} min` : `${limit.amount} s`}`;
  const per = limit.period === 'week' ? 'week' : limit.period === 'month' ? 'month' : 'day';
  return limit.kind === 'xp_cap' ? `At most ${limit.amount.toLocaleString()} XP a ${per} from ${scope}` : `At most ${limit.amount.toLocaleString()} awards a ${per} from ${scope}`;
}

export function BoostsLimitsView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdminOrOwner } = usePermissions();

  const [tab, setTab] = useState<Tab>('boosts');
  const [boosts, setBoosts] = useState<Boost[] | null>(null);
  const [limits, setLimits] = useState<Limit[] | null>(null);
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [rules, setRules] = useState<RuleOption[]>([]);
  const [error, setError] = useState(false);

  // Boost form
  const [boostOpen, setBoostOpen] = useState(false);
  const [editingBoost, setEditingBoost] = useState<Boost | null>(null);
  const [bName, setBName] = useState('');
  const [bMultiplier, setBMultiplier] = useState('2');
  const [bStart, setBStart] = useState('');
  const [bEnd, setBEnd] = useState('');
  const [bDays, setBDays] = useState<number[]>([]);
  const [bFrom, setBFrom] = useState('');
  const [bTo, setBTo] = useState('');
  const [bZone, setBZone] = useState('UTC');
  const [bEvents, setBEvents] = useState('');

  // Limit form
  const [limitOpen, setLimitOpen] = useState(false);
  const [lName, setLName] = useState('');
  const [lKind, setLKind] = useState<Limit['kind']>('xp_cap');
  const [lPeriod, setLPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [lAmount, setLAmount] = useState('500');
  const [lRule, setLRule] = useState('');
  const [lEvent, setLEvent] = useState('');

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setError(false);
    try {
      const [b, l, h, r] = await Promise.all([
        apiFetch(`/api/projects/${projectId}/boosts`),
        apiFetch(`/api/projects/${projectId}/limits`),
        apiFetch(`/api/projects/${projectId}/limits/hits?limit=50`),
        apiFetch(`/api/projects/${projectId}/rules`),
      ]);
      if (!b.ok || !l.ok || !h.ok) throw new Error('failed');
      setBoosts((await b.json()).data);
      setLimits((await l.json()).data);
      setHits((await h.json()).data);
      if (r.ok) {
        const body = await r.json();
        setRules((Array.isArray(body) ? body : (body.data ?? body.rules ?? [])).map((rule: RuleOption) => ({ id: rule.id, name: rule.name })));
      }
    } catch {
      setError(true);
    }
  }, [projectId]);

  useEffect(() => {
    setBoosts(null);
    void load();
  }, [load]);

  const ruleOptions = useMemo(() => [{ value: '', label: 'Every rule' }, ...rules.map((rule) => ({ value: rule.id, label: rule.name }))], [rules]);

  const openBoost = (boost: Boost | null) => {
    setEditingBoost(boost);
    setBName(boost?.name ?? '');
    setBMultiplier(String(boost?.multiplier ?? 2));
    setBStart(toLocalInput(boost?.startAt ?? null));
    setBEnd(toLocalInput(boost?.endAt ?? null));
    setBDays(boost?.daysOfWeek ?? []);
    setBFrom(boost?.fromHour != null ? String(boost.fromHour) : '');
    setBTo(boost?.toHour != null ? String(boost.toHour) : '');
    setBZone(boost?.timeZone ?? 'UTC');
    setBEvents(boost?.eventTypes?.join(', ') ?? '');
    setFormError(null);
    setBoostOpen(true);
  };

  const weekend = () => setBDays([5, 6]);

  const saveBoost = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        name: bName.trim(),
        multiplier: Number(bMultiplier),
        startAt: bStart ? new Date(bStart).toISOString() : null,
        endAt: bEnd ? new Date(bEnd).toISOString() : null,
        daysOfWeek: bDays.length > 0 ? bDays : null,
        fromHour: bFrom === '' ? null : Number(bFrom),
        toHour: bTo === '' ? null : Number(bTo),
        timeZone: bZone.trim() || 'UTC',
        eventTypes: bEvents.split(',').map((part) => part.trim()).filter(Boolean),
      };
      const res = await apiFetch(editingBoost ? `/api/projects/${projectId}/boosts/${editingBoost.id}` : `/api/projects/${projectId}/boosts`, {
        method: editingBoost ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The boost could not be saved.');
      toast.success(editingBoost ? 'Boost saved.' : 'Boost created.');
      setBoostOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The boost could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const openLimit = () => {
    setLName('');
    setLKind('xp_cap');
    setLPeriod('day');
    setLAmount('500');
    setLRule('');
    setLEvent('');
    setFormError(null);
    setLimitOpen(true);
  };

  const saveLimit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/limits`, {
        method: 'POST',
        body: JSON.stringify({
          name: lName.trim(),
          kind: lKind,
          period: lKind === 'cooldown' ? null : lPeriod,
          amount: Number(lAmount),
          ruleId: lRule || null,
          eventType: lEvent.trim() || null,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The limit could not be saved.');
      toast.success('Limit created.');
      setLimitOpen(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The limit could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (kind: 'boosts' | 'limits', id: string, enabled: boolean) => {
    if (!projectId) return;
    const res = await apiFetch(`/api/projects/${projectId}/${kind}/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    if (!res.ok) toast.error('The change could not be saved.');
    await load();
  };

  const remove = async (kind: 'boosts' | 'limits', id: string, name: string) => {
    if (!projectId) return;
    const ok = await confirm({ title: `Delete “${name}”?`, message: 'It stops applying straight away. XP already given is not changed.', confirmText: 'Delete', isDanger: true });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/${projectId}/${kind}/${id}`, { method: 'DELETE' });
    if (res.ok) toast.success('Deleted.');
    else toast.error('It could not be deleted.');
    await load();
  };

  const hide = async (hit: Hit) => {
    if (!projectId) return;
    const res = await apiFetch(`/api/projects/${projectId}/users/${hit.userId}/ranking`, { method: 'POST', body: JSON.stringify({ hidden: !hit.rankingHidden }) });
    if (res.ok) toast.success(hit.rankingHidden ? 'Back on the leaderboards.' : 'Hidden from the leaderboards. They can still play and earn.');
    else toast.error('The change could not be saved.');
    await load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Boosts & limits"
        description="Run promotions such as double XP weekends, and keep rule rewards from being farmed."
        actions={
          <AdminOnly>
            {tab === 'limits' ? (
              <Button variant="primary" size="sm" onClick={openLimit}>
                <Plus className="h-4 w-4" />
                New limit
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => openBoost(null)}>
                <Plus className="h-4 w-4" />
                New boost
              </Button>
            )}
          </AdminOnly>
        }
        toolbar={
          <div role="tablist" className="flex gap-1 overflow-x-auto">
            {([['boosts', 'Boosts'], ['limits', 'Limits'], ['hits', 'Blocked XP']] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`whitespace-nowrap border-b-2 px-3 py-1.5 text-sm transition-colors ${tab === id ? 'border-brand-500 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          This couldn&apos;t load. <button className="underline" onClick={() => void load()}>Try again</button>
        </div>
      )}
      {!boosts && !error && <CardSkeleton />}

      {tab === 'boosts' && boosts && (
        <>
          <p className="text-xs text-zinc-400">
            A boost multiplies the XP that rules give, and nothing else: manual adjustments, challenge rewards and tier bonuses are left alone. If several apply at once, the strongest one wins. The time of the event decides, so a late or replayed event keeps its original value.
          </p>
          {boosts.length === 0 && (
            <EmptyState icon={Rocket} title="No boosts yet" description="Create a double XP weekend, a happy hour, or a launch week promotion." action={isAdminOrOwner ? { label: 'Create a boost', onClick: () => openBoost(null) } : undefined} />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {boosts.map((boost) => (
              <Card key={boost.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-zinc-100">{boost.name}</h2>
                        <Badge variant="orange">×{boost.multiplier}</Badge>
                        <Badge variant={boost.enabled ? 'emerald' : 'zinc'}>{boost.enabled ? 'On' : 'Off'}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">{describeBoost(boost)}</p>
                    </div>
                    <AdminOnly>
                      <Switch checked={boost.enabled} onChange={(e) => void toggle('boosts', boost.id, e.target.checked)} aria-label={`${boost.name} is on`} />
                    </AdminOnly>
                  </div>
                  <AdminOnly>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openBoost(boost)} aria-label={`Edit ${boost.name}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => void remove('boosts', boost.id, boost.name)} aria-label={`Delete ${boost.name}`}><Trash2 className="h-3.5 w-3.5 text-danger-400" /></Button>
                    </div>
                  </AdminOnly>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'limits' && limits && (
        <>
          <p className="text-xs text-zinc-400">
            Limits apply to XP from rules, after any boost. A cap gives whatever room is left, then nothing. Every time one holds XP back it is recorded under Blocked XP.
          </p>
          {limits.length === 0 && (
            <EmptyState icon={Gauge} title="No limits yet" description="Cap how much XP rules can give each day, or pause between awards." action={isAdminOrOwner ? { label: 'Create a limit', onClick: openLimit } : undefined} />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {limits.map((limit) => (
              <Card key={limit.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-zinc-100">{limit.name}</h2>
                        <Badge variant={limit.enabled ? 'emerald' : 'zinc'}>{limit.enabled ? 'On' : 'Off'}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-400">{describeLimit(limit, rules)}</p>
                      <p className="mt-1 text-xs text-zinc-500">{limit.hitsLastWeek} blocked this week, from {limit.peopleLastWeek} {limit.peopleLastWeek === 1 ? 'person' : 'people'}</p>
                    </div>
                    <AdminOnly>
                      <Switch checked={limit.enabled} onChange={(e) => void toggle('limits', limit.id, e.target.checked)} aria-label={`${limit.name} is on`} />
                    </AdminOnly>
                  </div>
                  <AdminOnly>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => void remove('limits', limit.id, limit.name)} aria-label={`Delete ${limit.name}`}><Trash2 className="h-3.5 w-3.5 text-danger-400" /></Button>
                    </div>
                  </AdminOnly>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'hits' && hits && (
        <>
          <p className="text-xs text-zinc-400">
            People who keep hitting a limit may be gaming a rule. Hide someone from the leaderboards and they can carry on playing and earning without anyone, including them, knowing.
          </p>
          {hits.length === 0 ? (
            <EmptyState icon={ShieldAlert} title="Nothing blocked" description="When a limit holds XP back, it shows up here." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Limit</TableHead>
                  <TableHead>Rule wanted</TableHead>
                  <TableHead>Given</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {hits.map((hit) => (
                  <TableRow key={hit.id}>
                    <TableCell>
                      <Link href={`/dashboard/users/${hit.userId}`} className="hover:underline">{hit.name || hit.externalId}</Link>
                      {hit.rankingHidden && <Badge variant="zinc" className="ml-2">Hidden</Badge>}
                    </TableCell>
                    <TableCell className="text-xs text-zinc-300">{hit.limitName}</TableCell>
                    <TableCell className="text-xs">{hit.wanted} XP</TableCell>
                    <TableCell className="text-xs">{hit.given} XP</TableCell>
                    <TableCell className="text-xs text-zinc-400" title={formatDateTime(hit.createdAt)}>{formatRelativeTime(hit.createdAt)}</TableCell>
                    <TableCell>
                      <AdminOnly>
                        <Button variant="ghost" size="sm" onClick={() => void hide(hit)}>{hit.rankingHidden ? 'Show in rankings' : 'Hide from rankings'}</Button>
                      </AdminOnly>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <Dialog isOpen={boostOpen} onClose={() => setBoostOpen(false)} title={editingBoost ? `Edit ${editingBoost.name}` : 'New boost'} description="Multiply the XP rules give, for as long as the promotion runs.">
        <form onSubmit={saveBoost} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name *" value={bName} onChange={(e) => setBName(e.target.value)} placeholder="Double XP weekend" required />
            <Input label="Multiplier *" type="number" step="0.1" min={0.1} max={10} value={bMultiplier} onChange={(e) => setBMultiplier(e.target.value)} helperText="2 doubles the XP. 1.5 adds half again." required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Starts (optional)" type="datetime-local" value={bStart} onChange={(e) => setBStart(e.target.value)} helperText="UTC. Blank means it has started." />
            <Input label="Ends (optional)" type="datetime-local" value={bEnd} onChange={(e) => setBEnd(e.target.value)} helperText="UTC. Blank means no end." />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">Only on these days (optional)</span>
              <button type="button" className="text-xs text-brand-400 hover:underline" onClick={weekend}>Weekend</button>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {DAYS.map((day, index) => (
                <Checkbox key={day} label={day} checked={bDays.includes(index)} onChange={(e) => setBDays(e.target.checked ? [...bDays, index].sort() : bDays.filter((item) => item !== index))} />
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="From hour (optional)" type="number" min={0} max={23} value={bFrom} onChange={(e) => setBFrom(e.target.value)} />
            <Input label="Until hour" type="number" min={0} max={24} value={bTo} onChange={(e) => setBTo(e.target.value)} helperText="22 to 4 runs overnight." />
            <Input label="Time zone" value={bZone} onChange={(e) => setBZone(e.target.value)} helperText="For days and hours." />
          </div>
          <Input label="Only these events (optional)" value={bEvents} onChange={(e) => setBEvents(e.target.value)} placeholder="lesson_completed, workout_logged" helperText="Comma separated. Blank means every event." />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setBoostOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>{editingBoost ? 'Save changes' : 'Create boost'}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog isOpen={limitOpen} onClose={() => setLimitOpen(false)} title="New limit" description="Hold rule XP back once it reaches a ceiling.">
        <form onSubmit={saveLimit} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}
          <Input label="Name *" value={lName} onChange={(e) => setLName(e.target.value)} placeholder="Daily XP cap" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-300">Kind</span>
              <Dropdown options={KIND_OPTIONS} value={lKind} onChange={(value) => setLKind(value as Limit['kind'])} />
            </div>
            {lKind !== 'cooldown' && (
              <div>
                <span className="mb-1 block text-xs font-semibold text-zinc-300">Period</span>
                <Dropdown options={PERIOD_OPTIONS} value={lPeriod} onChange={(value) => setLPeriod(value as 'day' | 'week' | 'month')} />
              </div>
            )}
          </div>
          <Input
            label={lKind === 'xp_cap' ? 'Most XP *' : lKind === 'award_cap' ? 'Most awards *' : 'Seconds between awards *'}
            type="number"
            min={1}
            value={lAmount}
            onChange={(e) => setLAmount(e.target.value)}
            required
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-300">Applies to</span>
              <Dropdown options={ruleOptions} value={lRule} onChange={setLRule} />
            </div>
            <Input label="Or rules for event (optional)" value={lEvent} onChange={(e) => setLEvent(e.target.value)} placeholder="lesson_completed" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLimitOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>Create limit</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
