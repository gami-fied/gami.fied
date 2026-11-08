'use client';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';

export type CriteriaMetric = 'count' | 'sum' | 'unique' | 'streak';
export type CriteriaWindow =
  | 'all_time'
  | 'last_24h'
  | 'last_7d'
  | 'last_30d'
  | 'last_90d'
  | 'calendar_day'
  | 'calendar_week'
  | 'calendar_month';

export interface StoredCriteria {
  metric: CriteriaMetric;
  event?: string;
  field?: string;
  window?: CriteriaWindow;
  streak?: string;
  target: number;
}

export interface StoredTier {
  name: string;
  target: number;
  xp?: number;
}

export interface TierDraft {
  id: string;
  name: string;
  target: string;
  xp: string;
}

export interface CriteriaDraft {
  automatic: boolean;
  metric: CriteriaMetric;
  event: string;
  field: string;
  window: CriteriaWindow;
  streak: string;
  target: string;
  tiers: TierDraft[];
}

export const EMPTY_CRITERIA: CriteriaDraft = {
  automatic: false,
  metric: 'count',
  event: '',
  field: 'payload.',
  window: 'all_time',
  streak: '',
  target: '10',
  tiers: [],
};

const METRICS = [
  { value: 'count', label: 'Number of events', sublabel: 'For example, 100 lessons finished' },
  { value: 'sum', label: 'Total of a number', sublabel: 'For example, 500 minutes studied' },
  { value: 'unique', label: 'Different values', sublabel: 'For example, 10 different courses' },
  { value: 'streak', label: 'A streak length', sublabel: 'For example, 7 days in a row' },
];

const WINDOWS = [
  { value: 'all_time', label: 'Ever' },
  { value: 'calendar_day', label: 'In one day' },
  { value: 'calendar_week', label: 'In one week' },
  { value: 'calendar_month', label: 'In one month' },
  { value: 'last_24h', label: 'In the last 24 hours' },
  { value: 'last_7d', label: 'In the last 7 days' },
  { value: 'last_30d', label: 'In the last 30 days' },
  { value: 'last_90d', label: 'In the last 90 days' },
];

let counter = 0;
const tierId = () => `tier_${Date.now()}_${counter++}`;

export function draftFromRecord(criteria: StoredCriteria | null, tiers: StoredTier[] | null): CriteriaDraft {
  if (!criteria) return EMPTY_CRITERIA;
  return {
    automatic: true,
    metric: criteria.metric,
    event: criteria.event ?? '',
    field: criteria.field ?? 'payload.',
    window: criteria.window ?? 'all_time',
    streak: criteria.streak ?? '',
    target: String(criteria.target),
    tiers: (tiers ?? []).map((tier) => ({
      id: tierId(),
      name: tier.name,
      target: String(tier.target),
      xp: tier.xp ? String(tier.xp) : '',
    })),
  };
}

/** The values to send to the API, or null when the achievement is granted by rules only. */
export function payloadFromDraft(draft: CriteriaDraft): { criteria: StoredCriteria | null; tiers: StoredTier[] | null } {
  if (!draft.automatic) return { criteria: null, tiers: null };

  const target = Number(draft.target);
  const criteria: StoredCriteria =
    draft.metric === 'streak'
      ? { metric: 'streak', streak: draft.streak.trim(), target }
      : {
          metric: draft.metric,
          event: draft.event.trim(),
          window: draft.window,
          target,
          ...(draft.metric !== 'count' ? { field: draft.field.trim() } : {}),
        };

  const tiers = draft.tiers.map((tier) => ({
    name: tier.name.trim(),
    target: Number(tier.target),
    ...(Number(tier.xp) > 0 ? { xp: Number(tier.xp) } : {}),
  }));
  return { criteria, tiers: tiers.length > 0 ? tiers : null };
}

/** A sentence a person can read, for the achievement card. */
export function describeCriteria(criteria: StoredCriteria | null): string | null {
  if (!criteria) return null;
  if (criteria.metric === 'streak') return `A ${criteria.target} in a row streak of ${criteria.streak}`;
  const when = WINDOWS.find((w) => w.value === criteria.window)?.label.toLowerCase() ?? '';
  const what =
    criteria.metric === 'count'
      ? `${criteria.target} × ${criteria.event}`
      : criteria.metric === 'sum'
        ? `${criteria.target} total ${criteria.field?.replace('payload.', '')} from ${criteria.event}`
        : `${criteria.target} different ${criteria.field?.replace('payload.', '')} in ${criteria.event}`;
  return `${what} ${when}`.trim();
}

