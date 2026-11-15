import type { BoxOpenResult, PlayerBox, Prize } from '@gami.fied/sdk';
import { useState } from 'react';
import { cx, ProgressBar, Status } from './components.js';
import { useBoxes, useCosmetics, useGoals, useJourneys, usePasses, useTeam } from './hooks.js';
import { useGami } from './provider.js';

/** A short line for a list of prizes, such as "50 XP, 20 gems". */
export function prizeText(prizes: Prize[]): string {
  if (prizes.length === 0) return 'Nothing';
  return prizes
    .map((prize) => {
      if (prize.type === 'xp') return `${prize.amount.toLocaleString()} XP`;
      if (prize.type === 'currency') return `${prize.amount.toLocaleString()} ${prize.currency}`;
      if (prize.type === 'achievement') return 'a badge';
      return 'a cosmetic';
    })
    .join(', ');
}

/** What the server said when an action was refused, in the player's words. */
const reason = (error: unknown) => (error instanceof Error && error.message ? error.message : 'That did not work. Try again.');

/** Runs one action at a time, keeps what went wrong, and refreshes everything afterwards. */
function useAction() {
  const { refresh } = useGami();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async <T,>(name: string, action: () => Promise<T>): Promise<T | undefined> => {
    setBusy(name);
    setError(null);
    try {
      const result = await action();
      refresh();
      return result;
    } catch (err) {
      setError(reason(err));
      return undefined;
    } finally {
      setBusy(null);
    }
  };
  return { busy, error, run };
}

export interface MysteryBoxProps {
  /** Show only this box. By default every box is shown. */
  box?: string;
  /** Called with what a try gave, for your own animation. */
  onOpen?: (result: BoxOpenResult, box: PlayerBox) => void;
  className?: string;
}

/**
 * Boxes and wheels the player can open, each with its odds. Opening needs a token created with
 * `access: 'write'`. The drop table is always shown: published odds are what keeps this fair.
 */
