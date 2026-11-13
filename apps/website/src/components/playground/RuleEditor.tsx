/**
 * One rule, edited with the dashboard's own visual builder or as JSON. The builder rows are kept
 * here while the rule is open, and every change is turned into the rule definition the engine runs.
 */
import { useEffect, useMemo, useState } from 'react';
import { Braces, ListTree, Trash2 } from 'lucide-react';
import { Button, Input, Switch, Textarea } from '@gami/ui';
import {
  buildRulesEngineActions,
  buildRulesEngineConditions,
  fitsVisualBuilder,
  parseRulesEngineActions,
  parseRulesEngineConditions,
  VisualActionBuilder,
  VisualConditionBuilder,
  type ConditionGroup,
  type VisualAction,
  type VisualCondition,
} from '@gami/ui/rules';
import type { RuleDefinition } from '@gami/rules';
import { ruleProblem, type PlaygroundRule, type PlaygroundSetup } from '../../lib/playground/simulate';

interface Props {
  rule: PlaygroundRule;
  setup: PlaygroundSetup;
  onChange: (rule: PlaygroundRule) => void;
  onDelete: () => void;
}

type Mode = 'visual' | 'json';

export function RuleEditor({ rule, setup, onChange, onDelete }: Props) {
  const [mode, setMode] = useState<Mode>(() => (fitsVisualBuilder(rule.definition.conditions) ? 'visual' : 'json'));
  const [matchMode, setMatchMode] = useState<'all' | 'any'>('all');
  const [conditions, setConditions] = useState<VisualCondition[]>([]);
  const [actions, setActions] = useState<VisualAction[]>([]);
  const [json, setJson] = useState('');
  const [buildError, setBuildError] = useState<string | null>(null);

  // Load the builder from the stored rule whenever a different rule is opened.
  useEffect(() => {
    const parsed = parseRulesEngineConditions(rule.definition.conditions as ConditionGroup | undefined);
    setMatchMode(parsed.matchMode);
    setConditions(parsed.conditions);
    setActions(
      parseRulesEngineActions(rule.definition.actions).map((action) => ({
        ...action,
        // The builder picks achievements by id; the playground's are matched by key.
        achievementId: setup.achievements.find((item) => item.key === action.achievementKey)?.id ?? action.achievementId,
      }))
    );
    setJson(JSON.stringify(rule.definition, null, 2));
    setMode(fitsVisualBuilder(rule.definition.conditions) ? 'visual' : 'json');
    setBuildError(null);
    // Only when another rule is opened: edits flow out through onChange, not back in.
  }, [rule.id]);

  const update = (definition: RuleDefinition) => onChange({ ...rule, definition });

  const applyVisual = (nextMode: 'all' | 'any', nextConditions: VisualCondition[], nextActions: VisualAction[]) => {
    try {
      const built = buildRulesEngineConditions(nextMode, nextConditions);
      // The builder's condition types are a subset of the engine's, so this is safe.
      const definition = {
        trigger: rule.definition.trigger,
        ...(built ? { conditions: built } : {}),
        actions: buildRulesEngineActions(nextActions),
      } as RuleDefinition;
      setBuildError(null);
      setJson(JSON.stringify(definition, null, 2));
      update(definition);
    } catch (error) {
      // Half-written expressions stay in the builder until they are valid JSON.
      setBuildError((error as Error).message);
    }
  };

  const applyJson = (text: string) => {
    setJson(text);
    try {
      const parsed = JSON.parse(text) as RuleDefinition;
      if (!parsed || typeof parsed !== 'object') throw new Error('The rule must be a JSON object.');
      setBuildError(null);
      update(parsed);
    } catch (error) {
      setBuildError(error instanceof SyntaxError ? 'This is not valid JSON yet.' : (error as Error).message);
    }
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'visual') {
      if (!fitsVisualBuilder(rule.definition.conditions)) {
        setBuildError('These conditions have nested groups, which the visual builder cannot show. Keep editing them as JSON.');
        return;
      }
      const parsed = parseRulesEngineConditions(rule.definition.conditions as ConditionGroup | undefined);
      setMatchMode(parsed.matchMode);
      setConditions(parsed.conditions);
      setActions(parseRulesEngineActions(rule.definition.actions).map((action) => ({ ...action, achievementId: setup.achievements.find((item) => item.key === action.achievementKey)?.id ?? '' })));
    } else {
      setJson(JSON.stringify(rule.definition, null, 2));
    }
    setBuildError(null);
    setMode(next);
  };

  const problem = useMemo(() => ruleProblem(rule.definition), [rule.definition]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Input label="Rule name" value={rule.name} onChange={(e) => onChange({ ...rule, name: e.target.value })} maxLength={128} />
        <Input
          label="When this event arrives"
          value={rule.definition.trigger}
          onChange={(e) => {
            const definition = { ...rule.definition, trigger: e.target.value.trim() };
            setJson(JSON.stringify(definition, null, 2));
            update(definition);
          }}
          placeholder="lesson_completed"
          spellCheck={false}
        />
        <div className="flex h-9 items-center gap-3">
          <Switch label="On" checked={rule.enabled} onChange={(e) => onChange({ ...rule, enabled: e.target.checked })} />
          <Button type="button" variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${rule.name}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex border border-zinc-800 text-xs" role="tablist" aria-label="Editor">
        {(
          [
            ['visual', 'Visual builder', ListTree],
            ['json', 'JSON', Braces],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => switchMode(value)}
            className="flex flex-1 items-center justify-center gap-2 px-3 py-2 font-semibold text-zinc-400 transition-colors hover:text-zinc-100 aria-selected:bg-zinc-800/70 aria-selected:text-zinc-50"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {mode === 'visual' ? (
        <div className="space-y-4">
          <VisualConditionBuilder
            matchMode={matchMode}
            onMatchModeChange={(next) => {
              setMatchMode(next);
              applyVisual(next, conditions, actions);
            }}
            conditions={conditions}
            onChange={(next) => {
              setConditions(next);
              applyVisual(matchMode, next, actions);
            }}
          />
          <VisualActionBuilder
            actions={actions}
            onChange={(next) => {
              setActions(next);
              applyVisual(matchMode, conditions, next);
            }}
            achievements={setup.achievements}
            currencies={setup.currencies}
            noAchievementsHint="No achievements yet. Add one under What this setup can award."
            noCurrenciesHint="No currencies yet. Add one under What this setup can award."
          />
        </div>
      ) : (
        <Textarea
          aria-label="Rule as JSON"
          value={json}
          onChange={(e) => applyJson(e.target.value)}
          rows={16}
          spellCheck={false}
          className="font-mono text-xs leading-relaxed"
        />
      )}

      {(buildError || problem) && (
        <p className="border border-danger-800/50 bg-danger-950/30 px-3 py-2 text-xs text-danger-300" role="status">
          {buildError ?? `A real install would not save this rule: ${problem}`}
        </p>
      )}
    </div>
  );
}
