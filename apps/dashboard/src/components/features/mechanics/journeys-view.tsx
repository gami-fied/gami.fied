'use client';

import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { ArrowDown, ArrowUp, Plus, Route, X } from 'lucide-react';
import { FieldLabel, MechanicList, type MechanicConfig } from './mechanic-list';
import { describePrizes, PrizeEditor, type Prize } from './prize-editor';

interface Journey {
  id: string;
  key: string;
  name: string;
  description: string | null;
  steps: string[];
  rewards: Prize[];
  enabled: boolean;
  completions: number;
}

interface Draft {
  key: string;
  name: string;
  description: string;
  steps: string[];
  rewards: Prize[];
}

const config: MechanicConfig<Journey, Draft> = {
  endpoint: '/journeys',
  noun: 'journey',
  icon: Route,
  emptyTitle: 'No journeys yet',
  emptyDescription: 'Chain challenges together so that finishing one opens the next: an onboarding flow, or a quest with chapters. Make the challenges first.',
  dialogDescription: 'A step does not count events until every step before it is finished. Each step is a challenge that runs once.',
  wide: true,
  toggles: true,
  deleteMessage: 'Its challenges stay, and go back to counting on their own. Prizes already paid stay with the players.',
  blank: () => ({ key: '', name: '', description: '', steps: ['', ''], rewards: [{ type: 'xp', amount: 200 }] }),
  toDraft: (journey) => ({ key: journey.key, name: journey.name, description: journey.description ?? '', steps: journey.steps, rewards: journey.rewards }),
  toBody: (draft, editing) => ({
    ...(editing ? {} : { key: draft.key.trim() }),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    steps: draft.steps.filter(Boolean),
    rewards: draft.rewards,
  }),
  title: (journey) => journey.name,
  lines: (journey) => [
    journey.steps.join(' → '),
    `Prize for finishing: ${describePrizes(journey.rewards)}`,
    `Finished by ${journey.completions.toLocaleString()} ${journey.completions === 1 ? 'player' : 'players'}.`,
  ],
  form: (draft, set, options, editing) => {
    const once = options.challenges.filter((challenge) => !challenge.recurrence);
    const move = (index: number, by: number) => {
      const steps = [...draft.steps];
      const [step] = steps.splice(index, 1);
      steps.splice(index + by, 0, step!);
      set({ steps });
    };
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name *" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Getting started" required />
          {!editing && <Input label="Key *" value={draft.key} onChange={(e) => set({ key: e.target.value })} placeholder="onboarding" helperText="Used by the API. It cannot change later." required />}
        </div>
        <Input label="Description" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        <div>
          <div className="mb-2 flex items-center justify-between">
            <FieldLabel>Steps, in order</FieldLabel>
            <Button type="button" variant="ghost" size="sm" onClick={() => set({ steps: [...draft.steps, ''] })}>
              <Plus className="h-3.5 w-3.5" />
              Add step
            </Button>
          </div>
          {once.length === 0 && <p className="mb-2 text-xs text-warning-300">This project has no challenges that run once. Make some on the Challenges page first.</p>}
          <ol className="space-y-2">
            {draft.steps.map((step, index) => (
              <li key={index} className="flex items-center gap-2">
                <span className="w-6 text-xs font-semibold text-zinc-400">{index + 1}.</span>
                <div className="min-w-0 flex-1">
                  <Dropdown
                    options={once.filter((challenge) => challenge.key === step || !draft.steps.includes(challenge.key)).map((challenge) => ({ value: challenge.key, label: challenge.name, sublabel: challenge.key }))}
                    value={step || null}
                    onChange={(key) => set({ steps: draft.steps.map((current, at) => (at === index ? key : current)) })}
                    placeholder="Choose a challenge"
                  />
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move step ${index + 1} up`}>
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => move(index, 1)} disabled={index === draft.steps.length - 1} aria-label={`Move step ${index + 1} down`}>
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => set({ steps: draft.steps.filter((_, at) => at !== index) })} disabled={draft.steps.length <= 2} aria-label={`Remove step ${index + 1}`}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ol>
        </div>
        <PrizeEditor label="Prize for finishing the last step" value={draft.rewards} onChange={(rewards) => set({ rewards })} options={options} />
      </>
    );
  },
};

export function JourneysView() {
  return (
    <div className="space-y-6">
      <PageHeader title="Journeys" description="Chains of challenges where finishing one opens the next, for onboarding flows and story-style quests." />
      <MechanicList config={config} />
    </div>
  );
}
