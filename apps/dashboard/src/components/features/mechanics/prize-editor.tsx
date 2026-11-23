'use client';

import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

export type Prize =
  | { type: 'xp'; amount: number }
  | { type: 'currency'; currency: string; amount: number }
  | { type: 'achievement'; achievement: string }
  | { type: 'cosmetic'; cosmetic: string };

interface Option {
  key: string;
  name: string;
}

/** The things a prize or a step can name, read once per project. */
export interface DesignOptions {
  currencies: Option[];
  achievements: Option[];
  cosmetics: Option[];
  challenges: (Option & { recurrence: string | null })[];
}

const EMPTY: DesignOptions = { currencies: [], achievements: [], cosmetics: [], challenges: [] };

export function useDesignOptions(projectId: string | null): DesignOptions {
  const [options, setOptions] = useState<DesignOptions>(EMPTY);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const list = async (path: string) => {
      try {
        const res = await apiFetch(`/api/projects/${projectId}${path}`);
        if (!res.ok) return [];
        const body = await res.json();
        return (Array.isArray(body) ? body : (body.data ?? [])) as (Option & { recurrence?: string | null })[];
      } catch {
        // A feature that is turned off simply offers nothing to choose.
        return [];
      }
    };
    void Promise.all([list('/currencies'), list('/achievements?limit=100'), list('/cosmetics'), list('/challenges?limit=100')]).then(([currencies, achievements, cosmetics, challenges]) => {
      if (cancelled) return;
      setOptions({
        currencies: currencies.map(({ key, name }) => ({ key, name })),
        achievements: achievements.map(({ key, name }) => ({ key, name })),
        cosmetics: cosmetics.map(({ key, name }) => ({ key, name })),
        challenges: challenges.map(({ key, name, recurrence }) => ({ key, name, recurrence: recurrence ?? null })),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return options;
}

/** A short line for a list of prizes, such as "50 XP, 20 gems". */
export function describePrizes(prizes: Prize[] | null | undefined): string {
  if (!prizes || prizes.length === 0) return 'Nothing';
  return prizes
    .map((prize) => {
      if (prize.type === 'xp') return `${prize.amount.toLocaleString()} XP`;
      if (prize.type === 'currency') return `${prize.amount.toLocaleString()} ${prize.currency}`;
      if (prize.type === 'achievement') return `badge: ${prize.achievement}`;
      return `cosmetic: ${prize.cosmetic}`;
    })
    .join(', ');
}

const TYPES = [
  { value: 'xp', label: 'XP' },
  { value: 'currency', label: 'Currency' },
  { value: 'achievement', label: 'Badge' },
  { value: 'cosmetic', label: 'Cosmetic' },
];

interface PrizeEditorProps {
  label: string;
  value: Prize[];
  onChange: (prizes: Prize[]) => void;
  options: DesignOptions;
  /** Shown when the list is empty. */
  emptyText?: string;
}

/** Edits a list of prizes: XP, a currency, a badge or a cosmetic, each named by its key. */
export function PrizeEditor({ label, value, onChange, options, emptyText = 'No prize.' }: PrizeEditorProps) {
  const replace = (index: number, prize: Prize) => onChange(value.map((current, at) => (at === index ? prize : current)));
  const change = (index: number, type: string) => {
    if (type === 'xp') replace(index, { type: 'xp', amount: 50 });
    else if (type === 'currency') replace(index, { type: 'currency', currency: options.currencies[0]?.key ?? '', amount: 10 });
    else if (type === 'achievement') replace(index, { type: 'achievement', achievement: options.achievements[0]?.key ?? '' });
    else replace(index, { type: 'cosmetic', cosmetic: options.cosmetics[0]?.key ?? '' });
  };
  const choices = (list: { key: string; name: string }[]) => list.map((item) => ({ value: item.key, label: item.name, sublabel: item.key }));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-zinc-300 tracking-tight">{label}</span>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...value, { type: 'xp', amount: 50 }])} disabled={value.length >= 10}>
          <Plus className="h-3.5 w-3.5" />
          Add prize
        </Button>
      </div>
      {value.length === 0 && <p className="text-xs text-zinc-500">{emptyText}</p>}
      <ul className="space-y-2">
        {value.map((prize, index) => (
          <li key={index} className="flex flex-wrap items-end gap-2">
            <div className="w-32">
              <Dropdown options={TYPES} value={prize.type} onChange={(type) => change(index, type)} />
            </div>
            {(prize.type === 'xp' || prize.type === 'currency') && (
              <div className="w-28">
                <Input aria-label="Amount" type="number" min={1} value={String(prize.amount)} onChange={(e) => replace(index, { ...prize, amount: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
              </div>
            )}
            {prize.type === 'currency' && (
              <div className="min-w-36 flex-1">
                <Dropdown options={choices(options.currencies)} value={prize.currency || null} onChange={(currency) => replace(index, { ...prize, currency })} placeholder="Choose a currency" />
              </div>
            )}
            {prize.type === 'achievement' && (
              <div className="min-w-36 flex-1">
                <Dropdown options={choices(options.achievements)} value={prize.achievement || null} onChange={(achievement) => replace(index, { type: 'achievement', achievement })} placeholder="Choose a badge" />
              </div>
            )}
            {prize.type === 'cosmetic' && (
              <div className="min-w-36 flex-1">
                <Dropdown options={choices(options.cosmetics)} value={prize.cosmetic || null} onChange={(cosmetic) => replace(index, { type: 'cosmetic', cosmetic })} placeholder="Choose a cosmetic" />
              </div>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(value.filter((_, at) => at !== index))} aria-label="Remove this prize">
              <X className="h-3.5 w-3.5" />
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
