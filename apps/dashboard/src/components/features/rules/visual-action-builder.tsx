'use client';

import React from 'react';
import { useAchievements } from '@/hooks/use-achievements';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dropdown } from '@/components/ui/dropdown';
import { Plus, Trash2, ArrowUp, ArrowDown, Zap, Award } from 'lucide-react';

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
}

const ACTION_TYPE_OPTIONS = [
  { value: 'award_xp', label: 'Award XP', icon: <Zap className="w-3.5 h-3.5 text-amber-400" /> },
  {
    value: 'award_achievement',
    label: 'Award Achievement / Badge',
    icon: <Award className="w-3.5 h-3.5 text-purple-400" />,
  },
];

export interface VisualActionBuilderProps {
  projectId: string | null;
  actions: VisualAction[];
  onChange: (actions: VisualAction[]) => void;
}

export function VisualActionBuilder({ projectId, actions, onChange }: VisualActionBuilderProps) {
  const { achievements } = useAchievements(projectId);

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
    icon: <Award className="w-3.5 h-3.5 text-purple-400" />,
  }));

  return (
    <div className="space-y-4 bg-zinc-950/60 p-4 rounded-none border border-zinc-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold text-zinc-200">Rule Executed Actions</span>
        </div>
        <span className="text-[11px] text-zinc-500 font-medium">
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
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-none bg-zinc-800 text-zinc-300 text-[10px] font-bold flex items-center justify-center font-mono">
                  {idx + 1}
                </span>
                <div className="w-56">
                  <Dropdown
                    options={ACTION_TYPE_OPTIONS}
                    value={act.type}
                    onChange={(val) => handleUpdateAction(act.id, { type: val })}
                  />
                </div>
              </div>

              {/* Reordering and Delete Controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => handleMoveAction(idx, 'up')}
                  className="p-1.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed rounded transition"
                  title="Move Up"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === actions.length - 1}
                  onClick={() => handleMoveAction(idx, 'down')}
                  className="p-1.5 text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed rounded transition"
                  title="Move Down"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveAction(act.id)}
                  className="p-1.5 text-zinc-500 hover:text-rose-400 hover:bg-rose-950/40 rounded transition ml-1"
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

            {act.type === 'award_achievement' && (
              <div className="pt-1 border-t border-zinc-800/60">
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">
                  Select Project Achievement
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
                  <div className="p-3 bg-amber-950/30 border border-amber-800/40 text-amber-300 text-xs rounded-none">
                    No achievements created yet for this project. Please create an achievement in
                    the Achievements tab first.
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {actions.length === 0 && (
          <div className="py-4 text-center text-xs text-rose-400 bg-rose-950/20 border border-rose-800/40 rounded-none">
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
    } else if (act.type === 'award_achievement') {
      return {
        type: 'award_achievement',
        params: {
          achievementId: act.achievementId,
          key: act.achievementKey,
        },
      };
    } else {
      return {
        type: act.type,
        params: {},
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
    } else if (act.type === 'award_achievement') {
      return {
        id,
        type: 'award_achievement',
        amount: 0,
        reason: '',
        achievementId: String(params['achievementId'] || ''),
        achievementKey: String(params['key'] || ''),
      };
    } else {
      return {
        id,
        type: act.type,
        amount: 0,
        reason: '',
        achievementId: '',
        achievementKey: '',
      };
    }
  });
}
