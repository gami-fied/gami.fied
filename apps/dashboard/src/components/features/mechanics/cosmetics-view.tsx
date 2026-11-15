'use client';

import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Sparkles } from 'lucide-react';
import { FieldLabel, MechanicList, numberOrNull, type MechanicConfig } from './mechanic-list';

type Kind = 'title' | 'frame' | 'item';

interface Cosmetic {
  id: string;
  key: string;
  name: string;
  description: string | null;
  kind: Kind;
  imageUrl: string | null;
  achievement: string | null;
  currency: string | null;
  cost: number | null;
  enabled: boolean;
  owners: number;
}

interface Draft {
  key: string;
  name: string;
  description: string;
  kind: Kind;
  imageUrl: string;
  achievement: string;
  currency: string;
  cost: string;
}

const KIND = { title: 'Title', frame: 'Avatar frame', item: 'Profile item' } as const;
const NONE = '__none__';

const config: MechanicConfig<Cosmetic, Draft> = {
  endpoint: '/cosmetics',
  noun: 'cosmetic',
  icon: Sparkles,
  emptyTitle: 'No cosmetics yet',
  emptyDescription: 'Make titles, avatar frames and profile items. Players unlock them with a badge, buy them with a currency, or win them as a prize, and choose which to wear.',
  dialogDescription: 'A player wears one title and one frame at a time, and any number of items.',
  toggles: true,
  deleteMessage: 'It is taken from everyone who owns it. Points spent on it are not refunded.',
  blank: () => ({ key: '', name: '', description: '', kind: 'title', imageUrl: '', achievement: '', currency: '', cost: '' }),
  toDraft: (cosmetic) => ({
    key: cosmetic.key,
    name: cosmetic.name,
    description: cosmetic.description ?? '',
    kind: cosmetic.kind,
    imageUrl: cosmetic.imageUrl ?? '',
    achievement: cosmetic.achievement ?? '',
    currency: cosmetic.currency ?? '',
    cost: cosmetic.cost === null ? '' : String(cosmetic.cost),
  }),
  toBody: (draft, editing) => ({
    ...(editing ? {} : { key: draft.key.trim() }),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    kind: draft.kind,
    imageUrl: draft.imageUrl.trim() || null,
    achievement: draft.achievement || null,
    currency: numberOrNull(draft.cost) ? draft.currency || null : null,
    cost: numberOrNull(draft.cost),
  }),
  title: (cosmetic) => cosmetic.name,
  badges: (cosmetic) => [{ label: KIND[cosmetic.kind], variant: cosmetic.kind === 'title' ? 'purple' : cosmetic.kind === 'frame' ? 'blue' : 'cyan' }],
  lines: (cosmetic) => [
    [cosmetic.achievement ? `Unlocked by the badge “${cosmetic.achievement}”` : null, cosmetic.cost ? `Sold for ${cosmetic.cost.toLocaleString()} ${cosmetic.currency ?? ''}` : null].filter(Boolean).join('. ') || 'Given as a prize or by your server only',
    `Owned by ${cosmetic.owners.toLocaleString()} ${cosmetic.owners === 1 ? 'player' : 'players'}${cosmetic.achievement ? ', not counting those with the badge who have not worn it' : ''}.`,
  ],
  form: (draft, set, options, editing) => (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name *" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Night owl" required />
        {!editing && <Input label="Key *" value={draft.key} onChange={(e) => set({ key: e.target.value })} placeholder="night_owl" helperText="Used by the API. It cannot change later." required />}
      </div>
      <Input label="Description" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel>Kind</FieldLabel>
          <Dropdown options={(Object.keys(KIND) as Kind[]).map((kind) => ({ value: kind, label: KIND[kind] }))} value={draft.kind} onChange={(kind) => set({ kind: kind as Kind })} />
        </div>
        <Input label="Picture" type="url" value={draft.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://" helperText="For a frame or an item." />
      </div>
      <div>
        <FieldLabel>Unlocked by a badge</FieldLabel>
        <Dropdown
          options={[{ value: NONE, label: 'No badge' }, ...options.achievements.map((achievement) => ({ value: achievement.key, label: achievement.name, sublabel: achievement.key }))]}
          value={draft.achievement || NONE}
          onChange={(achievement) => set({ achievement: achievement === NONE ? '' : achievement })}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Price" type="number" min={1} value={draft.cost} onChange={(e) => set({ cost: e.target.value })} helperText="Empty if it cannot be bought." />
        <div>
          <FieldLabel>Paid in</FieldLabel>
          <Dropdown options={options.currencies.map((currency) => ({ value: currency.key, label: currency.name }))} value={draft.currency || null} onChange={(currency) => set({ currency })} placeholder="Choose a currency" disabled={!draft.cost} />
        </div>
      </div>
    </>
  ),
};

export function CosmeticsView() {
  return (
    <div className="space-y-6">
      <PageHeader title="Cosmetics" description="Titles, avatar frames and profile items that players unlock, buy or win, and choose to wear. The React components show them." />
      <MechanicList config={config} />
    </div>
  );
}
