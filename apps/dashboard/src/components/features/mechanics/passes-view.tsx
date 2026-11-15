'use client';

import { localTimeZoneLabel, toDateTimeLocal } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Plus, Ticket, X } from 'lucide-react';
import { FieldLabel, MechanicList, numberOrNull, type MechanicConfig } from './mechanic-list';
import { describePrizes, PrizeEditor, type Prize } from './prize-editor';

interface Tier {
  xp: number;
  free: Prize[];
  premium: Prize[];
}

interface Pass {
  id: string;
  key: string;
  name: string;
  description: string | null;
  startAt: string;
  endAt: string;
  premiumCurrency: string | null;
  premiumCost: number | null;
  tiers: Tier[];
  enabled: boolean;
  status: 'upcoming' | 'active' | 'ended';
  players: number;
  premiumPlayers: number;
}

interface Draft {
  key: string;
  name: string;
  description: string;
  startAt: string;
  endAt: string;
  premiumCurrency: string;
  premiumCost: string;
  tiers: Tier[];
}

const day = (value: string) => new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const STATUS = { upcoming: { label: 'Not started', variant: 'blue' }, active: { label: 'Running', variant: 'emerald' }, ended: { label: 'Ended', variant: 'zinc' } } as const;

const config: MechanicConfig<Pass, Draft> = {
  endpoint: '/passes',
  noun: 'pass',
  icon: Ticket,
  emptyTitle: 'No season pass yet',
  emptyDescription: 'Make a track of rewards for a season. Players climb it with the XP they earn while it runs, and can buy a premium lane for more.',
  dialogDescription: 'Only XP earned between the start and the end counts. Rewards can be claimed for a week after the end.',
  wide: true,
  toggles: true,
  deleteMessage: 'Everyone’s progress and premium lane on it go too. Rewards already claimed stay with the players.',
  blank: () => {
    const start = new Date();
    return {
      key: '',
      name: '',
      description: '',
      startAt: toDateTimeLocal(start),
      endAt: toDateTimeLocal(new Date(start.getTime() + 30 * 86_400_000)),
      premiumCurrency: '',
      premiumCost: '',
      tiers: [
        { xp: 100, free: [{ type: 'xp', amount: 25 }], premium: [] },
        { xp: 300, free: [{ type: 'xp', amount: 50 }], premium: [] },
      ],
    };
  },
  toDraft: (pass) => ({
    key: pass.key,
    name: pass.name,
    description: pass.description ?? '',
    startAt: toDateTimeLocal(pass.startAt),
    endAt: toDateTimeLocal(pass.endAt),
    premiumCurrency: pass.premiumCurrency ?? '',
    premiumCost: pass.premiumCost === null ? '' : String(pass.premiumCost),
    tiers: pass.tiers,
  }),
  toBody: (draft, editing) => ({
    ...(editing ? {} : { key: draft.key.trim() }),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    startAt: new Date(draft.startAt).toISOString(),
    endAt: new Date(draft.endAt).toISOString(),
    premiumCurrency: numberOrNull(draft.premiumCost) ? draft.premiumCurrency || null : null,
    premiumCost: numberOrNull(draft.premiumCost),
    tiers: draft.tiers,
  }),
  title: (pass) => pass.name,
  badges: (pass) => [STATUS[pass.status]],
  lines: (pass) => [
    `${day(pass.startAt)} to ${day(pass.endAt)}`,
    `${pass.tiers.length} ${pass.tiers.length === 1 ? 'tier' : 'tiers'}, up to ${(pass.tiers[pass.tiers.length - 1]?.xp ?? 0).toLocaleString()} season XP. ${pass.premiumCost ? `Premium lane: ${pass.premiumCost.toLocaleString()} ${pass.premiumCurrency ?? ''}.` : 'Free lane only.'}`,
    `${pass.players.toLocaleString()} ${pass.players === 1 ? 'player has' : 'players have'} started it, ${pass.premiumPlayers.toLocaleString()} with the premium lane.`,
  ],
  detail: (pass) => (
    <ol className="divide-y divide-zinc-800 border border-zinc-800 text-xs">
      {pass.tiers.slice(0, 6).map((tier, index) => (
        <li key={index} className="grid grid-cols-[4.5rem_1fr_1fr] gap-3 px-3 py-2">
          <span className="font-mono text-zinc-300">{tier.xp.toLocaleString()} XP</span>
          <span className="truncate text-zinc-400">{describePrizes(tier.free)}</span>
          <span className="truncate text-warning-300">{tier.premium.length > 0 ? describePrizes(tier.premium) : ''}</span>
        </li>
      ))}
      {pass.tiers.length > 6 && <li className="px-3 py-2 text-zinc-500">and {pass.tiers.length - 6} more</li>}
    </ol>
  ),
  form: (draft, set, options, editing) => {
    const setTier = (index: number, patch: Partial<Tier>) => set({ tiers: draft.tiers.map((tier, at) => (at === index ? { ...tier, ...patch } : tier)) });
    const zone = localTimeZoneLabel();
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name *" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Season 1" required />
          {!editing && <Input label="Key *" value={draft.key} onChange={(e) => set({ key: e.target.value })} placeholder="season_1" helperText="Used by the API. It cannot change later." required />}
        </div>
        <Input label="Description" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Starts *" type="datetime-local" value={draft.startAt} onChange={(e) => set({ startAt: e.target.value })} helperText={`In ${zone}`} required />
          <Input label="Ends *" type="datetime-local" value={draft.endAt} onChange={(e) => set({ endAt: e.target.value })} helperText={`In ${zone}`} required />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Premium lane cost" type="number" min={1} value={draft.premiumCost} onChange={(e) => set({ premiumCost: e.target.value })} helperText="Empty for a pass with only a free lane." />
          <div>
            <FieldLabel>Paid in</FieldLabel>
            <Dropdown options={options.currencies.map((currency) => ({ value: currency.key, label: currency.name }))} value={draft.premiumCurrency || null} onChange={(premiumCurrency) => set({ premiumCurrency })} placeholder="Choose a currency" disabled={!draft.premiumCost} />
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <FieldLabel>Tiers, lowest first</FieldLabel>
            <Button type="button" variant="ghost" size="sm" onClick={() => set({ tiers: [...draft.tiers, { xp: (draft.tiers[draft.tiers.length - 1]?.xp ?? 0) + 200, free: [], premium: [] }] })}>
              <Plus className="h-3.5 w-3.5" />
              Add tier
            </Button>
          </div>
          <ol className="space-y-3">
            {draft.tiers.map((tier, index) => (
              <li key={index} className="space-y-3 border border-zinc-800 p-3">
                <div className="flex items-end gap-3">
                  <span className="pb-2 text-xs font-semibold text-zinc-300">Tier {index + 1}</span>
                  <div className="w-36">
                    <Input label="Season XP *" type="number" min={0} value={String(tier.xp)} onChange={(e) => setTier(index, { xp: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} required />
                  </div>
                  <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={() => set({ tiers: draft.tiers.filter((_, at) => at !== index) })} aria-label={`Remove tier ${index + 1}`} disabled={draft.tiers.length <= 1}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <PrizeEditor label="Free lane" value={tier.free} onChange={(free) => setTier(index, { free })} options={options} />
                {draft.premiumCost && <PrizeEditor label="Premium lane" value={tier.premium} onChange={(premium) => setTier(index, { premium })} options={options} />}
              </li>
            ))}
          </ol>
        </div>
      </>
    );
  },
};

export function PassesView() {
  return (
    <div className="space-y-6">
      <PageHeader title="Season pass" description="A track of rewards that players climb with the XP they earn during a season, with a free lane and an optional premium lane." />
      <MechanicList config={config} />
    </div>
  );
}
