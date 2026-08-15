'use client';

import React, { useState, useEffect } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useRules, RuleRecord } from '@/hooks/use-rules';
import { VisualConditionBuilder, VisualCondition } from './visual-condition-builder';
import { VisualActionBuilder, VisualAction } from './visual-action-builder';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Zap,
  Plus,
  Play,
  SlidersHorizontal,
  Code2,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { evaluateRule } from '@gami/rules';
import { motion } from 'motion/react';

export function RulesView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id || null;

  const { rules, loading, error, createRule, updateRule, deleteRule, fetchRules } =
    useRules(projectId);

  const [activeTab, setActiveTab] = useState<'rules' | 'simulator'>('rules');

  // Modal / Form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRecord | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createActionObj = (
    type: string = 'award_xp',
    amount = 100,
    achievementId = '',
    achievementKey = '',
    reason = ''
  ): VisualAction => ({
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    amount,
    reason,
    achievementId,
    achievementKey,
  });

  // Rule Definition state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [trigger, setTrigger] = useState('');
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');
  const [visualConditions, setVisualConditions] = useState<VisualCondition[]>([]);
  const [visualActions, setVisualActions] = useState<VisualAction[]>([
    createActionObj('award_xp', 100),
  ]);

  // Raw JSON fallback state
  const [rawConditionsJson, setRawConditionsJson] = useState('{\n  "all": []\n}');
  const [rawActionsJson, setRawActionsJson] = useState(
    '[\n  {\n    "type": "award_xp",\n    "amount": 100\n  }\n]'
  );

  // Simulator state
  const [testEventJson, setTestEventJson] = useState(
    JSON.stringify(
      {
        type: 'user_signed_up',
        userId: 'usr_101',
        payload: {
          source: 'web',
          plan: 'pro',
          amount: 149.99,
        },
      },
      null,
      2
    )
  );
  const [testResults, setTestResults] = useState<any>(null);

  useEffect(() => {
    if (projectId) {
      fetchRules();
    }
  }, [projectId, fetchRules]);

  // Helper to sync editing rule into form state
  useEffect(() => {
    if (editingRule) {
      setName(editingRule.name);
      setDescription(editingRule.description || '');
      setTrigger(editingRule.trigger);
      parseConditionsToVisual(editingRule.conditions);
      parseActionsToVisual(editingRule.actions);
      setRawConditionsJson(JSON.stringify(editingRule.conditions, null, 2));
      setRawActionsJson(JSON.stringify(editingRule.actions, null, 2));
    }
  }, [editingRule]);

  const parseConditionsToVisual = (conditionsObj: any) => {
    if (!conditionsObj) {
      setMatchMode('all');
      setVisualConditions([]);
      return;
    }
    const isAny = Array.isArray(conditionsObj.any);
    const condList = isAny ? conditionsObj.any : conditionsObj.all || [];
    setMatchMode(isAny ? 'any' : 'all');

    const mapped: VisualCondition[] = condList.map((c: any, index: number) => ({
      id: `c_${index}_${Date.now()}`,
      field: c.field || c.fact || '',
      operator: c.operator || 'equals',
      value: String(c.value ?? ''),
    }));
    setVisualConditions(mapped);
  };

  const parseActionsToVisual = (actionsArr: any[]) => {
    if (!Array.isArray(actionsArr)) {
      setVisualActions([createActionObj('award_xp', 100)]);
      return;
    }
    const mapped: VisualAction[] = actionsArr.map((a: any) => {
      if (a.type === 'award_xp') {
        return createActionObj('award_xp', a.params?.amount || a.amount || 100);
      }
      if (a.type === 'award_achievement') {
        return createActionObj(
          'award_achievement',
          0,
          a.params?.achievementId || a.achievementId || '',
          a.params?.achievementKey || a.achievementKey || ''
        );
      }
      return createActionObj('award_xp', 100);
    });
    setVisualActions(mapped);
  };

  const buildRulesEngineConditions = (mode: 'all' | 'any', conds: VisualCondition[]) => {
    if (conds.length === 0) return null;
    const formatted = conds.map((c) => {
      let val: any = c.value;
      if (c.value === 'true') val = true;
      else if (c.value === 'false') val = false;
      else if (!isNaN(Number(c.value)) && c.value.trim() !== '') val = Number(c.value);

      return {
        field: c.field,
        fact: c.field,
        operator: c.operator,
        value: val,
      };
    });
    return { [mode]: formatted };
  };

  const buildRulesEngineActions = (acts: VisualAction[]) => {
    return acts.map((a) => {
      if (a.type === 'award_xp') {
        return { type: 'award_xp', params: { amount: a.amount || 100 } };
      }
      if (a.type === 'award_achievement') {
        return { type: 'award_achievement', params: { achievementId: a.achievementId || '' } };
      }
      return a;
    });
  };

  const handleApplyPreset = (presetKey: string) => {
    if (presetKey === 'signup') {
      setName('Signup XP Bonus');
      setTrigger('user_signed_up');
      setDescription('Awards 100 XP when a new user signs up');
      setMatchMode('all');
      setVisualConditions([
        { id: `c_1_${Date.now()}`, field: 'payload.source', operator: 'equals', value: 'web' },
      ]);
      setVisualActions([createActionObj('award_xp', 100)]);
    } else if (presetKey === 'order') {
      setName('Order Completion Reward');
      setTrigger('order_completed');
      setDescription('Awards 250 XP for orders over $50');
      setMatchMode('all');
      setVisualConditions([
        { id: `c_1_${Date.now()}`, field: 'payload.amount', operator: 'greater_than', value: '50' },
      ]);
      setVisualActions([createActionObj('award_xp', 250)]);
    } else if (presetKey === 'streak') {
      setName('7-Day Streak Reward');
      setTrigger('streak_maintained');
      setDescription('Awards 500 XP when user maintains a 7-day activity streak');
      setMatchMode('all');
      setVisualConditions([
        {
          id: `c_1_${Date.now()}`,
          field: 'payload.days',
          operator: 'greater_than_or_equal',
          value: '7',
        },
      ]);
      setVisualActions([createActionObj('award_xp', 500)]);
    }
  };

  const handleSaveRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('Rule name is required');
      return;
    }
    if (!trigger.trim()) {
      setFormError('Trigger event name is required');
      return;
    }

    setSubmitting(true);
    setFormError(null);

    let conditionsObj: Record<string, unknown> | null = null;
    let actionsObj: Record<string, unknown>[] = [];

    try {
      if (editorMode === 'visual') {
        conditionsObj = buildRulesEngineConditions(
          matchMode,
          visualConditions
        ) as unknown as Record<string, unknown>;
        actionsObj = buildRulesEngineActions(visualActions) as unknown as Record<string, unknown>[];
      } else {
        conditionsObj = JSON.parse(rawConditionsJson);
        actionsObj = JSON.parse(rawActionsJson);
      }

      if (editingRule) {
        await updateRule(editingRule.id, {
          name,
          description,
          trigger,
          conditions: conditionsObj as Record<string, unknown>,
          actions: actionsObj as Record<string, unknown>[],
        });
        setEditingRule(null);
      } else {
        await createRule({
          name,
          description,
          trigger,
          conditions: conditionsObj as Record<string, unknown>,
          actions: actionsObj as Record<string, unknown>[],
        });
        setIsCreateOpen(false);
      }
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Failed to save rule definition');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!deletingRuleId) return;
    try {
      await deleteRule(deletingRuleId);
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setDeletingRuleId(null);
    }
  };

  const handleToggleEnabled = async (rule: RuleRecord) => {
    try {
      await updateRule(rule.id, { enabled: !rule.enabled });
    } catch (err: unknown) {
      setFormError((err as Error).message);
    }
  };

  const handleRunSimulator = () => {
    try {
      const parsedEvent = JSON.parse(testEventJson);
      const activeRules = rules.filter((r) => r.enabled);

      const results = activeRules.map((r) => {
        const ruleDef = {
          trigger: r.trigger,
          conditions: r.conditions,
          actions: r.actions,
        };
        const evalResult = evaluateRule(ruleDef, parsedEvent, r.id);
        return {
          ruleId: r.id,
          ruleName: r.name,
          trigger: r.trigger,
          ...evalResult,
        };
      });

      setTestResults(results);
    } catch (err: unknown) {
      setTestResults({ error: `Invalid event JSON: ${(err as Error).message}` });
    }
  };

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-none">
        Please select a project to manage gamification rules.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
            Gamification Rules Engine
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Configure IF/THEN event rules for{' '}
            <span className="text-orange-400 font-semibold">{selectedProject.name}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Navigation Tabs */}
          <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-none flex gap-1">
            <button
              onClick={() => setActiveTab('rules')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition flex items-center gap-1.5 ${
                activeTab === 'rules'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              Active Rules ({rules.length})
            </button>
            <button
              onClick={() => setActiveTab('simulator')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition flex items-center gap-1.5 ${
                activeTab === 'simulator'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Play className="w-3.5 h-3.5" />
              Rule Simulator
            </button>
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setName('');
              setDescription('');
              setTrigger('');
              setMatchMode('all');
              setVisualConditions([]);
              setVisualActions([createActionObj('award_xp', 100)]);
              setEditingRule(null);
              setIsCreateOpen(true);
            }}
          >
            <Plus className="w-4 h-4" />
            Create Rule
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none">
          {error}
        </div>
      )}

      {/* Main Tab Content */}
      {activeTab === 'rules' ? (
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardContent className="p-0">
            {loading && rules.length === 0 ? (
              <TableSkeleton rows={6} />
            ) : rules.length === 0 ? (
              <div className="py-16 text-center space-y-3">
                <Zap className="w-10 h-10 text-zinc-600 mx-auto" />
                <h3 className="text-sm font-semibold text-zinc-300">No Rules Defined Yet</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Create your first gamification rule to automatically award XP or achievements when
                  events occur.
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Rule Name</TableHead>
                    <TableHead>Trigger Event</TableHead>
                    <TableHead>Conditions</TableHead>
                    <TableHead>Actions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((rule) => (
                    <TableRow key={rule.id}>
                      <TableCell>
                        <div>
                          <div className="text-xs font-semibold text-zinc-200">{rule.name}</div>
                          {rule.description && (
                            <div className="text-[11px] text-zinc-500">{rule.description}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="orange">{rule.trigger}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {rule.conditions ? (
                          <span className="font-mono text-[11px] bg-zinc-950 px-2 py-1 rounded-none border border-zinc-800">
                            {Array.isArray((rule.conditions as any).all)
                              ? `${(rule.conditions as any).all.length} IF (ALL)`
                              : Array.isArray((rule.conditions as any).any)
                                ? `${(rule.conditions as any).any.length} IF (ANY)`
                                : 'Custom JSON'}
                          </span>
                        ) : (
                          <span className="text-zinc-500 italic">Always executes</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(rule.actions) ? (
                            rule.actions.map((act: any, idx: number) => (
                              <Badge key={idx} variant="emerald" className="text-[10px]">
                                {act.type === 'award_xp'
                                  ? `+${act.params?.amount || act.amount} XP`
                                  : act.type}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="emerald">Custom Actions</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => handleToggleEnabled(rule)}
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase border transition ${
                            rule.enabled
                              ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          }`}
                        >
                          {rule.enabled ? 'ACTIVE' : 'DISABLED'}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => {
                              setEditingRule(rule);
                              setIsCreateOpen(true);
                            }}
                            className="p-1.5 text-zinc-400 hover:text-zinc-200 transition"
                            title="Edit Rule"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeletingRuleId(rule.id)}
                            className="p-1.5 text-zinc-400 hover:text-rose-400 transition"
                            title="Delete Rule"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Step-by-Step Visual Rule Simulator Tab */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Play className="w-4 h-4 text-emerald-400" />
                Simulated Event Payload
              </CardTitle>
              <CardDescription>
                Paste a sample event JSON to evaluate against all active project rules in real time.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <textarea
                rows={12}
                value={testEventJson}
                onChange={(e) => setTestEventJson(e.target.value)}
                className="w-full p-3 rounded-none border border-zinc-800 focus:outline-none focus:border-orange-500 font-mono text-xs bg-zinc-950/80 text-zinc-200"
              />
              <Button onClick={handleRunSimulator} className="w-full" variant="primary">
                <Play className="w-4 h-4" />
                Execute Step-by-Step Rule Simulation
              </Button>
            </CardContent>
          </Card>

          <Card className="bg-zinc-900/80 border-zinc-800">
            <CardHeader>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-orange-400" />
                Step-by-Step Evaluation Breakdown
              </CardTitle>
              <CardDescription>Visual execution breakdown for active rules.</CardDescription>
            </CardHeader>
            <CardContent>
              {testResults ? (
                testResults.error ? (
                  <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs rounded-none">
                    {testResults.error}
                  </div>
                ) : Array.isArray(testResults) && testResults.length > 0 ? (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {testResults.map((res: any, idx: number) => (
                      <motion.div
                        key={res.ruleId || idx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-zinc-950 p-4 rounded-none border border-zinc-800 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                          <div>
                            <span className="text-xs font-bold text-zinc-100">{res.ruleName}</span>
                            <div className="text-[10px] text-zinc-500 font-mono">
                              Trigger: {res.trigger}
                            </div>
                          </div>
                          <Badge variant={res.matched ? 'emerald' : 'rose'}>
                            {res.matched ? 'MATCHED' : 'NOT MATCHED'}
                          </Badge>
                        </div>

                        {/* Step Breakdown Flow */}
                        <div className="space-y-2 text-xs">
                          {/* Step 1: Trigger Check */}
                          <div className="flex items-center justify-between p-2 rounded-none bg-zinc-900/80">
                            <span className="text-zinc-400 font-medium">
                              1. Trigger Event Match
                            </span>
                            <span className="flex items-center gap-1 font-bold text-[11px]">
                              {res.matched ? (
                                <span className="text-emerald-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Matched
                                </span>
                              ) : (
                                <span className="text-rose-400 flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5" /> Mismatched
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Step 2: Actions Executed */}
                          {res.matched && (
                            <div className="p-2.5 rounded-none bg-emerald-950/30 border border-emerald-800/40 space-y-1.5">
                              <span className="text-emerald-300 font-bold text-[11px] flex items-center gap-1">
                                <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                                Actions Executed:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {Array.isArray(res.actionsExecuted) &&
                                  res.actionsExecuted.map((act: any, i: number) => (
                                    <Badge key={i} variant="emerald" className="text-[10px]">
                                      {act.type === 'award_xp'
                                        ? `+${act.params?.amount || act.amount} XP`
                                        : act.type}
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-zinc-500">
                    No active rules to evaluate. Create and activate a rule first.
                  </div>
                )
              ) : (
                <div className="py-16 text-center text-xs text-zinc-500 border border-dashed border-zinc-800 rounded-none">
                  Run the simulation to see step-by-step trigger matches and action execution cards.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Create / Edit Rule Modal */}
      <Dialog
        isOpen={isCreateOpen || !!editingRule}
        onClose={() => {
          setIsCreateOpen(false);
          setEditingRule(null);
        }}
        title={editingRule ? 'Edit Gamification Rule' : 'Create Visual Rule'}
        description="Configure IF event conditions match, THEN execute actions."
      >
        <form onSubmit={handleSaveRule} className="space-y-5 overflow-y-auto pr-1">
          {formError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none font-medium">
              {formError}
            </div>
          )}

          {/* Preset Buttons */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-orange-400" /> Rule Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => handleApplyPreset('signup')}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-none transition"
              >
                Signup Bonus (+100 XP)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('order')}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-none transition"
              >
                Order Reward (+250 XP)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('streak')}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-none transition"
              >
                7-Day Streak (+500 XP)
              </button>
            </div>
          </div>

          {/* Builder Mode Toggle */}
          <div className="flex items-center justify-between bg-zinc-950/60 p-2 rounded-none border border-zinc-800">
            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-orange-400" />
              Rule Builder Mode
            </span>
            <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-none flex gap-1">
              <button
                type="button"
                onClick={() => setEditorMode('visual')}
                className={`px-3 py-1 text-xs font-semibold rounded-none transition flex items-center gap-1.5 ${
                  editorMode === 'visual'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Visual Builder
              </button>
              <button
                type="button"
                onClick={() => {
                  setRawConditionsJson(
                    JSON.stringify(
                      buildRulesEngineConditions(matchMode, visualConditions) || { all: [] },
                      null,
                      2
                    )
                  );
                  setRawActionsJson(
                    JSON.stringify(buildRulesEngineActions(visualActions), null, 2)
                  );
                  setEditorMode('json');
                }}
                className={`px-3 py-1 text-xs font-semibold rounded-none transition flex items-center gap-1.5 ${
                  editorMode === 'json'
                    ? 'bg-orange-500 text-white shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Raw JSON
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Rule Name *"
              placeholder="e.g. Signup XP Bonus"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Trigger Event Name *"
              placeholder="e.g. user_signed_up"
              value={trigger}
              onChange={(e) => setTrigger(e.target.value)}
              required
            />
          </div>

          <Input
            label="Description (Optional)"
            placeholder="e.g. Awards 100 XP when user signs up on a pro plan"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          {/* Condition Builder */}
          {editorMode === 'visual' ? (
            <VisualConditionBuilder
              matchMode={matchMode}
              onMatchModeChange={setMatchMode}
              conditions={visualConditions}
              onChange={setVisualConditions}
            />
          ) : (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-300">Conditions JSON</label>
              <textarea
                rows={5}
                value={rawConditionsJson}
                onChange={(e) => setRawConditionsJson(e.target.value)}
                className="w-full p-3 rounded-none border border-zinc-800 focus:outline-none focus:border-orange-500 font-mono text-xs bg-zinc-950 text-zinc-200"
              />
            </div>
          )}

          {/* Action Builder */}
          {editorMode === 'visual' ? (
            <VisualActionBuilder
              projectId={projectId}
              actions={visualActions}
              onChange={setVisualActions}
            />
          ) : (
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-zinc-300">Actions JSON</label>
              <textarea
                rows={5}
                value={rawActionsJson}
                onChange={(e) => setRawActionsJson(e.target.value)}
                className="w-full p-3 rounded-none border border-zinc-800 focus:outline-none focus:border-orange-500 font-mono text-xs bg-zinc-950 text-zinc-200"
              />
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-zinc-800">
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setIsCreateOpen(false);
                setEditingRule(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting} variant="primary">
              {editingRule ? 'Update Rule' : 'Create Rule'}
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingRuleId}
        onClose={() => setDeletingRuleId(null)}
        onConfirm={handleDeleteRule}
        title="Delete Rule"
        message="Are you sure you want to delete this rule? Active events will no longer trigger these actions."
        confirmText="Delete Rule"
      />
    </div>
  );
}
