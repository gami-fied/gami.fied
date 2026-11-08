'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dropdown } from '@/components/ui/dropdown';
import { Plus, Trash2, Layers } from 'lucide-react';
import {
  buildTotalCondition,
  type AggregateCondition,
  type AggregateMetric,
  type AggregateWindow,
} from './total-condition';

export { buildTotalCondition, parseTotalCondition } from './total-condition';
export type { AggregateCondition, AggregateMetric, AggregateWindow } from './total-condition';

export type Operator =
  | 'equals'
  | 'not_equals'
  | 'exists'
  | 'not_exists'
  | 'greater_than'
  | 'greater_than_or_equal'
  | 'less_than'
  | 'less_than_or_equal'
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  | 'in'
  | 'not_in';

export interface SimpleCondition {
  field: string;
  operator: Operator;
  value?: unknown;
}

export interface ConditionGroup {
  all?: Condition[];
  any?: Condition[];
  not?: Condition;
}

export type Condition = SimpleCondition | AggregateCondition | ConditionGroup;

export interface VisualCondition {
  id: string;
  field: string;
  operator: Operator;
  value: string;
  /** `total` looks back over the user's past events instead of reading this event. */
  kind?: 'field' | 'total';
  metric?: AggregateMetric;
  /** Event type to total. Empty means the rule's own trigger. */
  totalEvent?: string;
  window?: AggregateWindow;
  /** Match only on the event that reaches the number, so a rule fires once per window. */
  crossing?: boolean;
}

export const METRIC_OPTIONS: { value: AggregateMetric; label: string; sublabel: string }[] = [
  { value: 'sum', label: 'Total of', sublabel: 'Adds up a number from each event' },
  { value: 'count', label: 'Number of events', sublabel: 'Counts the events' },
  { value: 'unique', label: 'Different values of', sublabel: 'Counts distinct values' },
];

export const WINDOW_OPTIONS: { value: AggregateWindow; label: string; sublabel?: string }[] = [
  { value: 'calendar_day', label: 'Today', sublabel: 'Since midnight UTC' },
  { value: 'calendar_week', label: 'This week', sublabel: 'Since Monday, UTC' },
  { value: 'calendar_month', label: 'This month', sublabel: 'Since the 1st, UTC' },
  { value: 'last_24h', label: 'Last 24 hours' },
  { value: 'last_7d', label: 'Last 7 days' },
  { value: 'last_30d', label: 'Last 30 days' },
  { value: 'last_90d', label: 'Last 90 days' },
  { value: 'all_time', label: 'All time' },
];

const NUMBER_OPERATORS = OPERATOR_OPTIONS_FOR_TOTALS();

function OPERATOR_OPTIONS_FOR_TOTALS() {
  return [
    { value: 'greater_than_or_equal' as Operator, label: 'Reaches (≥)' },
    { value: 'greater_than' as Operator, label: 'Goes over (>)' },
    { value: 'equals' as Operator, label: 'Equals exactly (=)' },
    { value: 'less_than' as Operator, label: 'Is below (<)' },
    { value: 'less_than_or_equal' as Operator, label: 'Is at most (≤)' },
    { value: 'not_equals' as Operator, label: 'Is not (≠)' },
  ];
}

export const OPERATOR_OPTIONS: { value: Operator; label: string; sublabel?: string }[] = [
  { value: 'equals', label: 'Equals (=)', sublabel: 'Exact string or number match' },
  { value: 'not_equals', label: 'Does Not Equal (≠)', sublabel: 'Value differs' },
  { value: 'exists', label: 'Exists', sublabel: 'Field is present and non-null' },
  { value: 'not_exists', label: 'Does Not Exist', sublabel: 'Field is missing or null' },
  { value: 'greater_than', label: 'Greater Than (>)', sublabel: 'Numeric comparison' },
  {
    value: 'greater_than_or_equal',
    label: 'Greater Than or Equal (≥)',
    sublabel: 'Numeric comparison',
  },
  { value: 'less_than', label: 'Less Than (<)', sublabel: 'Numeric comparison' },
  { value: 'less_than_or_equal', label: 'Less Than or Equal (≤)', sublabel: 'Numeric comparison' },
  { value: 'contains', label: 'Contains', sublabel: 'Sub-string or array item match' },
  { value: 'starts_with', label: 'Starts With', sublabel: 'String prefix match' },
  { value: 'ends_with', label: 'Ends With', sublabel: 'String suffix match' },
  { value: 'in', label: 'Is In (List)', sublabel: 'Comma-separated values' },
  { value: 'not_in', label: 'Is Not In (List)', sublabel: 'Comma-separated values' },
];

