'use client';

import { localTimeZoneLabel, toDateTimeLocal } from '@/lib/format';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs } from '@/components/ui/tabs';
import { Flag, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { FieldLabel, MechanicList, numberOrNull, type MechanicConfig } from './mechanic-list';
import { describePrizes, PrizeEditor, type Prize } from './prize-editor';

interface Team {
  id: string;
  key: string;
  name: string;
  maxMembers: number | null;
  members: number;
  xp: number;
  rank: number;
}

interface TeamDraft {
  key: string;
  name: string;
  maxMembers: string;
}

const teamConfig: MechanicConfig<Team, TeamDraft> = {
  endpoint: '/teams',
  noun: 'team',
  icon: UsersRound,
  emptyTitle: 'No teams yet',
  emptyDescription: 'Make teams for players to join. A player is in one team at a time, and teams are ranked by the XP their members hold.',
  dialogDescription: 'Players join from your app, or your server places them with the API.',
  deleteMessage: 'Its members leave it, and its progress on team goals is removed. Nobody loses XP.',
  blank: () => ({ key: '', name: '', maxMembers: '' }),
  toDraft: (team) => ({ key: team.key, name: team.name, maxMembers: team.maxMembers === null ? '' : String(team.maxMembers) }),
  toBody: (draft, editing) => ({ ...(editing ? {} : { key: draft.key.trim() }), name: draft.name.trim(), maxMembers: numberOrNull(draft.maxMembers) }),
  title: (team) => team.name,
  badges: (team) => [{ label: `#${team.rank}`, variant: team.rank === 1 ? 'amber' : 'zinc' }],
  lines: (team) => [
    `${team.xp.toLocaleString()} XP between ${team.members.toLocaleString()} ${team.members === 1 ? 'member' : 'members'}`,
    team.maxMembers ? `Room for ${team.maxMembers.toLocaleString()}` : 'No size limit',
  ],
  form: (draft, set, _options, editing) => (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name *" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Red team" required />
        {!editing && <Input label="Key *" value={draft.key} onChange={(e) => set({ key: e.target.value })} placeholder="red" helperText="Used by the API. It cannot change later." required />}
      </div>
      <Input label="Most members" type="number" min={1} value={draft.maxMembers} onChange={(e) => set({ maxMembers: e.target.value })} helperText="Empty for no limit." />
    </>
  ),
};

interface Goal {
  id: string;
  key: string;
  name: string;
  description: string | null;
  scope: 'community' | 'team';
  trigger: string;
  amountField: string | null;
  target: number;
  startAt: string | null;
  endAt: string | null;
  rewards: Prize[];
  enabled: boolean;
  contributors: number;
  paid: number;
  progress: { team: { key: string; name: string } | null; progress: number; completedAt: string | null }[];
}

interface GoalDraft {
  key: string;
  name: string;
  description: string;
  scope: 'community' | 'team';
  trigger: string;
  amountField: string;
  target: string;
  startAt: string;
  endAt: string;
  rewards: Prize[];
}

const percent = (value: number, target: number) => Math.min(100, Math.floor((value / target) * 100));

const goalConfig: MechanicConfig<Goal, GoalDraft> = {
  endpoint: '/goals',
  noun: 'goal',
  icon: Flag,
  emptyTitle: 'No shared goals yet',
  emptyDescription: 'Set one target for everyone, such as a million lessons this month, or one for each team to race to. Everyone who helped gets the prize.',
  dialogDescription: 'Each matching event adds to the total. When it reaches the target, everyone who contributed is paid.',
  wide: true,
  toggles: true,
  deleteMessage: 'Its progress and the record of who contributed go with it. Prizes already paid stay with the players.',
  blank: () => ({ key: '', name: '', description: '', scope: 'community', trigger: '', amountField: '', target: '1000', startAt: '', endAt: '', rewards: [{ type: 'xp', amount: 100 }] }),
  toDraft: (goal) => ({
    key: goal.key,
    name: goal.name,
    description: goal.description ?? '',
    scope: goal.scope,
    trigger: goal.trigger,
    amountField: goal.amountField ?? '',
    target: String(goal.target),
    startAt: goal.startAt ? toDateTimeLocal(goal.startAt) : '',
    endAt: goal.endAt ? toDateTimeLocal(goal.endAt) : '',
    rewards: goal.rewards,
  }),
  toBody: (draft, editing) => ({
    ...(editing ? {} : { key: draft.key.trim(), scope: draft.scope }),
    name: draft.name.trim(),
    description: draft.description.trim() || null,
    trigger: draft.trigger.trim(),
    amountField: draft.amountField.trim() || null,
    target: numberOrNull(draft.target) ?? 0,
    startAt: draft.startAt ? new Date(draft.startAt).toISOString() : null,
    endAt: draft.endAt ? new Date(draft.endAt).toISOString() : null,
    rewards: draft.rewards,
  }),
  title: (goal) => goal.name,
  badges: (goal) => [{ label: goal.scope === 'team' ? 'Per team' : 'Everyone', variant: goal.scope === 'team' ? 'blue' : 'purple' }],
  lines: (goal) => [
    `${goal.target.toLocaleString()} from “${goal.trigger}”${goal.amountField ? `, adding up ${goal.amountField}` : ''}`,
    `Prize for each contributor: ${describePrizes(goal.rewards)}`,
    `${goal.contributors.toLocaleString()} ${goal.contributors === 1 ? 'player has' : 'players have'} contributed${goal.paid > 0 ? `, ${goal.paid.toLocaleString()} paid` : ''}.`,
  ],
  detail: (goal) =>
    goal.progress.length === 0 ? (
      <p className="text-xs text-zinc-500">Nothing counted yet.</p>
    ) : (
      <ul className="space-y-2">
        {goal.progress.slice(0, 5).map((line, index) => (
          <li key={index} className="text-xs">
            <div className="flex justify-between gap-3 text-zinc-300">
              <span>{line.team?.name ?? 'Everyone'}</span>
              <span className="font-mono">
                {line.progress.toLocaleString()} / {goal.target.toLocaleString()}
                {line.completedAt && <span className="ml-2 text-success-300">reached</span>}
              </span>
            </div>
            <div className="mt-1 h-1.5 bg-zinc-800" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent(line.progress, goal.target)} aria-label={`${line.team?.name ?? 'Everyone'}: progress`}>
              <div className="h-full bg-brand-500" style={{ width: `${percent(line.progress, goal.target)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    ),
  form: (draft, set, options, editing) => {
    const zone = localTimeZoneLabel();
    return (
      <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name *" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="A million lessons" required />
          {!editing && <Input label="Key *" value={draft.key} onChange={(e) => set({ key: e.target.value })} placeholder="million_lessons" helperText="Used by the API. It cannot change later." required />}
        </div>
        <Input label="Description" value={draft.description} onChange={(e) => set({ description: e.target.value })} />
        {!editing && (
          <div>
            <FieldLabel>Who works on it</FieldLabel>
            <Dropdown
              options={[
                { value: 'community', label: 'Everyone together', sublabel: 'One total for the whole project' },
                { value: 'team', label: 'Each team on its own', sublabel: 'One total per team. Players in no team do not count.' },
              ]}
              value={draft.scope}
              onChange={(scope) => set({ scope: scope as 'community' | 'team' })}
            />
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <Input label="Event that counts *" value={draft.trigger} onChange={(e) => set({ trigger: e.target.value })} placeholder="lesson_completed" required />
          <Input label="Target *" type="number" min={1} value={draft.target} onChange={(e) => set({ target: e.target.value })} required />
          <Input label="Add up a field" value={draft.amountField} onChange={(e) => set({ amountField: e.target.value })} placeholder="payload.distance" helperText="Empty counts each event as 1." />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Starts" type="datetime-local" value={draft.startAt} onChange={(e) => set({ startAt: e.target.value })} helperText={`In ${zone}. Empty starts now.`} />
          <Input label="Ends" type="datetime-local" value={draft.endAt} onChange={(e) => set({ endAt: e.target.value })} helperText={`In ${zone}. Empty never ends.`} />
        </div>
        <PrizeEditor label="Prize for everyone who contributed" value={draft.rewards} onChange={(rewards) => set({ rewards })} options={options} />
      </>
    );
  },
};

export function TeamsView() {
  const [tab, setTab] = useState<'teams' | 'goals'>('teams');
  return (
    <div className="space-y-6">
      <PageHeader title="Teams & goals" description="Teams that players join, and targets a team or the whole community reaches together." />
      <Tabs
        label="Teams and shared goals"
        items={[
          { id: 'teams', label: 'Teams' },
          { id: 'goals', label: 'Shared goals' },
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'teams' ? <MechanicList key="teams" config={teamConfig} /> : <MechanicList key="goals" config={goalConfig} />}
    </div>
  );
}
