'use client';

import { useToast } from '@/components/ui/toast';
import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useDashboard } from '../context/dashboard-context';
import { useRules, RuleRecord } from '@/hooks/use-rules';
import { buildLogicCondition, fitsVisualBuilder, type VisualCondition } from './visual-condition-builder';
import { buildTotalCondition, parseTotalCondition, type AggregateCondition } from './total-condition';
import type { VisualAction } from './visual-action-builder';
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
  Search,
  Trash2,
  Edit2,
  History,
  CheckCircle2,
  XCircle,
  Sparkles,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';
import { evaluateRule } from '@gami/rules';
import { usePermissions } from '@/hooks/use-permissions';
import { AdminOnly } from '@/components/ui/admin-only';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { apiFetch } from '@/lib/api-client';
import { BacktestPanel } from './backtest-panel';
import { RuleHistoryDialog } from './rule-history-dialog';

interface StoredCondition {
  logic?: unknown;
  aggregate?: AggregateCondition['aggregate'];
  crossing?: boolean;
  field?: string;
  fact?: string;
  operator?: string;
  value?: unknown;
}

interface StoredConditions {
  all?: StoredCondition[];
  any?: StoredCondition[];
}

interface StoredAction {
  type?: string;
  amount?: number;
  achievementId?: string;
  achievementKey?: string;
  params?: { amount?: number; achievementId?: string; achievementKey?: string; currency?: string; [key: string]: unknown };
}

interface RuleTestResult {
  ruleId?: string;
  ruleName?: string;
  trigger?: string;
  matched?: boolean;
  actions?: StoredAction[];
  [key: string]: unknown;
}

// Only needed once someone opens a dialog, so these stay out of the first load.
const RuleTraceDialog = dynamic(() =>
  import('./rule-trace-dialog').then((mod) => mod.RuleTraceDialog)
);
const VisualConditionBuilder = dynamic(() =>
  import('./visual-condition-builder').then((mod) => mod.VisualConditionBuilder)
);
const VisualActionBuilder = dynamic(() =>
  import('./visual-action-builder').then((mod) => mod.VisualActionBuilder)
);

