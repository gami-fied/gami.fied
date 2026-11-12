/** What the last event did, where the player stands, and everything that happened so far. */
import { AnimatePresence, motion } from 'motion/react';
import { Check, Minus, Trash2, X } from 'lucide-react';
import type { PlaygroundSetup, Simulation, Step } from '../../lib/playground/simulate';
import { effectLabel, relativeTime, TONES } from './labels';

function EffectChips({ step, setup }: { step: Step; setup: PlaygroundSetup }) {
  const chips = step.effects.map((effect) => effectLabel(effect, setup)).filter((chip) => chip.text);
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {chips.map((chip, index) => (
        // What a rule gave appears one by one, 60 ms apart.
        <motion.li
          key={`${step.event.id}-${index}`}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
          className={`border px-2 py-0.5 text-xs ${TONES[chip.tone]}`}
        >
          {chip.text}
        </motion.li>
      ))}
    </ul>
  );
}

/** The last event sent, with the streak events it caused. */
export function LastResult({ steps, setup }: { steps: Step[]; setup: PlaygroundSetup }) {
  let start = steps.length - 1;
  while (start > 0 && steps[start]?.emitted) start--;
  const group = steps.slice(start);
  if (!group.length) return <p className="text-sm text-zinc-500">Send an event to see what the rules do with it.</p>;

  return (
    <motion.div layout className="space-y-4" aria-live="polite" transition={{ layout: { duration: 0.25, ease: [0.65, 0, 0.35, 1] } }}>
      {group.map((step) => (
        <div key={step.event.id} className="space-y-2.5">
          <p className="font-mono text-xs text-zinc-400">
            {step.emitted ? 'Then the engine sent ' : ''}
            <span className="text-zinc-100">{step.event.type}</span>
            {step.emitted && <span className="text-zinc-500"> (current {String(step.event.payload['current'])})</span>}
          </p>
          {step.rules.length === 0 ? (
            <p className="text-xs text-zinc-500">No rules listen for this event.</p>
          ) : (
            <ul className="space-y-1.5">
              {step.rules.map((rule, index) => (
                <motion.li
                  key={`${step.event.id}-${rule.ruleId}`}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.25, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    {rule.error ? (
                      <X className="h-3.5 w-3.5 shrink-0 text-danger-400" aria-hidden="true" />
                    ) : rule.matched ? (
                      <Check className="h-3.5 w-3.5 shrink-0 text-success-400" aria-hidden="true" />
                    ) : (
                      <Minus className="h-3.5 w-3.5 shrink-0 text-zinc-500" aria-hidden="true" />
                    )}
                    <span className="font-semibold text-zinc-100">{rule.name}</span>
                    <span className="ml-auto text-zinc-500">{rule.error ? 'Could not run' : rule.matched ? 'Matched' : 'Conditions not met'}</span>
                  </div>
                  {rule.error && <p className="mt-1 text-danger-300">{rule.error}</p>}
                  {rule.aggregates.map((total) => (
                    <p key={total.label} className="mt-1 text-zinc-400">
                      {total.label}: {total.previous} → <span className="text-zinc-200">{total.value}</span>
                    </p>
                  ))}
                </motion.li>
              ))}
            </ul>
          )}
          <EffectChips step={step} setup={setup} />
        </div>
      ))}
    </motion.div>
  );
}

export function PlayerCard({ simulation, setup }: { simulation: Simulation; setup: PlaygroundSetup }) {
  const { totals } = simulation;
  const badges = totals.badges.map((key) => setup.achievements.find((item) => item.key === key)?.name ?? key);
  return (
    <div className="space-y-4 text-sm">
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold text-zinc-50">
            Level {totals.level} <span className="text-zinc-400">· {totals.levelName}</span>
          </span>
          <span className="font-mono text-xs text-zinc-400">{totals.xp} XP</span>
        </div>
        <div className="mt-2 h-2 bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(totals.progressPercent)} aria-label="Progress to the next level">
          {/* Fills on a spring, with transforms only. */}
          <motion.div
            className="h-full origin-left bg-brand-500"
            initial={false}
            animate={{ scaleX: Math.min(100, totals.progressPercent) / 100 }}
            transition={{ type: 'spring', stiffness: 260, damping: 24 }}
          />
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">{totals.xpToNextLevel > 0 ? `${totals.xpToNextLevel} XP to the next level` : 'Top level reached'}</p>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-xs">
        {Object.entries(totals.streaks).map(([key, state]) => (
          <div key={key} className="border border-zinc-800 px-3 py-2">
            <dt className="text-zinc-500">{setup.streaks.find((s) => s.key === key)?.name ?? key}</dt>
            <dd className="mt-0.5 text-zinc-100">
              {state.current} in a row · best {state.longest}
              {state.freezes ? ` · ${state.freezes} freeze${state.freezes === 1 ? '' : 's'}` : ''}
            </dd>
          </div>
        ))}
        {setup.currencies.map((currency) => (
          <div key={currency.key} className="border border-zinc-800 px-3 py-2">
            <dt className="text-zinc-500">{currency.name}</dt>
            <dd className="mt-0.5 text-zinc-100">
              {currency.symbol ? `${currency.symbol} ` : ''}
              {totals.wallets[currency.key] ?? 0}
            </dd>
          </div>
        ))}
      </dl>
      <div>
        <p className="text-xs text-zinc-500">Achievements</p>
        {badges.length ? (
          <ul className="mt-1.5 flex flex-wrap gap-1.5">
            {badges.map((name) => (
              <li key={name} className={`border px-2 py-0.5 text-xs ${TONES.badge}`}>
                {name}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-xs text-zinc-400">None yet.</p>
        )}
      </div>
    </div>
  );
}

export function Timeline({ simulation, setup, onRemove }: { simulation: Simulation; setup: PlaygroundSetup; onRemove: (eventId: string) => void }) {
  const steps = [...simulation.steps].reverse();
  if (!steps.length) return <p className="text-sm text-zinc-500">No events yet.</p>;
  return (
    <ol className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
      <AnimatePresence initial={false}>
      {steps.map((step) => (
        <motion.li
          key={step.event.id}
          layout="position"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className={`flex gap-3 py-2.5 text-xs ${step.emitted ? 'pl-5' : ''}`}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <p className="flex flex-wrap items-baseline gap-x-2">
              <span className={`font-mono ${step.emitted ? 'text-zinc-400' : 'text-zinc-100'}`}>{step.event.type}</span>
              {!step.emitted && Object.keys(step.event.payload).length > 0 && (
                <span className="truncate font-mono text-zinc-500">{JSON.stringify(step.event.payload)}</span>
              )}
              <time className="ml-auto shrink-0 text-zinc-500" dateTime={step.event.occurredAt} title={new Date(step.event.occurredAt).toLocaleString()}>
                {relativeTime(step.event.occurredAt)}
              </time>
            </p>
            <EffectChips step={step} setup={setup} />
          </div>
          {!step.emitted && (
            <button type="button" className="self-start text-zinc-600 hover:text-danger-300" aria-label={`Remove this ${step.event.type} event`} onClick={() => onRemove(step.event.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </motion.li>
      ))}
      </AnimatePresence>
    </ol>
  );
}
