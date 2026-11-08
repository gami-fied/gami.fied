'use client';

import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import type { ChallengeFilter, ChallengeStep } from '@gami/challenges';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';

export interface ConditionDraft {
  id: string;
  field: string;
  operator: string;
  value: string;
}

export interface StepDraft {
  id: string;
  name: string;
  event: string;
  conditions: ConditionDraft[];
}

let counter = 0;
const newId = (prefix: string) => `${prefix}_${Date.now()}_${counter++}`;

export const emptyCondition = (): ConditionDraft => ({ id: newId('cond'), field: 'payload.', operator: 'equals', value: '' });
export const emptyStep = (): StepDraft => ({ id: newId('step'), name: '', event: '', conditions: [] });

const OPERATORS = [
  { value: 'equals', label: 'is' },
  { value: 'not_equals', label: 'is not' },
  { value: 'greater_than', label: 'is more than' },
  { value: 'greater_than_or_equal', label: 'is at least' },
  { value: 'less_than', label: 'is less than' },
  { value: 'less_than_or_equal', label: 'is at most' },
  { value: 'contains', label: 'contains' },
  { value: 'in', label: 'is one of (comma list)' },
  { value: 'exists', label: 'is present' },
];

const NUMERIC = new Set(['greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal']);

function parseValue(operator: string, raw: string): unknown {
  if (operator === 'in') return raw.split(',').map((part) => part.trim()).filter(Boolean);
  if (NUMERIC.has(operator)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw.trim() !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  return raw;
}

export function conditionsToFilters(conditions: ConditionDraft[]): ChallengeFilter[] | null {
  const filters = conditions
    .filter((condition) => condition.field.trim() && condition.field.trim() !== 'payload.')
    .map((condition): ChallengeFilter => ({
      field: condition.field.trim(),
      operator: condition.operator,
      ...(condition.operator === 'exists' ? {} : { value: parseValue(condition.operator, condition.value) }),
    }));
  return filters.length > 0 ? filters : null;
}

export function filtersToConditions(filters: ChallengeFilter[] | null | undefined): ConditionDraft[] {
  return (filters ?? []).map((filter) => ({
    id: newId('cond'),
    field: filter.field,
    operator: filter.operator,
    value: Array.isArray(filter.value) ? filter.value.join(', ') : filter.value === undefined ? '' : String(filter.value),
  }));
}

export function stepsToApi(steps: StepDraft[]): ChallengeStep[] {
  return steps.map((step) => {
    const filters = conditionsToFilters(step.conditions);
    return { name: step.name.trim(), event: step.event.trim(), ...(filters ? { filters } : {}) };
  });
}

export function apiToSteps(steps: ChallengeStep[] | null | undefined): StepDraft[] {
  return (steps ?? []).map((step) => ({
    id: newId('step'),
    name: step.name,
    event: step.event,
    conditions: filtersToConditions(step.filters),
  }));
}

interface ConditionRowsProps {
  conditions: ConditionDraft[];
  onChange: (next: ConditionDraft[]) => void;
  addLabel: string;
  emptyHint?: string;
}

/** A short list of "field / is / value" rows, for choosing which events count. */
export function ConditionRows({ conditions, onChange, addLabel, emptyHint }: ConditionRowsProps) {
  const update = (id: string, patch: Partial<ConditionDraft>) =>
    onChange(conditions.map((condition) => (condition.id === id ? { ...condition, ...patch } : condition)));

  return (
    <div className="space-y-2">
      {conditions.length === 0 && emptyHint && <p className="text-xs text-zinc-500">{emptyHint}</p>}
      {conditions.map((condition) => (
        <div key={condition.id} className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[1fr_11rem_1fr_auto]">
          <Input
            aria-label="Payload field"
            value={condition.field}
            onChange={(e) => update(condition.id, { field: e.target.value })}
            placeholder="payload.score"
          />
          <Dropdown options={OPERATORS} value={condition.operator} onChange={(val) => update(condition.id, { operator: val })} />
          {condition.operator === 'exists' ? (
            <div />
          ) : (
            <Input
              aria-label="Value"
              value={condition.value}
              onChange={(e) => update(condition.id, { value: e.target.value })}
              placeholder="80"
            />
          )}
          <button
            type="button"
            onClick={() => onChange(conditions.filter((item) => item.id !== condition.id))}
            className="p-2 text-zinc-400 transition hover:text-danger-400"
            title="Remove condition"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...conditions, emptyCondition()])}>
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

interface StepRowsProps {
  steps: StepDraft[];
  onChange: (next: StepDraft[]) => void;
}

/** The ordered steps of a steps challenge. */
export function StepRows({ steps, onChange }: StepRowsProps) {
  const update = (id: string, patch: Partial<StepDraft>) =>
    onChange(steps.map((step) => (step.id === id ? { ...step, ...patch } : step)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[index], next[target]] = [next[target]!, next[index]!];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {steps.map((step, index) => (
        <div key={step.id} className="space-y-2 border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-brand-500 text-xs font-bold text-on-accent">
              {index + 1}
            </span>
            <Input
              aria-label={`Step ${index + 1} name`}
              value={step.name}
              onChange={(e) => update(step.id, { name: e.target.value })}
              placeholder="Add a profile photo"
            />
            <Input
              aria-label={`Step ${index + 1} event`}
              value={step.event}
              onChange={(e) => update(step.id, { event: e.target.value })}
              placeholder="photo_added"
            />
            <div className="flex shrink-0">
              <button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="p-1.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30" title="Move up">
                <ArrowUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => move(index, 1)} disabled={index === steps.length - 1} className="p-1.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30" title="Move down">
                <ArrowDown className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onChange(steps.filter((item) => item.id !== step.id))}
                disabled={steps.length <= 2}
                className="p-1.5 text-zinc-400 hover:text-danger-400 disabled:opacity-30"
                title="Remove step"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
          <ConditionRows
            conditions={step.conditions}
            onChange={(conditions) => update(step.id, { conditions })}
            addLabel="Only if…"
          />
        </div>
      ))}
      <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...steps, emptyStep()])} disabled={steps.length >= 10}>
        <Plus className="h-4 w-4" />
        Add step
      </Button>
    </div>
  );
}
