'use client';

import React, { useState } from 'react';
import { Button } from '../button';
import { Input, Textarea } from '../input';
import { Dropdown } from '../dropdown';
import { Plus, Trash2, ArrowUp, ArrowDown, Zap, Award, Coins, Puzzle } from 'lucide-react';

export interface ActionDefinition {
  type: string;
  params?: Record<string, unknown>;
}

export interface VisualAction {
  id: string;
  type: 'award_xp' | 'award_achievement' | string;
  amount: number;
  reason: string;
  achievementId: string;
  achievementKey: string;
  /** Key of the currency, for `award_currency`. */
  currency?: string;
  /** Parameters for a plugin action, passed through as they are. */
  params?: Record<string, unknown>;
}

const ACTION_TYPE_OPTIONS = [
  { value: 'award_xp', label: 'Award XP', icon: <Zap className="w-3.5 h-3.5 text-warning-400" /> },
  {
    value: 'award_achievement',
    label: 'Award Achievement / Badge',
    icon: <Award className="w-3.5 h-3.5 text-info-400" />,
  },
  { value: 'award_currency', label: 'Give currency (store points)', icon: <Coins className="w-3.5 h-3.5 text-success-400" /> },
];

export interface BuilderAchievement {
  id: string;
  key: string;
  name: string;
  description?: string | null;
}

export interface BuilderCurrency {
  key: string;
  name: string;
  symbol: string | null;
}

export interface BuilderPluginAction {
  type: string;
  label: string;
  description: string | null;
}

export interface VisualActionBuilderProps {
  actions: VisualAction[];
  onChange: (actions: VisualAction[]) => void;
  /** The achievements a rule can award. The dashboard loads a project's; the playground has its own. */
  achievements: BuilderAchievement[];
  currencies: BuilderCurrency[];
  /** Actions added by plugins on this server. */
  pluginActions?: BuilderPluginAction[];
  /** Shown when there are no achievements to pick from. */
  noAchievementsHint?: React.ReactNode;
  /** Shown when there are no currencies to pick from. */
  noCurrenciesHint?: React.ReactNode;
}

/**
 * Edits a rule's actions. It holds no data of its own, so the dashboard and the website
 * playground can each supply theirs.
 */