export function RulesView() {
  const toast = useToast();
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id || null;
  const { isAdminOrOwner } = usePermissions();

  const { rules, loading, error, createRule, updateRule, deleteRule, fetchRules } =
    useRules(projectId);

  const [activeTab, setActiveTab] = useState<'rules' | 'simulator'>('rules');

  // Modal / Form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRecord | null>(null);
  const [historyRule, setHistoryRule] = useState<RuleRecord | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [tracingRule, setTracingRule] = useState<RuleRecord | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<'visual' | 'json'>('visual');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createActionObj = (
    type: string = 'award_xp',
    amount = 100,
    achievementId = '',
    achievementKey = '',
    reason = '',
    currency = ''
  ): VisualAction => ({
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    amount,
    reason,
    achievementId,
    achievementKey,
    currency,
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
  const [testResults, setTestResults] = useState<RuleTestResult[] | { error: string } | null>(null);

  useEffect(() => {
    if (projectId) {
      fetchRules();
    }
  }, [projectId, fetchRules]);

  // Helper to sync editing rule into form state
  useEffect(() => {
    if (editingRule) {
      // Pick up where an unpublished draft left off.
      const source = editingRule.draft ?? editingRule;
      setName(source.name);
      setDescription(source.description || '');
      setTrigger(source.trigger);
      parseConditionsToVisual(source.conditions);
      parseActionsToVisual(source.actions);
      setRawConditionsJson(JSON.stringify(source.conditions, null, 2));
      setRawActionsJson(JSON.stringify(source.actions, null, 2));
      // Nested groups cannot be shown in the builder, so open those in JSON rather than lose part of them.
      if (!fitsVisualBuilder(source.conditions)) setEditorMode('json');
    }
  }, [editingRule]);

  const parseConditionsToVisual = (conditionsObj: StoredConditions | null | undefined) => {
    if (!conditionsObj) {
      setMatchMode('all');
      setVisualConditions([]);
      return;
    }
    const isAny = Array.isArray(conditionsObj.any);
    const condList = (isAny ? conditionsObj.any : conditionsObj.all) ?? [];
    setMatchMode(isAny ? 'any' : 'all');

    const mapped: VisualCondition[] = condList.map((c, index) =>
      c.logic !== undefined
        ? { id: `c_${index}_${Date.now()}`, kind: 'logic' as const, field: '', operator: 'equals' as const, value: JSON.stringify(c.logic) }
        : c.aggregate
        ? parseTotalCondition(c as unknown as AggregateCondition)
        : {
            id: `c_${index}_${Date.now()}`,
            field: c.field || c.fact || '',
            operator: (c.operator || 'equals') as VisualCondition['operator'],
            value: String(c.value ?? ''),
          }
    );
    setVisualConditions(mapped);
  };

  const parseActionsToVisual = (actionsArr: StoredAction[]) => {
    if (!Array.isArray(actionsArr)) {
      setVisualActions([createActionObj('award_xp', 100)]);
      return;
    }
    const mapped: VisualAction[] = actionsArr.map((a) => {
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
      if (a.type === 'award_currency') {
        return createActionObj('award_currency', Number(a.params?.amount) || 100, '', '', '', String(a.params?.currency ?? ''));
      }
      // A plugin action keeps its own parameters as they are.
      if (a.type && a.type.includes('.')) return { ...createActionObj(a.type, 0), params: (a.params as Record<string, unknown>) ?? {} };
      return createActionObj('award_xp', 100);
    });
    setVisualActions(mapped);
  };

  const buildRulesEngineConditions = (mode: 'all' | 'any', conds: VisualCondition[]) => {
    if (conds.length === 0) return null;
    const formatted = conds.map((c) => {
      if (c.kind === 'total') return buildTotalCondition(c);
      if (c.kind === 'logic') return buildLogicCondition(c);
      let val: string | number | boolean = c.value;
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
      if (a.type === 'award_currency') {
        return { type: 'award_currency', params: { currency: a.currency || '', amount: a.amount || 100 } };
      }
      return { type: a.type, params: a.params ?? {} };
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
      setName('7-day streak bonus');
      setTrigger('streak_updated');
      setDescription('Awards 200 XP when someone reaches a 7 day streak. Change the streak key to match yours.');
      setMatchMode('all');
      setVisualConditions([
        { id: `c_1_${Date.now()}`, field: 'payload.streak', operator: 'equals', value: 'daily_lesson' },
        { id: `c_2_${Date.now()}`, field: 'payload.current', operator: 'equals', value: '7' },
      ]);
      setVisualActions([createActionObj('award_xp', 200)]);
    } else if (presetKey === 'spend') {
      setName('Big spender');
      setTrigger('purchase');
      setDescription('Awards 500 XP once, the moment someone spends $100 in a month');
      setMatchMode('all');
      setVisualConditions([
        {
          id: `c_1_${Date.now()}`,
          kind: 'total',
          metric: 'sum',
          field: 'payload.amount',
          totalEvent: '',
          window: 'calendar_month',
          operator: 'greater_than_or_equal',
          value: '100',
          crossing: true,
        },
      ]);
      setVisualActions([createActionObj('award_xp', 500)]);
    }
  };

  // Links such as /dashboard/rules?trigger=streak_updated open a new rule with that event filled in.
  useEffect(() => {
    const linked = new URLSearchParams(window.location.search).get('trigger');
    if (!linked) return;
    setTrigger(linked);
    if (linked === 'streak_updated') handleApplyPreset('streak');
    setIsCreateOpen(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('trigger');
    window.history.replaceState(null, '', url);
    // Runs once, for the address the page was opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

    let conditionsObj: Record<string, unknown> | null;
    let actionsObj: Record<string, unknown>[];

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

      let saved: { warnings?: string[] } | null;
      if (editingRule) {
        saved = await updateRule(editingRule.id, {
          name,
          description,
          trigger,
          conditions: conditionsObj as Record<string, unknown>,
          actions: actionsObj as Record<string, unknown>[],
        });
        setEditingRule(null);
      } else {
        saved = await createRule({
          name,
          description,
          trigger,
          conditions: conditionsObj as Record<string, unknown>,
          actions: actionsObj as Record<string, unknown>[],
        });
        setIsCreateOpen(false);
      }
      saved?.warnings?.forEach((warning) => toast.warning('Rule saved with a warning', warning));
    } catch (err: unknown) {
      setFormError((err as Error).message || 'Failed to save rule definition');
    } finally {
      setSubmitting(false);
    }
  };

  /** Keeps the edits without changing what runs. */
  const handleSaveDraft = async () => {
    if (!editingRule || !selectedProject) return;
    if (!name.trim() || !trigger.trim()) {
      setFormError('A name and a trigger are needed, even for a draft.');
      return;
    }
    setSavingDraft(true);
    setFormError(null);
    try {
      const conditionsObj = editorMode === 'visual' ? buildRulesEngineConditions(matchMode, visualConditions) : JSON.parse(rawConditionsJson || 'null');
      const actionsObj = editorMode === 'visual' ? buildRulesEngineActions(visualActions) : JSON.parse(rawActionsJson || '[]');
      const res = await apiFetch(`/api/projects/${selectedProject.id}/rules/${editingRule.id}/draft`, {
        method: 'PUT',
        body: JSON.stringify({ name, description, trigger, conditions: conditionsObj, actions: actionsObj }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'The draft could not be saved.');
      toast.success('Draft saved', 'It is not live yet. Publish it when you are ready.');
      setEditingRule(null);
      setIsCreateOpen(false);
      await fetchRules();
    } catch (err) {
      setFormError(err instanceof SyntaxError ? 'The JSON is not valid yet.' : (err as Error).message);
    } finally {
      setSavingDraft(false);
    }
  };

  const handleDiscardDraft = async () => {
    if (!editingRule || !selectedProject) return;
    const res = await apiFetch(`/api/projects/${selectedProject.id}/rules/${editingRule.id}/draft`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Draft discarded.');
      setEditingRule(null);
      setIsCreateOpen(false);
      await fetchRules();
    } else {
      toast.error('The draft could not be discarded.');
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
      <PageHeader
        title="Rules"
        description={
          <>
            Decide when users earn XP and rewards in{' '}
            <span className="text-zinc-200">{selectedProject.name}</span>
          </>
        }
        actions={
          <>
            <AdminOnly>
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
            </AdminOnly>
          </>
        }
        toolbar={
          <>
            <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-none flex gap-1">
              <button
                onClick={() => setActiveTab('rules')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-none transition flex items-center gap-1.5 ${
                  activeTab === 'rules'
                    ? 'bg-brand-500 text-on-accent shadow-sm'
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
                    ? 'bg-brand-500 text-on-accent shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                Rule Simulator
              </button>
            </div>
          </>
        }
      />

      {error && (
        <div className="p-4 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs rounded-none">
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
              <EmptyState
                icon={Zap}
                title="No rules yet"
                description="Rules award XP and achievements when events happen. Create one to get started."
              />
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
                          <div className="text-xs font-semibold text-zinc-200">
                            {rule.name}
                            {rule.draft && <Badge variant="amber" className="ml-2">Draft waiting</Badge>}
                          </div>
                          {rule.description && (
                            <div className="text-[11px] text-zinc-400">{rule.description}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="orange">{rule.trigger}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {rule.conditions ? (
                          <span className="text-[11px] bg-zinc-950 px-2 py-1 rounded-none border border-zinc-800">
                            {Array.isArray((rule.conditions as StoredConditions).all)
                              ? `${(rule.conditions as StoredConditions).all?.length} IF (ALL)`
                              : Array.isArray((rule.conditions as StoredConditions).any)
                                ? `${(rule.conditions as StoredConditions).any?.length} IF (ANY)`
                                : 'Custom JSON'}
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">Always executes</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="flex flex-wrap gap-1">
                          {Array.isArray(rule.actions) ? (
                            (rule.actions as StoredAction[]).map((act, idx) => (
                              <Badge key={idx} variant="emerald" className="text-xs">
                                {act.type === 'award_xp'
                                  ? `+${act.params?.amount || act.amount} XP`
                                  : act.type === 'award_currency'
                                    ? `+${act.params?.amount} ${act.params?.currency}`
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
                          disabled={!isAdminOrOwner}
                          title={
                            !isAdminOrOwner
                              ? 'Needs an owner or admin to toggle rule status'
                              : undefined
                          }
                          onClick={() => isAdminOrOwner && handleToggleEnabled(rule)}
                          className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${
                            rule.enabled
                              ? 'bg-success-950/60 text-success-300 border-success-800/50'
                              : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                          } ${!isAdminOrOwner ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          {rule.enabled ? 'ACTIVE' : 'DISABLED'}
                        </button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setTracingRule(rule)}
                            className="p-2 text-zinc-400 hover:text-white transition"
                            title="Why did this fire?"
                            aria-label="Why did this fire?"
                          >
                            <Search className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setHistoryRule(rule)}
                            className="p-2 text-zinc-400 hover:text-white transition"
                            title="History"
                            aria-label="History"
                          >
                            <History className="w-4 h-4" />
                          </button>
                          <AdminOnly>
                            <button
                              onClick={() => {
                                setEditingRule(rule);
                                setIsCreateOpen(true);
                              }}
                              className={`p-1.5 transition ${'text-zinc-400 hover:text-zinc-200'}`}
                              title="Edit Rule"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </AdminOnly>
                          <AdminOnly>
                            <button
                              onClick={() => setDeletingRuleId(rule.id)}
                              className={`p-1.5 transition ${'text-zinc-400 hover:text-danger-400'}`}
                              title="Delete Rule"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </AdminOnly>
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
                <Play className="w-4 h-4 text-success-400" />
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
                className="w-full p-3 rounded-none border border-zinc-800 focus:outline-none focus:border-brand-500 text-xs bg-zinc-950/80 text-zinc-200"
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
                <ShieldCheck className="w-4 h-4 text-brand-400" />
                Step-by-Step Evaluation Breakdown
              </CardTitle>
              <CardDescription>Visual execution breakdown for active rules.</CardDescription>
            </CardHeader>
            <CardContent>
              {testResults ? (
                'error' in testResults ? (
                  <div className="p-4 bg-danger-950/40 border border-danger-800 text-danger-300 text-xs rounded-none">
                    {testResults.error}
                  </div>
                ) : Array.isArray(testResults) && testResults.length > 0 ? (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1">
                    {testResults.map((res, idx) => (
                      <div
                        key={res.ruleId || idx}
                        className="animate-rise bg-zinc-950 p-4 rounded-none border border-zinc-800 space-y-3"
                      >
                        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                          <div>
                            <span className="text-xs font-bold text-zinc-100">{res.ruleName}</span>
                            <div className="text-xs text-zinc-400">Trigger: {res.trigger}</div>
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
                                <span className="text-success-400 flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5" /> Matched
                                </span>
                              ) : (
                                <span className="text-danger-400 flex items-center gap-1">
                                  <XCircle className="w-3.5 h-3.5" /> Mismatched
                                </span>
                              )}
                            </span>
                          </div>

                          {/* Step 2: Actions Executed */}
                          {res.matched && (
                            <div className="p-2.5 rounded-none bg-success-950/30 border border-success-800/40 space-y-1.5">
                              <span className="text-success-300 font-bold text-[11px] flex items-center gap-1">
                                <ArrowRight className="w-3.5 h-3.5 text-success-400" />
                                Actions Executed:
                              </span>
                              <div className="flex flex-wrap gap-1.5">
                                {Array.isArray(res.actions) &&
                                  res.actions.map((act, i) => (
                                    <Badge key={i} variant="emerald" className="text-xs">
                                      {act.type === 'award_xp'
                                        ? `+${act.params?.amount || act.amount} XP`
                                        : act.type === 'award_currency'
                                          ? `+${act.params?.amount} ${act.params?.currency}`
                                          : act.type}
                                    </Badge>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-zinc-400">
                    No active rules to evaluate. Create and activate a rule first.
                  </div>
                )
              ) : (
                <div className="py-16 text-center text-xs text-zinc-400 border border-dashed border-zinc-800 rounded-none">
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
          {editingRule?.draft && (
            <div className="flex flex-wrap items-center justify-between gap-2 border border-warning-800/60 bg-warning-950/30 p-3 text-xs text-warning-300">
              <span>You are editing an unpublished draft. The live rule hasn’t changed.</span>
              <button type="button" className="underline" onClick={() => void handleDiscardDraft()}>
                Discard draft
              </button>
            </div>
          )}
          {formError && (
            <div className="p-3 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs rounded-none font-medium">
              {formError}
            </div>
          )}

          {/* Preset Buttons */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-semibold text-zinc-400 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-brand-400" /> Rule Presets:
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
                7-day streak (+200 XP)
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset('spend')}
                className="px-2.5 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 text-xs rounded-none transition"
              >
                Spent $100 this month (+500 XP)
              </button>
            </div>
          </div>

          {/* Builder Mode Toggle */}
          <div className="flex items-center justify-between bg-zinc-950/60 p-2 rounded-none border border-zinc-800">
            <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-brand-400" />
              Rule Builder Mode
            </span>
            <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-none flex gap-1">
              <button
                type="button"
                onClick={() => setEditorMode('visual')}
                className={`px-3 py-1 text-xs font-semibold rounded-none transition flex items-center gap-1.5 ${
                  editorMode === 'visual'
                    ? 'bg-brand-500 text-on-accent shadow-sm'
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
                    ? 'bg-brand-500 text-on-accent shadow-sm'
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
              list="rule-trigger-suggestions"
              helperText={
                trigger === 'streak_updated'
                  ? 'Sent each time a streak starts, grows, is saved by a freeze, or ends. Use payload.streak, payload.current and payload.change.'
                  : undefined
              }
              required
            />
            <datalist id="rule-trigger-suggestions">
              <option value="streak_updated">When a streak changes</option>
              {Array.from(new Set(rules.map((r) => r.trigger))).map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
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
              <label
                htmlFor="rules-view-conditions-json"
                className="block text-xs font-semibold text-zinc-300"
              >
                Conditions JSON
              </label>
              <textarea
                id="rules-view-conditions-json"
                rows={5}
                value={rawConditionsJson}
                onChange={(e) => setRawConditionsJson(e.target.value)}
                className="w-full p-3 rounded-none border border-zinc-800 focus:outline-none focus:border-brand-500 text-xs bg-zinc-950 text-zinc-200"
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
              <label
                htmlFor="rules-view-actions-json"
                className="block text-xs font-semibold text-zinc-300"
              >
                Actions JSON
              </label>
              <textarea
                id="rules-view-actions-json"
                rows={5}
                value={rawActionsJson}
                onChange={(e) => setRawActionsJson(e.target.value)}
                className="w-full p-3 rounded-none border border-zinc-800 focus:outline-none focus:border-brand-500 text-xs bg-zinc-950 text-zinc-200"
              />
            </div>
          )}

          {selectedProject && (
            <BacktestPanel
              projectId={selectedProject.id}
              getRule={() => {
                if (!trigger.trim()) return 'Enter the trigger event first.';
                try {
                  const conditions =
                    editorMode === 'visual'
                      ? buildRulesEngineConditions(matchMode, visualConditions)
                      : JSON.parse(rawConditionsJson || 'null');
                  const actions = editorMode === 'visual' ? buildRulesEngineActions(visualActions) : JSON.parse(rawActionsJson || '[]');
                  if (!Array.isArray(actions) || actions.length === 0) return 'Add at least one action first.';
                  return { trigger: trigger.trim(), conditions, actions };
                } catch {
                  return 'The JSON is not valid yet.';
                }
              }}
            />
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
            {editingRule && (
              <Button type="button" variant="outline" isLoading={savingDraft} onClick={() => void handleSaveDraft()}>
                Save draft
              </Button>
            )}
            <Button type="submit" isLoading={submitting} variant="primary">
              {editingRule ? (editingRule.draft ? 'Publish changes' : 'Update Rule') : 'Create Rule'}
            </Button>
          </div>
        </form>
      </Dialog>

      {selectedProject && (
        <RuleHistoryDialog
          projectId={selectedProject.id}
          rule={historyRule}
          canRestore={isAdminOrOwner}
          onClose={() => setHistoryRule(null)}
          onRestored={() => void fetchRules()}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={!!deletingRuleId}
        onClose={() => setDeletingRuleId(null)}
        onConfirm={handleDeleteRule}
        title="Delete Rule"
        message="Are you sure you want to delete this rule? Active events will no longer trigger these actions."
        confirmText="Delete Rule"
      />
      {tracingRule && selectedProject && (
        <RuleTraceDialog
          projectId={selectedProject.id}
          rule={tracingRule}
          onClose={() => setTracingRule(null)}
        />
      )}
    </div>
  );
}
