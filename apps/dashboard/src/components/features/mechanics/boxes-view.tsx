'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Gift, Plus, X } from 'lucide-react';
import { FieldLabel, MechanicList, numberOrNull, type MechanicConfig } from './mechanic-list';
import { describePrizes, PrizeEditor, type Prize } from './prize-editor';

interface Item {
  id?: string;
  name: string;
  weight: number;
  rare: boolean;
  prizes: Prize[];
}

interface Box {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kind: 'box' | 'wheel';
  currency: string | null;
  cost: number;
  guaranteeAfter: number | null;
  dailyLimit: number | null;
  items: Item[];
  dropTable: { id: string; name: string; rare: boolean; chance: number; prizes: Prize[] }[];
  enabled: boolean;
  opens: number;
  players: number;
}

interface Draft {
  key: string;
  name: string;
  description: string;
  kind: 'box' | 'wheel';
  currency: string;
  cost: string;
  guaranteeAfter: string;
  dailyLimit: string;
  items: Item[];
}

const chanceOf = (items: Item[], item: Item) => {
  const total = items.reduce((sum, entry) => sum + (entry.weight || 0), 0);
  return total === 0 ? 0 : Math.round(((item.weight || 0) / total) * 10_000) / 100;
};

const config: MechanicConfig<Box, Draft> = {
  endpoint: '/boxes',
  noun: 'box',
  icon: Gift,
  emptyTitle: 'No boxes yet',
  emptyDescription: 'Make a mystery box or a wheel: one try gives one item, picked by the odds you set. The odds are shown to players.',
  dialogDescription: 'Each item has a weight. Its chance is its weight over the sum of all weights, and players can see it.',
  wide: true,
  toggles: true,
  deleteMessage: 'Its history of tries goes with it. Prizes already given stay with the players.',
  blank: () => ({ key: '', name: '', description: '', kind: 'box', currency: '', cost: '0', guaranteeAfter: '', dailyLimit: '', items: [{ name: '50 XP', weight: 90, rare: false, prizes: [{ type: 'xp', amount: 50 }] }, { name: '500 XP', weight: 10, rare: true, prizes: [{ type: 'xp', amount: 500 }] }] }),
  toDraft: (box) => ({
    key: box.key,
    name: box.name,
    description: box.description ?? '',
    kind: box.kind,
    currency: box.currency ?? '',
    cost: String(box.cost),
    guaranteeAfter: box.guaranteeAfter === null ? '' : String(box.guaranteeAfter),
    dailyLimit: box.dailyLimit === null ? '' : String(box.dailyLimit),
    items: box.items,
  }),
  toBody: (draft, editing) => ({
    ...(editing ? {} : { key: draft.key.trim() }),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    kind: draft.kind,
    cost: numberOrNull(draft.cost) ?? 0,
    currency: (numberOrNull(draft.cost) ?? 0) > 0 ? draft.currency || null : null,
    guaranteeAfter: numberOrNull(draft.guaranteeAfter),
    dailyLimit: numberOrNull(draft.dailyLimit),
    items: draft.items,
  }),
  title: (box) => box.name,
  badges: (box) => [{ label: box.kind === 'wheel' ? 'Wheel' : 'Box' }],
  lines: (box) => [
    box.cost > 0 ? `${box.cost.toLocaleString()} ${box.currency ?? ''} a try` : 'Free to open',
    [box.dailyLimit ? `${box.dailyLimit} a day` : 'No daily limit', box.guaranteeAfter ? `a rare item is sure after ${box.guaranteeAfter} tries without one` : 'no guarantee'].join(', '),
    `Opened ${box.opens.toLocaleString()} times by ${box.players.toLocaleString()} ${box.players === 1 ? 'player' : 'players'}.`,
  ],
  detail: (box) => (
    <ul className="divide-y divide-zinc-800 border border-zinc-800 text-xs">
      {box.dropTable.map((item) => (
        <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <span className="min-w-0 truncate text-zinc-200">
            {item.name}
            {item.rare && <span className="ml-2 text-warning-300">rare</span>}
            <span className="ml-2 text-zinc-500">{describePrizes(item.prizes)}</span>
          </span>
          <span className="shrink-0 font-mono text-zinc-300">{item.chance}%</span>
        </li>
      ))}
    </ul>
  ),
  form: (draft, set, options, editing) => {
    const setItem = (index: number, patch: Partial<Item>) => set({ items: draft.items.map((item, at) => (at === index ? { ...item, ...patch } : item)) });
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name *" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Daily chest" required />
          {!editing && <Input label="Key *" value={draft.key} onChange={(e) => set({ key: e.target.value })} placeholder="daily_chest" helperText="Used by the API. It cannot change later." required />}
        </div>
        <Input label="Description" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-4">
          <div>
            <FieldLabel>Shown as</FieldLabel>
            <Dropdown options={[{ value: 'box', label: 'A box' }, { value: 'wheel', label: 'A wheel' }]} value={draft.kind} onChange={(kind) => set({ kind: kind as 'box' | 'wheel' })} />
          </div>
          <Input label="Cost of a try" type="number" min={0} value={draft.cost} onChange={(e) => set({ cost: e.target.value })} helperText="0 is free" />
          <div className="sm:col-span-2">
            <FieldLabel>Paid in</FieldLabel>
            <Dropdown options={options.currencies.map((currency) => ({ value: currency.key, label: currency.name }))} value={draft.currency || null} onChange={(currency) => set({ currency })} placeholder={Number(draft.cost) > 0 ? 'Choose a currency' : 'Not needed for a free box'} disabled={!(Number(draft.cost) > 0)} />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Tries a day" type="number" min={1} value={draft.dailyLimit} onChange={(e) => set({ dailyLimit: e.target.value })} helperText="Per player, in UTC. Empty for no limit." />
          <Input label="Guarantee after" type="number" min={1} value={draft.guaranteeAfter} onChange={(e) => set({ guaranteeAfter: e.target.value })} helperText="Tries with nothing rare before a rare item is sure. Empty for none." />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <FieldLabel>Items</FieldLabel>
            <Button type="button" variant="ghost" size="sm" onClick={() => set({ items: [...draft.items, { name: '', weight: 10, rare: false, prizes: [] }] })}>
              <Plus className="h-3.5 w-3.5" />
              Add item
            </Button>
          </div>
          <ul className="space-y-3">
            {draft.items.map((item, index) => (
              <li key={index} className="space-y-3 border border-zinc-800 p-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-40 flex-1">
                    <Input label="Name *" value={item.name} onChange={(e) => setItem(index, { name: e.target.value })} required />
                  </div>
                  <div className="w-24">
                    <Input label="Weight *" type="number" min={1} value={String(item.weight)} onChange={(e) => setItem(index, { weight: Math.max(0, Math.floor(Number(e.target.value) || 0)) })} required />
                  </div>
                  <span className="pb-2 font-mono text-xs text-zinc-300" title="The chance players see">
                    {chanceOf(draft.items, item)}%
                  </span>
                  <label className="flex items-center gap-2 pb-2 text-xs text-zinc-300">
                    <Checkbox checked={item.rare} onChange={(e) => setItem(index, { rare: e.target.checked })} />
                    Rare
                  </label>
                  <Button type="button" variant="ghost" size="sm" onClick={() => set({ items: draft.items.filter((_, at) => at !== index) })} aria-label={`Remove ${item.name || 'this item'}`} disabled={draft.items.length <= 1}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <PrizeEditor label="What it gives" value={item.prizes} onChange={(prizes) => setItem(index, { prizes })} options={options} emptyText="Nothing. A try can come up empty." />
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  },
};

export function BoxesView() {
  return (
    <div className="space-y-6">
      <PageHeader title="Mystery boxes" description="Random rewards with published odds. A box can be free or cost a currency, and can promise a rare item after a run of bad luck." />
      <div className="border border-warning-800/60 bg-warning-950/30 p-4 text-xs leading-relaxed text-warning-200">
        Boxes that cost a currency people can buy with real money are treated as gambling in some countries. Keep paid boxes to points that are only earned, show the odds, and check the rules where your players live.
      </div>
      <MechanicList config={config} />
    </div>
  );
}