export function MysteryBox({ box, onOpen, className }: MysteryBoxProps) {
  const { client } = useGami();
  const { data, loading, error } = useBoxes();
  const action = useAction();
  const [last, setLast] = useState<{ box: string; result: BoxOpenResult } | null>(null);
  const items = (data ?? []).filter((item) => !box || item.key === box);

  const open = async (item: PlayerBox) => {
    const result = await action.run(item.key, () => client.me.openBox(item.key, { idempotencyKey: `${item.key}-${Date.now()}-${Math.random().toString(36).slice(2)}` }));
    if (!result) return;
    setLast({ box: item.key, result });
    onOpen?.(result, item);
  };

  return (
    <section className={cx('gami-card', className)} aria-label="Mystery boxes">
      <Status loading={loading} error={error} empty={items.length === 0 && 'Nothing to open right now.'}>
        <ul className="gami-list">
          {items.map((item) => {
            const outOfTries = item.triesLeftToday === 0;
            return (
              <li key={item.key} className="gami-box">
                <div className="gami-row">
                  <strong>{item.name}</strong>
                  <span className="gami-pill">{item.cost > 0 ? `${item.cost.toLocaleString()} ${item.currencySymbol ?? item.currencyName ?? ''}`.trim() : 'Free'}</span>
                  <span className="gami-spacer" />
                  <button type="button" className="gami-button" onClick={() => void open(item)} disabled={action.busy !== null || outOfTries || !item.affordable}>
                    {action.busy === item.key ? 'Opening…' : item.kind === 'wheel' ? 'Spin' : 'Open'}
                  </button>
                </div>
                {item.description && <div className="gami-muted gami-small">{item.description}</div>}
                <div className="gami-muted gami-small">
                  {outOfTries ? 'No tries left today. ' : item.triesLeftToday !== null ? `${item.triesLeftToday} left today. ` : ''}
                  {!item.affordable && !outOfTries ? 'Not enough to open. ' : ''}
                  {item.triesUntilGuarantee !== null && (item.triesUntilGuarantee === 0 ? 'Your next try is sure to be rare.' : `A rare item is sure within ${item.triesUntilGuarantee + 1} tries.`)}
                </div>
                {last?.box === item.key && (
                  <p className="gami-result" role="status">
                    You got <strong>{last.result.item.name}</strong>
                    {last.result.prizes.length > 0 && `: ${prizeText(last.result.prizes)}`}
                    {last.result.guaranteed && ' (guaranteed)'}
                  </p>
                )}
                <details className="gami-odds">
                  <summary>Odds</summary>
                  <table>
                    <caption className="gami-sr">Chance of each item in {item.name}</caption>
                    <tbody>
                      {item.items.map((drop) => (
                        <tr key={drop.id}>
                          <th scope="row">
                            {drop.name}
                            {drop.rare && <span className="gami-pill gami-warn">Rare</span>}
                          </th>
                          <td className="gami-muted">{prizeText(drop.prizes)}</td>
                          <td>{drop.chance}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              </li>
            );
          })}
        </ul>
        {action.error && (
          <p className="gami-status gami-status-error" role="alert">
            {action.error}
          </p>
        )}
      </Status>
    </section>
  );
}

export interface SeasonPassProps {
  /** Show only this pass. By default the first running pass is shown. */
  pass?: string;
  className?: string;
}

/** The season pass: season XP, each tier on the free and premium lanes, and a button to claim what is ready. */
export function SeasonPass({ pass, className }: SeasonPassProps) {
  const { client } = useGami();
  const { data, loading, error } = usePasses();
  const action = useAction();
  const list = data ?? [];
  const current = pass ? list.find((item) => item.key === pass) : (list.find((item) => item.status === 'active') ?? list[0]);
  const ready = current ? current.tiers.reduce((sum, tier) => sum + (tier.free.claimable ? 1 : 0) + (tier.premium.claimable ? 1 : 0), 0) : 0;
  const top = current?.tiers[current.tiers.length - 1]?.xp ?? 0;

  return (
    <section className={cx('gami-card', className)} aria-label="Season pass">
      <Status loading={loading} error={error} empty={!current && 'No season is running.'}>
        {current && (
          <>
            <div className="gami-row">
              <strong className="gami-big">{current.name}</strong>
              <span className="gami-muted">
                {current.status === 'upcoming' ? `Starts ${new Date(current.startAt).toLocaleDateString()}` : current.status === 'ended' ? 'Ended' : `Ends ${new Date(current.endAt).toLocaleDateString()}`}
              </span>
              <span className="gami-spacer" />
              {ready > 0 && (
                <button type="button" className="gami-button" onClick={() => void action.run('claim', () => client.me.claimPass(current.key))} disabled={action.busy !== null}>
                  {action.busy === 'claim' ? 'Claiming…' : `Claim ${ready} ${ready === 1 ? 'reward' : 'rewards'}`}
                </button>
              )}
            </div>
            <ProgressBar
              fraction={top > 0 ? current.xp / top : 0}
              label="Season progress"
              detail={current.xpToNextTier !== null ? `${current.xpToNextTier.toLocaleString()} XP to tier ${current.tier + 1}` : 'Every tier reached'}
            />
            <ol className="gami-tiers">
              {current.tiers.map((tier) => (
                <li key={tier.tier} className={cx('gami-tier', tier.unlocked && 'gami-tier-open')}>
                  <span className="gami-rank">{tier.tier}</span>
                  <span className={cx(tier.free.claimed && 'gami-done')}>
                    {prizeText(tier.free.prizes)}
                    {tier.free.claimed && ' ✓'}
                  </span>
                  {current.premium.available && (
                    <span className={cx('gami-premium', !current.premium.owned && 'gami-locked', tier.premium.claimed && 'gami-done')}>
                      {tier.premium.prizes.length > 0 ? prizeText(tier.premium.prizes) : ''}
                      {tier.premium.claimed && ' ✓'}
                    </span>
                  )}
                  <span className="gami-muted gami-small">{tier.xp.toLocaleString()} XP</span>
                </li>
              ))}
            </ol>
            {current.premium.available && !current.premium.owned && current.status === 'active' && (
              <div className="gami-row">
                <span className="gami-muted gami-small">The premium lane adds a second reward to each tier.</span>
                <span className="gami-spacer" />
                <button type="button" className="gami-button" onClick={() => void action.run('premium', () => client.me.buyPassPremium(current.key))} disabled={action.busy !== null || !current.premium.affordable}>
                  {action.busy === 'premium' ? 'Buying…' : `Get premium: ${current.premium.cost?.toLocaleString()} ${current.premium.currencySymbol ?? current.premium.currencyName ?? ''}`.trim()}
                </button>
              </div>
            )}
            {action.error && (
              <p className="gami-status gami-status-error" role="alert">
                {action.error}
              </p>
            )}
          </>
        )}
      </Status>
    </section>
  );
}

/** Shared goals: the total so far for everyone or for the player's team, and what the player added. */
export function SharedGoals({ className }: { className?: string }) {
  const { data, loading, error } = useGoals();
  const items = data ?? [];
  return (
    <section className={cx('gami-card', className)} aria-label="Shared goals">
      <Status loading={loading} error={error} empty={items.length === 0 && 'No shared goals right now.'}>
        <ul className="gami-list">
          {items.map((goal) => (
            <li key={goal.key} className="gami-challenge">
              <div className="gami-row">
                <strong>{goal.name}</strong>
                <span className="gami-pill">{goal.scope === 'team' ? (goal.team?.name ?? 'Team') : 'Everyone'}</span>
                {goal.completed && <span className="gami-pill gami-done">Reached</span>}
              </div>
              {goal.description && <div className="gami-muted gami-small">{goal.description}</div>}
              {goal.scope === 'team' && !goal.team ? (
                <div className="gami-muted gami-small">Join a team to take part.</div>
              ) : (
                <ProgressBar fraction={goal.progress / goal.target} label={`${goal.name} progress`} detail={`${goal.progress.toLocaleString()} / ${goal.target.toLocaleString()}`} />
              )}
              <div className="gami-muted gami-small">
                You added {goal.myContribution.toLocaleString()}.{goal.rewards.length > 0 && ` Everyone who helps gets ${prizeText(goal.rewards)}.`}
              </div>
            </li>
          ))}
        </ul>
      </Status>
    </section>
  );
}

/** The player's team: its place among the teams and who is in it. */
export function TeamCard({ className }: { className?: string }) {
  const { data, loading, error } = useTeam();
  return (
    <section className={cx('gami-card', className)} aria-label="Team">
      <Status loading={loading} error={error} empty={!data && 'You are not in a team yet.'}>
        {data && (
          <>
            <div className="gami-row">
              <strong className="gami-big">{data.name}</strong>
              {data.rank !== null && (
                <span className="gami-muted">
                  #{data.rank} of {data.teams}
                </span>
              )}
              <span className="gami-spacer" />
              <span>{data.xp.toLocaleString()} XP</span>
            </div>
            <ol className="gami-board">
              {data.roster.map((member, index) => (
                <li key={index} className={cx('gami-board-row', member.isMe && 'gami-me')}>
                  <span className="gami-rank">{index + 1}</span>
                  <span className="gami-name">
                    {member.name ?? 'Player'}
                    {member.isMe && ' (you)'}
                  </span>
                  <span className="gami-xp">{member.xp.toLocaleString()} XP</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </Status>
    </section>
  );
}

/** Journeys: each step in order, with a lock on the ones that are not open yet. */
export function JourneyPath({ journey, className }: { journey?: string; className?: string }) {
  const { data, loading, error } = useJourneys();
  const items = (data ?? []).filter((item) => !journey || item.key === journey);
  return (
    <section className={cx('gami-card', className)} aria-label="Journeys">
      <Status loading={loading} error={error} empty={items.length === 0 && 'No journeys right now.'}>
        <ul className="gami-list">
          {items.map((item) => (
            <li key={item.key} className="gami-challenge">
              <div className="gami-row">
                <strong>{item.name}</strong>
                <span className="gami-muted gami-small">
                  {item.stepsDone} of {item.steps.length} done
                </span>
                {item.completed && <span className="gami-pill gami-done">Finished</span>}
              </div>
              {item.description && <div className="gami-muted gami-small">{item.description}</div>}
              <ol className="gami-path">
                {item.steps.map((step) => (
                  <li key={step.challenge} className={cx('gami-path-step', step.completed && 'gami-step-done', step.locked && 'gami-locked')}>
                    <span aria-hidden="true">{step.completed ? '✓' : step.locked ? '🔒' : '○'}</span>
                    <span>
                      {step.name}
                      <span className="gami-sr">{step.completed ? ', done' : step.locked ? ', locked until the step before is finished' : ', open'}</span>
                    </span>
                    {!step.completed && !step.locked && (
                      <span className="gami-muted gami-small">
                        {step.progress} / {step.target}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
              {item.rewards.length > 0 && !item.completed && <div className="gami-muted gami-small">Finish it for {prizeText(item.rewards)}.</div>}
            </li>
          ))}
        </ul>
      </Status>
    </section>
  );
}

const KIND_LABEL = { title: 'Titles', frame: 'Frames', item: 'Items' } as const;

/** The player's cosmetics: what they own and wear, and how to get the rest. Buying and wearing need a `write` token. */
export function CosmeticLocker({ className }: { className?: string }) {
  const { client } = useGami();
  const { data, loading, error } = useCosmetics();
  const action = useAction();
  const items = data ?? [];
  return (
    <section className={cx('gami-card', className)} aria-label="Cosmetics">
      <Status loading={loading} error={error} empty={items.length === 0 && 'Nothing to collect yet.'}>
        {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((kind) => {
          const group = items.filter((item) => item.kind === kind);
          if (group.length === 0) return null;
          return (
            <div key={kind} className="gami-challenge">
              <strong>{KIND_LABEL[kind]}</strong>
              <ul className="gami-list">
                {group.map((item) => (
                  <li key={item.key} className={cx('gami-row', !item.owned && 'gami-locked')}>
                    {item.imageUrl && <img src={item.imageUrl} alt="" width={28} height={28} className="gami-cosmetic-image" />}
                    <span>{item.name}</span>
                    {item.equipped && <span className="gami-pill gami-done">Wearing</span>}
                    <span className="gami-spacer" />
                    {item.owned ? (
                      <button
                        type="button"
                        className="gami-button"
                        disabled={action.busy !== null}
                        onClick={() => void action.run(item.key, () => (item.equipped ? client.me.unequipCosmetic(item.key) : client.me.equipCosmetic(item.key)))}
                      >
                        {item.equipped ? 'Take off' : 'Wear'}
                      </button>
                    ) : item.cost !== null ? (
                      <button type="button" className="gami-button" disabled={action.busy !== null || !item.affordable} onClick={() => void action.run(item.key, () => client.me.buyCosmetic(item.key))}>
                        Buy: {item.cost.toLocaleString()} {item.currencySymbol ?? item.currency}
                      </button>
                    ) : (
                      <span className="gami-muted gami-small">{item.achievement ? `Earn “${item.achievement.name}”` : 'Win it as a prize'}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {action.error && (
          <p className="gami-status gami-status-error" role="alert">
            {action.error}
          </p>
        )}
      </Status>
    </section>
  );
}