export interface VisualConditionBuilderProps {
  matchMode: 'all' | 'any';
  onMatchModeChange: (mode: 'all' | 'any') => void;
  conditions: VisualCondition[];
  onChange: (conditions: VisualCondition[]) => void;
}

export function VisualConditionBuilder({
  matchMode,
  onMatchModeChange,
  conditions,
  onChange,
}: VisualConditionBuilderProps) {
  const handleAddCondition = () => {
    const newCond: VisualCondition = {
      id: `cond_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      field: 'payload.',
      operator: 'equals',
      value: '',
    };
    onChange([...conditions, newCond]);
  };

  const handleAddTotal = () => {
    onChange([
      ...conditions,
      {
        id: `cond_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        kind: 'total',
        field: 'payload.amount',
        operator: 'greater_than_or_equal',
        value: '100',
        metric: 'sum',
        totalEvent: '',
        window: 'calendar_month',
        crossing: true,
      },
    ]);
  };

  const handleRemoveCondition = (id: string) => {
    onChange(conditions.filter((c) => c.id !== id));
  };

  const handleUpdateCondition = (id: string, patch: Partial<VisualCondition>) => {
    onChange(conditions.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  return (
    <div className="space-y-4 bg-zinc-950/60 p-4 rounded-none border border-zinc-800">
      {/* Match Mode Selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-brand-400" />
          <span className="text-xs font-semibold text-zinc-200">Condition Match Rule</span>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-none flex gap-1">
          <button
            type="button"
            onClick={() => onMatchModeChange('all')}
            className={`px-3 py-1 text-xs font-semibold rounded-none transition ${
              matchMode === 'all'
                ? 'bg-brand-500 text-on-accent shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Match ALL (AND)
          </button>
          <button
            type="button"
            onClick={() => onMatchModeChange('any')}
            className={`px-3 py-1 text-xs font-semibold rounded-none transition ${
              matchMode === 'any'
                ? 'bg-brand-500 text-on-accent shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Match ANY (OR)
          </button>
        </div>
      </div>

      {/* Condition Rows */}
      <div className="space-y-3">
        {conditions.map((cond, idx) => {
          const noValueNeeded = cond.operator === 'exists' || cond.operator === 'not_exists';

          if (cond.kind === 'total') {
            const needsField = cond.metric !== 'count';
            return (
              <div key={cond.id} className="space-y-2 rounded-none border border-zinc-800 bg-zinc-900/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-zinc-400">
                    {idx === 0 ? 'IF' : matchMode.toUpperCase()} · TOTAL OVER PAST EVENTS
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCondition(cond.id)}
                    className="shrink-0 p-1.5 text-zinc-400 transition hover:bg-danger-950/40 hover:text-danger-400"
                    title="Remove condition"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Dropdown
                    options={METRIC_OPTIONS}
                    value={cond.metric ?? 'sum'}
                    onChange={(val) => handleUpdateCondition(cond.id, { metric: val as AggregateMetric })}
                  />
                  {needsField ? (
                    <Input
                      placeholder="payload.amount"
                      value={cond.field}
                      onChange={(e) => handleUpdateCondition(cond.id, { field: e.target.value })}
                      aria-label="Payload field to total"
                    />
                  ) : (
                    <div className="self-center text-xs text-zinc-400">of this user&apos;s events</div>
                  )}
                  <Input
                    placeholder="Event type (blank = this rule's trigger)"
                    value={cond.totalEvent ?? ''}
                    onChange={(e) => handleUpdateCondition(cond.id, { totalEvent: e.target.value })}
                    aria-label="Event type to total"
                  />
                  <Dropdown
                    options={WINDOW_OPTIONS}
                    value={cond.window ?? 'calendar_month'}
                    onChange={(val) => handleUpdateCondition(cond.id, { window: val as AggregateWindow })}
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[12rem_1fr]">
                  <Dropdown
                    options={NUMBER_OPERATORS}
                    value={cond.operator}
                    onChange={(val) => handleUpdateCondition(cond.id, { operator: val as Operator })}
                  />
                  <Input
                    type="number"
                    placeholder="e.g. 100"
                    value={cond.value}
                    onChange={(e) => handleUpdateCondition(cond.id, { value: e.target.value })}
                    aria-label="Number to compare with"
                  />
                </div>
                <label className="flex cursor-pointer items-start gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={cond.crossing !== false}
                    onChange={(e) => handleUpdateCondition(cond.id, { crossing: e.target.checked })}
                    className="mt-0.5"
                  />
                  <span>
                    Only on the event that gets there. Turn this off to match on every event while it is true, which
                    would give the reward again each time.
                  </span>
                </label>
              </div>
            );
          }

          return (
            <div
              key={cond.id}
              className="p-3 bg-zinc-900/80 rounded-none border border-zinc-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2"
            >
              <div className="text-[11px] font-bold text-zinc-400 w-6 shrink-0 text-center">
                {idx === 0 ? 'IF' : matchMode.toUpperCase()}
              </div>

              {/* Field Input */}
              <div className="flex-1 min-w-[140px]">
                <Input
                  placeholder="e.g. payload.plan or userId"
                  value={cond.field}
                  onChange={(e) => handleUpdateCondition(cond.id, { field: e.target.value })}
                />
              </div>

              {/* Operator Select */}
              <div className="w-48 shrink-0">
                <Dropdown
                  options={OPERATOR_OPTIONS}
                  value={cond.operator}
                  onChange={(val) => handleUpdateCondition(cond.id, { operator: val as Operator })}
                />
              </div>

              {/* Value Input */}
              {!noValueNeeded && (
                <div className="flex-1 min-w-[140px]">
                  <Input
                    placeholder={
                      ['in', 'not_in'].includes(cond.operator)
                        ? 'e.g. pro, enterprise'
                        : 'Comparison value...'
                    }
                    value={cond.value}
                    onChange={(e) => handleUpdateCondition(cond.id, { value: e.target.value })}
                  />
                </div>
              )}

              {/* Delete Button */}
              <button
                type="button"
                onClick={() => handleRemoveCondition(cond.id)}
                className="p-2 text-zinc-400 hover:text-danger-400 hover:bg-danger-950/40 rounded-none transition shrink-0 self-center"
                title="Remove Condition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          );
        })}

        {conditions.length === 0 && (
          <div className="py-4 text-center text-xs text-zinc-400 border border-dashed border-zinc-800/80 rounded-none">
            No conditions added. This rule will match all events with trigger &quot;{matchMode}
            &quot;.
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="button" variant="secondary" size="sm" onClick={handleAddCondition}>
          <Plus className="w-4 h-4" />
          Add Condition Filter
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={handleAddTotal}>
          <Plus className="w-4 h-4" />
          Add total over time
        </Button>
      </div>
    </div>
  );
}

/** Helper utility to convert visual condition state to Rules Engine Condition Object */
export function buildRulesEngineConditions(
  matchMode: 'all' | 'any',
  conditions: VisualCondition[]
): ConditionGroup | null {
  if (conditions.length === 0) return null;

  const simpleConditions: Condition[] = conditions.map((c): Condition => {
    if (c.kind === 'total') return buildTotalCondition(c);
    let typedValue: unknown = c.value;
    if (['in', 'not_in'].includes(c.operator) && typeof c.value === 'string') {
      typedValue = c.value
        .split(',')
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (
      ['greater_than', 'greater_than_or_equal', 'less_than', 'less_than_or_equal'].includes(
        c.operator
      )
    ) {
      const num = Number(c.value);
      if (!isNaN(num)) typedValue = num;
    } else if (c.value === 'true') {
      typedValue = true;
    } else if (c.value === 'false') {
      typedValue = false;
    }

    const simple: SimpleCondition = {
      field: c.field.trim(),
      operator: c.operator,
    };

    if (c.operator !== 'exists' && c.operator !== 'not_exists') {
      simple.value = typedValue;
    }

    return simple;
  });

  return matchMode === 'all' ? { all: simpleConditions } : { any: simpleConditions };
}

/** Helper utility to parse Rules Engine Condition Object back into VisualCondition state */
export function parseRulesEngineConditions(
  condObj: ConditionGroup | SimpleCondition | null | undefined
): {
  matchMode: 'all' | 'any';
  conditions: VisualCondition[];
} {
  if (!condObj) return { matchMode: 'all', conditions: [] };

  const result: VisualCondition[] = [];
  let mode: 'all' | 'any' = 'all';

  const extractSimple = (c: SimpleCondition) => {
    let valStr = '';
    if (Array.isArray(c.value)) {
      valStr = c.value.join(', ');
    } else if (c.value !== undefined && c.value !== null) {
      valStr = String(c.value);
    }

    result.push({
      id: `cond_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      field: c.field,
      operator: c.operator,
      value: valStr,
    });
  };

  if ('field' in condObj) {
    extractSimple(condObj as SimpleCondition);
  } else if ('all' in condObj && Array.isArray(condObj.all)) {
    mode = 'all';
    condObj.all.forEach((item: Condition) => {
      if (item && typeof item === 'object' && 'field' in item)
        extractSimple(item as SimpleCondition);
    });
  } else if ('any' in condObj && Array.isArray(condObj.any)) {
    mode = 'any';
    condObj.any.forEach((item: Condition) => {
      if (item && typeof item === 'object' && 'field' in item)
        extractSimple(item as SimpleCondition);
    });
  }

  return { matchMode: mode, conditions: result };
}