export function VisualActionBuilder({
  actions,
  onChange,
  achievements,
  currencies,
  pluginActions = [],
  noAchievementsHint = 'No achievements yet. Create one on the Achievements page first.',
  noCurrenciesHint = 'No currencies yet. Create one on the Store page first.',
}: VisualActionBuilderProps) {
  const [paramText, setParamText] = useState<Record<string, string>>({});

  const currencyOptions = currencies.map((item) => ({ value: item.key, label: `${item.symbol ? `${item.symbol} ` : ''}${item.name}`, sublabel: item.key }));

  const handleAddAction = () => {
    const firstAch = achievements[0];
    const newAct: VisualAction = {
      id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      type: 'award_xp',
      amount: 100,
      reason: 'Rule reward',
      achievementId: firstAch ? firstAch.id : '',
      achievementKey: firstAch ? firstAch.key : '',
    };
    onChange([...actions, newAct]);
  };

  const handleRemoveAction = (id: string) => {
    onChange(actions.filter((a) => a.id !== id));
  };

  const handleUpdateAction = (id: string, patch: Partial<VisualAction>) => {
    onChange(actions.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  };

  const handleMoveAction = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= actions.length) return;
    const reordered = [...actions];
    const itemToMove = reordered[index];
    if (!itemToMove) return;
    reordered.splice(index, 1);
    reordered.splice(newIndex, 0, itemToMove);
    onChange(reordered);
  };

  const achievementOptions = achievements.map((ach) => ({
    value: ach.id,
    label: `${ach.name} (${ach.key})`,
    sublabel: ach.description || undefined,
    icon: <Award className="w-3.5 h-3.5 text-info-400" />,
  }));

  return (
    <div className="space-y-4 bg-zinc-950/60 p-4 rounded-none border border-zinc-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-warning-400" />
          <span className="text-xs font-semibold text-zinc-200">Rule Executed Actions</span>
        </div>
        <span className="text-[11px] text-zinc-400 font-medium">
          Executed in order when conditions match
        </span>
      </div>

      <div className="space-y-3">
        {actions.map((act, idx) => (
          <div
            key={act.id}
            className="p-3.5 bg-zinc-900/80 rounded-none border border-zinc-800 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <span className="w-5 h-5 shrink-0 rounded-none bg-zinc-800 text-zinc-300 text-xs font-bold flex items-center justify-center">
                  {idx + 1}
                </span>
                {/* Shrinks on phones, so the row fits. */}
                <div className="min-w-0 flex-1 sm:w-56 sm:flex-none">
                  <Dropdown
                    options={[
                      ...ACTION_TYPE_OPTIONS,
                      ...pluginActions.map((item) => ({ value: item.type, label: item.label, sublabel: item.description ?? item.type, icon: <Puzzle className="w-3.5 h-3.5 text-zinc-400" /> })),
                      ...(act.type.includes('.') && !pluginActions.some((item) => item.type === act.type) ? [{ value: act.type, label: act.type, sublabel: 'Plugin not loaded on this server' }] : []),
                    ]}
                    value={act.type}
                    onChange={(val) => handleUpdateAction(act.id, { type: val, ...(val === 'award_currency' && !act.currency ? { currency: currencies[0]?.key ?? '' } : {}) })}
                  />
                </div>
              </div>

              {/* Reordering and Delete Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMoveAction(idx, 'up')}
                  className="p-1.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed rounded transition"
                  title="Move Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === actions.length - 1}
                  onClick={() => handleMoveAction(idx, 'down')}
                  className="p-1.5 text-zinc-400 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed rounded transition"
                  title="Move Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveAction(act.id)}
                  className="p-1.5 text-zinc-400 hover:text-danger-400 hover:bg-danger-950/40 rounded transition ml-1"
                  title="Remove Action"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Action Param Configuration */}
            {act.type === 'award_xp' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-zinc-800/60">
                <Input
                  label="XP Amount"
                  type="number"
                  placeholder="e.g. 100"
                  value={act.amount}
                  onChange={(e) => handleUpdateAction(act.id, { amount: Number(e.target.value) })}
                  required
                />
                <Input
                  label="Reason"
                  placeholder="e.g. Completed daily quest"
                  value={act.reason}
                  onChange={(e) => handleUpdateAction(act.id, { reason: e.target.value })}
                  required
                />
              </div>
            )}

            {act.type.includes('.') && (
              <div className="pt-1 border-t border-zinc-800/60">
                <Textarea
                  label="Parameters (JSON)"
                  rows={3}
                  className="font-mono text-xs"
                  value={paramText[act.id] ?? JSON.stringify(act.params ?? {}, null, 2)}
                  onChange={(e) => {
                    setParamText({ ...paramText, [act.id]: e.target.value });
                    try {
                      const parsed = JSON.parse(e.target.value);
                      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) handleUpdateAction(act.id, { params: parsed });
                    } catch {
                      // Keep the text until it is valid JSON.
                    }
                  }}
                  helperText="Passed to the plugin. It checks them when the rule is saved."
                />
              </div>
            )}

            {act.type === 'award_currency' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-zinc-800/60">
                {currencyOptions.length > 0 ? (
                  <div>
                    <label className="block text-xs font-medium text-zinc-300 mb-1.5">Currency</label>
                    <Dropdown options={currencyOptions} value={act.currency || null} onChange={(val) => handleUpdateAction(act.id, { currency: val })} placeholder="Choose a currency" />
                  </div>
                ) : (
                  <div className="p-3 bg-warning-950/30 border border-warning-800/40 text-warning-300 text-xs rounded-none">
                    {noCurrenciesHint}
                  </div>
                )}
                <Input
                  label="Amount"
                  type="number"
                  min={1}
                  value={act.amount}
                  onChange={(e) => handleUpdateAction(act.id, { amount: Number(e.target.value) })}
                  required
                />
              </div>
            )}

            {act.type === 'award_achievement' && (
              <div className="pt-1 border-t border-zinc-800/60">
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Achievement
                </label>
                {achievementOptions.length > 0 ? (
                  <Dropdown
                    options={achievementOptions}
                    value={act.achievementId}
                    onChange={(val) => {
                      const ach = achievements.find((a) => a.id === val);
                      if (ach) {
                        handleUpdateAction(act.id, {
                          achievementId: ach.id,
                          achievementKey: ach.key,
                        });
                      }
                    }}
                  />
                ) : (
                  <div className="p-3 bg-warning-950/30 border border-warning-800/40 text-warning-300 text-xs rounded-none">
                    {noAchievementsHint}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {actions.length === 0 && (
          <div className="py-4 text-center text-xs text-danger-400 bg-danger-950/20 border border-danger-800/40 rounded-none">
            Every rule requires at least one action to execute.
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={handleAddAction}
        className="w-full"
      >
        <Plus className="w-4 h-4" />
        Add Action
      </Button>
    </div>
  );
}

/** Helper utility to convert visual actions state to Rules Engine ActionDefinition[] */
export function buildRulesEngineActions(actions: VisualAction[]): ActionDefinition[] {
  return actions.map((act) => {
    if (act.type === 'award_xp') {
      return {
        type: 'award_xp',
        params: {
          amount: Number(act.amount) || 0,
          reason: act.reason || 'Rule reward',
        },
      };
    } else if (act.type === 'award_currency') {
      return { type: 'award_currency', params: { currency: act.currency || '', amount: Number(act.amount) || 0 } };
    } else if (act.type === 'award_achievement') {
      return {
        type: 'award_achievement',
        // The engine awards by key. The id is kept so the dashboard can show which one it was.
        params: {
          achievementKey: act.achievementKey,
          ...(act.achievementId ? { achievementId: act.achievementId } : {}),
        },
      };
    } else {
      return {
        type: act.type,
        params: act.params ?? {},
      };
    }
  });
}

/** Helper utility to parse Rules Engine ActionDefinition[] back into VisualAction state */
export function parseRulesEngineActions(
  actions: ActionDefinition[] | undefined | null
): VisualAction[] {
  if (!Array.isArray(actions)) return [];

  return actions.map((act) => {
    const id = `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const params = act.params || {};

    if (act.type === 'award_xp') {
      return {
        id,
        type: 'award_xp',
        amount: Number(params['amount']) || 100,
        reason: String(params['reason'] || 'Rule reward'),
        achievementId: '',
        achievementKey: '',
      };
    } else if (act.type === 'award_currency') {
      return { id, type: 'award_currency', amount: Number(params['amount']) || 100, reason: '', achievementId: '', achievementKey: '', currency: String(params['currency'] || '') };
    } else if (act.type === 'award_achievement') {
      return {
        id,
        type: 'award_achievement',
        amount: 0,
        reason: '',
        achievementId: String(params['achievementId'] || ''),
        // Older rules from this builder saved the key as `key`.
        achievementKey: String(params['achievementKey'] || params['key'] || ''),
      };
    } else {
      return {
        id,
        type: act.type,
        amount: 0,
        reason: '',
        achievementId: '',
        achievementKey: '',
        params,
      };
    }
  });
}
