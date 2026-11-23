/**
 * The playground: edit rules, send events, and watch one player progress, all in the browser with
 * the real rules engine. Nothing leaves the page; a shared link carries the whole setup in its hash.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { Award, ChevronRight, Copy, Download, Link2, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button, SegmentedControl } from '@gami/ui';
import { EVENTS, track } from '../../lib/analytics';
import { eventId, SCENARIOS, scenarioById, type Scenario } from '../../lib/playground/scenarios';
import { decodeState, encodeState, exportRules, MAX_LINK_LENGTH, type SharedState } from '../../lib/playground/share';
import { simulate, type PlaygroundEvent, type PlaygroundRule, type PlaygroundSetup, type Simulation } from '../../lib/playground/simulate';
import { EventComposer, type When } from './EventComposer';
import { LastResult, PlayerCard, PlayerSummary, Timeline } from './Results';
import { RuleEditor } from './RuleEditor';
import { SetupPanel } from './SetupPanel';

const DAY = 86_400_000;
const EMPTY: Simulation = { steps: [], totals: { xp: 0, level: 1, levelName: '', progressPercent: 0, xpToNextLevel: 0, badges: [], wallets: {}, streaks: {} } };

interface PlaygroundState {
  scenario: string | null;
  setup: PlaygroundSetup;
  events: PlaygroundEvent[];
}

function load(scenario: Scenario): PlaygroundState {
  return { scenario: scenario.id, setup: structuredClone(scenario.setup), events: scenario.history(new Date()) };
}

function Panel({ title, children, actions, id }: { title: string; children: React.ReactNode; actions?: React.ReactNode; id?: string }) {
  return (
    <section className="border border-zinc-800 bg-zinc-950/60" aria-labelledby={id}>
      <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 py-3">
        <h2 id={id} className="text-sm font-semibold text-zinc-100">
          {title}
        </h2>
        {actions}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function Playground() {
  const [state, setState] = useState<PlaygroundState>(() => load(SCENARIOS[0]!));
  const [openRule, setOpenRule] = useState<string | null>(SCENARIOS[0]!.setup.rules[0]?.id ?? null);
  const [simulation, setSimulation] = useState<Simulation>(EMPTY);
  // Bumped when a setup is loaded, so open editors reload even if rule ids repeat.
  const [version, setVersion] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  // On a phone the two halves take turns, so sending an event and its result share one screen.
  const [phoneView, setPhoneView] = useState<'rules' | 'try'>('rules');
  // The results column shows one of these at a time. Sending an event opens "What happened".
  const [resultTab, setResultTab] = useState<'happened' | 'player' | 'timeline'>('happened');
  const noticeTimer = useRef<number | undefined>(undefined);
  // Set by sending an event, so the toast and the rule highlight answer that event, not a reload.
  const justSent = useRef(false);
  const [toast, setToast] = useState<{ id: number; names: string[] } | null>(null);
  const [ruleFlash, setRuleFlash] = useState<{ id: number; matched: boolean } | null>(null);

  const flash = (text: string) => {
    setNotice(text);
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  };

  const replace = (next: PlaygroundState) => {
    setState(next);
    setOpenRule(next.setup.rules[0]?.id ?? null);
    setVersion((v) => v + 1);
  };

  // A shared link opens the setup it carries.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1)).get('s');
    if (!hash) return;
    void decodeState(hash).then((shared) => {
      if (shared) replace({ scenario: shared.scenario, setup: shared.setup, events: shared.events });
      else flash('That link could not be read, so the default setup is loaded.');
    });
  }, []);

  // Runs everything again on each change. It takes milliseconds, and nothing is cached to go stale.
  useEffect(() => {
    let cancelled = false;
    void simulate(state.setup, state.events).then((result) => {
      if (!cancelled) setSimulation(result);
    });
    return () => {
      cancelled = true;
    };
  }, [state]);

  // After a sent event: a toast for new badges, and a short highlight on the open rule.
  useEffect(() => {
    if (!justSent.current || simulation.steps.length === 0) return;
    justSent.current = false;
    let start = simulation.steps.length - 1;
    while (start > 0 && simulation.steps[start]?.emitted) start--;
    const group = simulation.steps.slice(start);
    const names = group.flatMap((step) => step.effects).flatMap((effect) => (effect.kind === 'badge' ? [effect.name] : []));
    if (names.length) {
      const id = Date.now();
      setToast({ id, names });
      window.setTimeout(() => setToast((current) => (current?.id === id ? null : current)), 2800);
    }
    const outcome = group.flatMap((step) => step.rules).find((rule) => rule.ruleId === openRule);
    if (outcome) setRuleFlash({ id: Date.now(), matched: outcome.matched });
  }, [simulation, openRule]);

  const setSetup = (setup: PlaygroundSetup) => setState((s) => ({ ...s, setup }));
  const updateRule = (rule: PlaygroundRule) => setSetup({ ...state.setup, rules: state.setup.rules.map((r) => (r.id === rule.id ? rule : r)) });

  const addRule = () => {
    const id = `rule_${Date.now().toString(36)}`;
    const rule: PlaygroundRule = { id, name: 'New rule', enabled: true, definition: { trigger: state.events.at(-1)?.type ?? 'lesson_completed', actions: [{ type: 'award_xp', params: { amount: 10, reason: 'Rule reward' } }] } };
    setSetup({ ...state.setup, rules: [...state.setup.rules, rule] });
    setOpenRule(id);
  };

  const send = ({ type, payload, when }: { type: string; payload: Record<string, unknown>; when: When }) => {
    const last = state.events.reduce((max, e) => Math.max(max, new Date(e.occurredAt).getTime()), 0);
    const base = last || Date.now();
    const at = when === 'now' ? Date.now() : when === 'next_day' ? base + DAY : when === 'next_week' ? base + 7 * DAY : base + 60_000;
    justSent.current = true;
    setResultTab('happened');
    setState((s) => ({ ...s, events: [...s.events, { id: eventId(), type, payload, occurredAt: new Date(at).toISOString() }] }));
    track(EVENTS.playgroundRun, { scenario: state.scenario ?? 'custom', type });
  };

  const sharedState = useCallback((): SharedState => ({ version: 1, scenario: state.scenario, setup: state.setup, events: state.events }), [state]);

  const copyLink = async () => {
    const encoded = await encodeState(sharedState());
    const url = `${window.location.origin}${window.location.pathname}#s=${encoded}`;
    window.history.replaceState(null, '', `#s=${encoded}`);
    if (url.length > MAX_LINK_LENGTH) flash('This setup makes a very long link, which some apps cut off. Remove a few events to shorten it.');
    try {
      await navigator.clipboard.writeText(url);
      if (url.length <= MAX_LINK_LENGTH) flash('Link copied. It holds the whole setup, so nothing is stored anywhere.');
    } catch {
      flash('Copy the link from the address bar.');
    }
  };

  const rulesJson = useMemo(() => JSON.stringify(exportRules(state.setup), null, 2), [state.setup]);

  const download = () => {
    const blob = new Blob([rulesJson], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'gami-fied-rules.json';
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const open = state.setup.rules.find((rule) => rule.id === openRule) ?? null;
  const scenario = state.scenario ? scenarioById(state.scenario) : undefined;

  return (
    // Reduced motion gives every animation below its instant version.
    <MotionConfig reducedMotion="user">
    <div className="space-y-6">
      {/* Scenarios and sharing */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500" id="scenario-label">
            Start from
          </p>
          <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="scenario-label">
            {SCENARIOS.map((item) => (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={state.scenario === item.id}
                onClick={() => replace(load(item))}
                className="border border-zinc-800 bg-zinc-900/50 px-3.5 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-50 aria-checked:border-zinc-500 aria-checked:bg-zinc-800 aria-checked:text-zinc-50"
              >
                {item.name}
              </button>
            ))}
          </div>
          <p className="mt-2 max-w-xl text-sm text-zinc-400">{scenario?.summary ?? 'Your own setup, from a shared link.'}</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="ghost" size="sm" onClick={() => scenario && replace(load(scenario))} disabled={!scenario}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Start over
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowExport((v) => !v)} aria-expanded={showExport}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" /> Export rules
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => void copyLink()}>
            <Link2 className="h-3.5 w-3.5" aria-hidden="true" /> Copy link
          </Button>
        </div>
      </div>

      {notice && (
        <p className="border border-success-800/50 bg-success-950/30 px-3 py-2 text-sm text-success-200" role="status">
          {notice}
        </p>
      )}

      {showExport && (
        <Panel
          title="Rules as JSON"
          id="export-title"
          actions={
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={() => void navigator.clipboard.writeText(rulesJson).then(() => flash('Rules copied.'))}>
                <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
              </Button>
              <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={download}>
                <Download className="h-3.5 w-3.5" aria-hidden="true" /> Download
              </Button>
            </div>
          }
        >
          <p className="mb-3 text-xs text-zinc-400">
            Each one is the body for <code className="text-zinc-200">POST /api/projects/:id/rules</code> on your install. Create the achievements and currencies they award first, with the same keys.
          </p>
          <pre className="max-h-80 overflow-auto border border-zinc-800 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-300">{rulesJson}</pre>
        </Panel>
      )}

      <div role="tablist" aria-label="Playground" className="sticky top-16 z-10 -mx-2 grid grid-cols-2 gap-1 border border-zinc-800 bg-zinc-950 p-1 xl:hidden">
        {(
          [
            ['rules', 'Rules and setup'],
            ['try', 'Send and results'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={phoneView === id}
            onClick={() => setPhoneView(id)}
            className={`px-3 py-2 text-sm font-medium transition-colors ${phoneView === id ? 'bg-zinc-800 text-zinc-50' : 'text-zinc-300 hover:text-zinc-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1.15fr_1fr]">
        {/* Rules */}
        <div className={`min-w-0 space-y-6 ${phoneView === 'rules' ? '' : 'max-xl:hidden'}`}>
          <Panel
            title="Rules"
            id="rules-title"
            actions={
              <Button type="button" size="sm" onClick={addRule}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Add rule
              </Button>
            }
          >
            <div className="mb-4 flex flex-wrap gap-1.5" role="tablist" aria-label="Rules">
              {state.setup.rules.map((rule) => (
                <button
                  key={rule.id}
                  type="button"
                  role="tab"
                  aria-selected={rule.id === openRule}
                  onClick={() => setOpenRule(rule.id)}
                  className={`border px-2.5 py-1.5 text-xs transition-colors aria-selected:border-zinc-500 aria-selected:bg-zinc-800 aria-selected:text-zinc-50 ${rule.enabled ? 'border-zinc-800 text-zinc-300 hover:border-zinc-600' : 'border-zinc-800 text-zinc-500 line-through'}`}
                >
                  {rule.name || 'Untitled rule'}
                </button>
              ))}
            </div>
            {open ? (
              <div className="relative">
              {/* A short highlight when the rule being edited matched the event just sent, or did not. */}
              <AnimatePresence>
                {ruleFlash && (
                  <motion.div
                    key={ruleFlash.id}
                    aria-hidden="true"
                    className={`pointer-events-none absolute -inset-2 z-10 border ${ruleFlash.matched ? 'border-success-500 bg-success-500/5' : 'border-zinc-500 bg-zinc-500/5'}`}
                    initial={{ opacity: 0.9 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.1, ease: 'easeOut' }}
                    onAnimationComplete={() => setRuleFlash((current) => (current?.id === ruleFlash.id ? null : current))}
                  />
                )}
              </AnimatePresence>
              <RuleEditor
                key={`${open.id}:${version}`}
                rule={open}
                setup={state.setup}
                onChange={updateRule}
                onDelete={() => {
                  const rest = state.setup.rules.filter((rule) => rule.id !== open.id);
                  setSetup({ ...state.setup, rules: rest });
                  setOpenRule(rest[0]?.id ?? null);
                }}
              />
              </div>
            ) : (
              <p className="text-sm text-zinc-500">No rules. Add one to start.</p>
            )}
          </Panel>
          {/* Folded by default: it is what the rules give, not where people start. */}
          <details className="group border border-zinc-800 bg-zinc-950/60">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-semibold text-zinc-100 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" aria-hidden="true" />
              Badges, currencies and levels
              <span className="font-normal text-zinc-400">
                ({state.setup.achievements.length + state.setup.currencies.length + state.setup.streaks.length})
              </span>
            </summary>
            <div className="border-t border-zinc-800 p-4">
              <SetupPanel setup={state.setup} onChange={setSetup} />
            </div>
          </details>
        </div>

        {/* Events and results. On wide screens the column stays in view while the rules scroll, so a
            changed rule's result shows without scrolling. */}
        <div
          className={`min-w-0 flex-col gap-4 xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] ${phoneView === 'try' ? 'flex' : 'flex max-xl:hidden'}`}
        >
          <Panel title="Send an event" id="send-title">
            <EventComposer key={`${state.scenario}:${version}`} presets={scenario?.presets ?? []} onSend={send} />
          </Panel>
          <div className="border border-zinc-800 bg-zinc-950/60 px-4 py-3">
            <PlayerSummary simulation={simulation} setup={state.setup} />
          </div>
          <section className="flex min-h-0 flex-col border border-zinc-800 bg-zinc-950/60 xl:flex-1" aria-label="Results">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 py-2.5">
              <SegmentedControl
                label="Results"
                size="sm"
                value={resultTab}
                onChange={setResultTab}
                options={[
                  { value: 'happened', label: 'What happened' },
                  { value: 'player', label: 'Player' },
                  { value: 'timeline', label: `Timeline (${state.events.length})` },
                ]}
              />
              {resultTab === 'timeline' && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setState((s) => ({ ...s, events: [] }))} disabled={!state.events.length}>
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Clear events
                </Button>
              )}
            </div>
            <div className="min-h-0 overflow-y-auto p-4" tabIndex={0} aria-label="Result details">
              {resultTab === 'happened' && <LastResult steps={simulation.steps} setup={state.setup} />}
              {resultTab === 'player' && <PlayerCard simulation={simulation} setup={state.setup} />}
              {resultTab === 'timeline' && (
                <Timeline simulation={simulation} setup={state.setup} onRemove={(id) => setState((s) => ({ ...s, events: s.events.filter((e) => e.id !== id) }))} />
              )}
            </div>
          </section>
        </div>
      </div>
      {/* Badge unlocks, like the product's own toast. */}
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="status"
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 border border-success-700/70 bg-zinc-950 px-4 py-3 text-sm text-success-100 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.9)]"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          >
            <Award className="h-5 w-5 text-success-400" aria-hidden="true" />
            <span>
              <span className="block text-xs text-success-300">Badge unlocked</span>
              <span className="font-semibold">{toast.names.join(', ')}</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
