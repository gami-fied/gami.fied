'use client';

import { apiFetch } from '@/lib/api-client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { FlaskConical } from 'lucide-react';

interface Result {
  days: number;
  eventsConsidered: number;
  truncated: boolean;
  matched: number;
  usersAffected: number;
  xpTotal: number;
  xpPerMatch: number;
  existingXp: number;
  inflationPercent: number | null;
  achievements: { key: string; count: number }[];
  byDay: { date: string; matched: number; xp: number }[];
  topUsers: { userId: string; externalId: string; name: string | null; xp: number }[];
  note: string;
}

interface Props {
  projectId: string;
  /** Returns the rule as it stands in the form, or a message saying why it can't be tested yet. */
  getRule: () => { trigger: string; conditions: unknown; actions: unknown[] } | string;
}

const WINDOWS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
];

/** Replays a rule against real past events, so you see its effect before it goes live. */
export function BacktestPanel({ projectId, getRule }: Props) {
  const [days, setDays] = useState('30');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    const rule = getRule();
    if (typeof rule === 'string') {
      setError(rule);
      setResult(null);
      return;
    }
    setRunning(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/rules/simulate`, {
        method: 'POST',
        body: JSON.stringify({ rule, days: Number(days) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? 'The test could not run.');
      setResult(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The test could not run.');
      setResult(null);
    } finally {
      setRunning(false);
    }
  };

  const peak = Math.max(1, ...(result?.byDay.map((day) => day.xp || day.matched) ?? [1]));

  return (
    <div className="space-y-3 border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <FlaskConical className="h-4 w-4 text-brand-400" />
            Test on past events
          </div>
          <p className="text-xs text-zinc-400">See who this rule would have rewarded, and how much XP it would have added, without giving anything.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-40">
            <Dropdown options={WINDOWS} value={days} onChange={setDays} />
          </div>
          <Button type="button" variant="secondary" size="sm" onClick={() => void run()} isLoading={running}>
            Run test
          </Button>
        </div>
      </div>

      {error && <div className="border border-danger-800/60 bg-danger-950/40 p-2 text-xs text-danger-300">{error}</div>}

      {result && (
        <div className="space-y-3 text-xs">
          {result.eventsConsidered === 0 ? (
            <p className="text-zinc-400">No “{`${result.days}`}-day” events of this type to test against yet.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Events looked at', result.eventsConsidered.toLocaleString()],
                  ['Would have matched', result.matched.toLocaleString()],
                  ['People rewarded', result.usersAffected.toLocaleString()],
                  ['XP it would add', result.xpTotal.toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label} className="border border-zinc-800 p-2">
                    <div className="text-zinc-400">{label}</div>
                    <div className="text-lg font-black text-zinc-100">{value}</div>
                  </div>
                ))}
              </div>

              {result.inflationPercent !== null && (
                <p className={result.inflationPercent > 100 ? 'text-warning-300' : 'text-zinc-300'}>
                  Over the same {result.days} days your rules really gave {result.existingXp.toLocaleString()} XP. This rule alone would add about {result.inflationPercent}% on top of that
                  {result.inflationPercent > 100 ? ', more than doubling it. Check the amount is what you meant.' : '.'}
                </p>
              )}
              {result.truncated && <p className="text-zinc-500">Only the first part of the period could be tested, so the real numbers will be higher.</p>}

              {result.byDay.length > 0 && (
                <div>
                  <div className="mb-1 text-zinc-400">Per day</div>
                  <div className="flex h-16 items-end gap-px" role="img" aria-label="XP the rule would add each day">
                    {result.byDay.map((day) => (
                      <div key={day.date} title={`${day.date}: ${day.matched} matches, ${day.xp} XP`} className="min-w-px flex-1 bg-brand-500" style={{ height: `${Math.max(4, ((day.xp || day.matched) / peak) * 100)}%` }} />
                    ))}
                  </div>
                </div>
              )}

              {result.achievements.length > 0 && (
                <p className="text-zinc-300">
                  Achievements it would try to award: {result.achievements.map((item) => `${item.key} (${item.count})`).join(', ')}
                </p>
              )}
              {result.topUsers.length > 0 && (
                <p className="text-zinc-400">
                  Biggest gainers: {result.topUsers.map((user) => `${user.name || user.externalId} (+${user.xp})`).join(', ')}
                </p>
              )}
              <p className="text-zinc-500">{result.note}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