interface Props {
  value: CriteriaDraft;
  onChange: (next: CriteriaDraft) => void;
}

export function CriteriaEditor({ value, onChange }: Props) {
  const set = (patch: Partial<CriteriaDraft>) => onChange({ ...value, ...patch });
  const setTier = (id: string, patch: Partial<TierDraft>) =>
    set({ tiers: value.tiers.map((tier) => (tier.id === id ? { ...tier, ...patch } : tier)) });

  const unit = value.metric === 'streak' ? 'days or weeks' : value.metric === 'count' ? 'events' : 'units';

  return (
    <div className="space-y-4 border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-zinc-100">Earn it automatically</div>
          <p className="text-xs text-zinc-400">
            Measure something about the user and give the badge at a target, with progress bars and optional higher
            tiers. Leave it off to award the badge from a rule or a challenge.
          </p>
        </div>
        <Switch checked={value.automatic} onChange={(e) => set({ automatic: e.target.checked })} aria-label="Earn it automatically" />
      </div>

      {value.automatic && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-300">What to measure</span>
              <Dropdown options={METRICS} value={value.metric} onChange={(val) => set({ metric: val as CriteriaMetric })} />
            </div>
            {value.metric !== 'streak' && (
              <div>
                <span className="mb-1 block text-xs font-semibold text-zinc-300">Over what period</span>
                <Dropdown options={WINDOWS} value={value.window} onChange={(val) => set({ window: val as CriteriaWindow })} />
              </div>
            )}
          </div>

          {value.metric === 'streak' ? (
            <Input
              label="Streak key"
              value={value.streak}
              onChange={(e) => set({ streak: e.target.value })}
              placeholder="daily_lesson"
              helperText="The key of a streak you created on the Streaks page."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Event"
                value={value.event}
                onChange={(e) => set({ event: e.target.value })}
                placeholder="lesson_completed"
                helperText="The event your app sends."
              />
              {value.metric !== 'count' && (
                <Input
                  label="Payload field"
                  value={value.field}
                  onChange={(e) => set({ field: e.target.value })}
                  placeholder="payload.minutes"
                  helperText="A number (for totals) or any value (for different values)."
                />
              )}
            </div>
          )}

          <Input
            label={`Target (${unit})`}
            type="number"
            min={1}
            value={value.target}
            onChange={(e) => set({ target: e.target.value })}
            helperText="Reaching this earns the badge."
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300">Higher tiers (optional)</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => set({ tiers: [...value.tiers, { id: tierId(), name: '', target: '', xp: '' }] })}
                disabled={value.tiers.length >= 9}
              >
                <Plus className="h-3.5 w-3.5" />
                Add tier
              </Button>
            </div>
            {value.tiers.length === 0 && (
              <p className="text-xs text-zinc-500">For example Silver at 50 and Gold at 100, each with bonus XP.</p>
            )}
            {value.tiers.map((tier, index) => (
              <div key={tier.id} className="grid grid-cols-[1fr_5.5rem_5.5rem_auto] items-end gap-2">
                <Input
                  label={index === 0 ? 'Name' : undefined}
                  aria-label={`Tier ${index + 2} name`}
                  value={tier.name}
                  onChange={(e) => setTier(tier.id, { name: e.target.value })}
                  placeholder="Silver"
                />
                <Input
                  label={index === 0 ? 'Target' : undefined}
                  aria-label={`Tier ${index + 2} target`}
                  type="number"
                  value={tier.target}
                  onChange={(e) => setTier(tier.id, { target: e.target.value })}
                  placeholder="50"
                />
                <Input
                  label={index === 0 ? 'Bonus XP' : undefined}
                  aria-label={`Tier ${index + 2} bonus XP`}
                  type="number"
                  value={tier.xp}
                  onChange={(e) => setTier(tier.id, { xp: e.target.value })}
                  placeholder="100"
                />
                <button
                  type="button"
                  onClick={() => set({ tiers: value.tiers.filter((item) => item.id !== tier.id) })}
                  className="p-2 text-zinc-400 transition hover:text-danger-400"
                  title="Remove tier"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
