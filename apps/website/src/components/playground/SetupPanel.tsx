/** What a setup can award: achievements and currencies to add, and its streaks and levels. */
import { useState } from 'react';
import { Award, Coins, Flame, Plus, X } from 'lucide-react';
import { Button, Input } from '@gami/ui';
import type { PlaygroundSetup } from '../../lib/playground/simulate';

const KEY = /^[a-zA-Z0-9_-]{1,64}$/;
const keyFrom = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 64);

interface Props {
  setup: PlaygroundSetup;
  onChange: (setup: PlaygroundSetup) => void;
}

export function SetupPanel({ setup, onChange }: Props) {
  const [badgeName, setBadgeName] = useState('');
  const [currencyName, setCurrencyName] = useState('');

  const addBadge = () => {
    const key = keyFrom(badgeName);
    if (!badgeName.trim() || !KEY.test(key) || setup.achievements.some((item) => item.key === key)) return;
    onChange({ ...setup, achievements: [...setup.achievements, { id: `ach_${key}`, key, name: badgeName.trim() }] });
    setBadgeName('');
  };

  const addCurrency = () => {
    const key = keyFrom(currencyName);
    if (!currencyName.trim() || !KEY.test(key) || setup.currencies.some((item) => item.key === key)) return;
    onChange({ ...setup, currencies: [...setup.currencies, { key, name: currencyName.trim(), symbol: null }] });
    setCurrencyName('');
  };

  return (
    <div className="grid gap-6 text-sm md:grid-cols-2">
      <section aria-labelledby="setup-badges">
        <h3 id="setup-badges" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Award className="h-3.5 w-3.5 text-info-400" aria-hidden="true" /> Achievements
        </h3>
        <ul className="mt-3 space-y-1.5">
          {setup.achievements.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2 border border-zinc-800 bg-zinc-900/40 px-3 py-1.5">
              <span className="min-w-0">
                <span className="text-zinc-100">{item.name}</span> <code className="text-[11px] text-zinc-500">{item.key}</code>
              </span>
              <button
                type="button"
                className="text-zinc-500 hover:text-danger-300"
                aria-label={`Remove ${item.name}`}
                onClick={() => onChange({ ...setup, achievements: setup.achievements.filter((a) => a.key !== item.key) })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addBadge();
          }}
        >
          <Input aria-label="New achievement name" placeholder="New achievement" value={badgeName} onChange={(e) => setBadgeName(e.target.value)} />
          <Button type="submit" variant="secondary" size="sm" aria-label="Add achievement">
            <Plus className="h-4 w-4" />
          </Button>
        </form>
      </section>

      <section aria-labelledby="setup-currencies">
        <h3 id="setup-currencies" className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Coins className="h-3.5 w-3.5 text-success-400" aria-hidden="true" /> Currencies
        </h3>
        <ul className="mt-3 space-y-1.5">
          {setup.currencies.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2 border border-zinc-800 bg-zinc-900/40 px-3 py-1.5">
              <span>
                <span className="text-zinc-100">{item.name}</span> <code className="text-[11px] text-zinc-500">{item.key}</code>
              </span>
              <button
                type="button"
                className="text-zinc-500 hover:text-danger-300"
                aria-label={`Remove ${item.name}`}
                onClick={() => onChange({ ...setup, currencies: setup.currencies.filter((c) => c.key !== item.key) })}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addCurrency();
          }}
        >
          <Input aria-label="New currency name" placeholder="New currency" value={currencyName} onChange={(e) => setCurrencyName(e.target.value)} />
          <Button type="submit" variant="secondary" size="sm" aria-label="Add currency">
            <Plus className="h-4 w-4" />
          </Button>
        </form>

        <h3 className="mt-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
          <Flame className="h-3.5 w-3.5 text-brand-400" aria-hidden="true" /> Streaks and levels
        </h3>
        <ul className="mt-3 space-y-1.5 text-xs text-zinc-400">
          {setup.streaks.length === 0 && <li>No streaks in this setup.</li>}
          {setup.streaks.map((streak) => (
            <li key={streak.key}>
              <span className="text-zinc-200">{streak.name}</span>: one {streak.cadence === 'daily' ? 'day' : 'week'} counts when{' '}
              <code className="text-zinc-300">{streak.triggerEvent}</code> arrives
              {streak.freezeEvery > 0 ? `, with a freeze earned every ${streak.freezeEvery}` : ''}. Each change sends{' '}
              <code className="text-zinc-300">streak_updated</code>, which rules can use.
            </li>
          ))}
          <li>
            Levels: {setup.levels.map((level) => `${level.name} at ${Number(level.requiredXp)} XP`).join(', ')}.
          </li>
        </ul>
      </section>
    </div>
  );
}
