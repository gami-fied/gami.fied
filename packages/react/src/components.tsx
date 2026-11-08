import { useEffect, type ReactNode } from 'react';
import {
  useAchievementProgress,
  useChallenges,
  useLeaderboard,
  useMe,
  useNotifications,
  useStreaks,
  type LeaderboardPeriod,
} from './hooks.js';
import { useGami } from './provider.js';
import { runDays } from './streak-days.js';

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
const percent = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 100);

function Status({ loading, error, empty, children }: { loading: boolean; error: Error | null; empty?: string | false; children: ReactNode }) {
  if (error) return <p className="gami-status gami-status-error" role="alert">Couldn&apos;t load this right now.</p>;
  if (loading) return <p className="gami-status" aria-busy="true">Loading…</p>;
  if (empty) return <p className="gami-status">{empty}</p>;
  return <>{children}</>;
}

export interface ProgressBarProps {
  /** 0 to 1. */
  fraction: number;
  label: string;
  /** Text shown on the right, such as "63 / 100". */
  detail?: ReactNode;
  className?: string;
}

/** A labelled bar. Screen readers get the percentage. */
export function ProgressBar({ fraction, label, detail, className }: ProgressBarProps) {
  const value = percent(fraction);
  return (
    <div className={cx('gami-progress', className)}>
      <div className="gami-progress-head">
        <span>{label}</span>
        {detail !== undefined && <span className="gami-muted">{detail}</span>}
      </div>
      <div className="gami-bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value}>
        <div className="gami-bar-fill" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

/** The player's level and how far they are to the next one. */
export function LevelProgress({ className }: { className?: string }) {
  const { data, loading, error } = useMe();
  return (
    <section className={cx('gami-card', className)} aria-label="Level">
      <Status loading={loading} error={error}>
        {data && (
          <>
            <div className="gami-row">
              <strong className="gami-big">{data.level ? `Level ${data.level.number}` : 'No level yet'}</strong>
              {data.level && <span className="gami-muted">{data.level.name}</span>}
              <span className="gami-spacer" />
              <span>{data.totalXp.toLocaleString()} XP</span>
            </div>
            {data.progressPercent !== null && (
              <ProgressBar
                fraction={data.progressPercent / 100}
                label="Progress to the next level"
                detail={data.xpToNextLevel !== null ? `${data.xpToNextLevel.toLocaleString()} XP to go` : undefined}
              />
            )}
          </>
        )}
      </Status>
    </section>
  );
}

export interface BadgeGridProps {
  /** Show badges the player has not earned yet, greyed out with their progress. Defaults to on. */
  showLocked?: boolean;
  className?: string;
}

/** Achievements as a grid of badges, with tiers and progress for the ones still being earned. */
export function BadgeGrid({ showLocked = true, className }: BadgeGridProps) {
  const { data, loading, error } = useAchievementProgress();
  const items = (data ?? []).filter((item) => showLocked || item.earned);
  return (
    <section className={cx('gami-card', className)} aria-label="Achievements">
      <Status loading={loading} error={error} empty={items.length === 0 && 'No achievements yet.'}>
        <ul className="gami-grid">
          {items.map((item) => (
            <li key={item.key} className={cx('gami-badge', !item.earned && 'gami-locked')}>
              <div className="gami-badge-icon" aria-hidden="true">
                {item.iconUrl ? <img src={item.iconUrl} alt="" /> : <span>{item.earned ? '★' : '☆'}</span>}
              </div>
              <div className="gami-badge-name">{item.name}</div>
              {item.tierName && <div className="gami-pill">{item.tierName}</div>}
              {item.description && <div className="gami-muted gami-small">{item.description}</div>}
              {!item.complete && item.nextTarget !== null && (
                <ProgressBar
                  fraction={item.fraction}
                  label={`${item.name} progress`}
                  detail={`${Math.floor(item.value).toLocaleString()} / ${item.nextTarget.toLocaleString()}`}
                />
              )}
              {item.complete && <div className="gami-small gami-done">Complete</div>}
            </li>
          ))}
        </ul>
      </Status>
    </section>
  );
}

export interface StreakCalendarProps {
  /** Show only this streak, by key. Otherwise every streak is shown. */
  streak?: string;
  /** How many weeks of days to draw for a daily streak. Defaults to 5. */
  weeks?: number;
  className?: string;
}

/** Each streak with its run drawn on a calendar, and a warning when it is about to end. */
export function StreakCalendar({ streak, weeks = 5, className }: StreakCalendarProps) {
  const { data, loading, error } = useStreaks();
  const items = (data ?? []).filter((item) => !streak || item.key === streak);
  return (
    <section className={cx('gami-card', className)} aria-label="Streaks">
      <Status loading={loading} error={error} empty={items.length === 0 && 'No streaks yet.'}>
        {items.map((item) => (
          <div key={item.key} className="gami-streak">
            <div className="gami-row">
              <strong>{item.name}</strong>
              {item.atRisk && item.current > 0 && <span className="gami-pill gami-warn">Do it today to keep it</span>}
              <span className="gami-spacer" />
              <span className="gami-big">{item.current}</span>
              <span className="gami-muted">{item.cadence === 'weekly' ? (item.current === 1 ? 'week' : 'weeks') : item.current === 1 ? 'day' : 'days'}</span>
            </div>
            {item.cadence === 'daily' ? (
              <ol className="gami-days" aria-label={`Last ${weeks} weeks`}>
                {runDays({ current: item.current, lastActivityAt: item.lastActivityAt, timeZone: item.timeZone, weeks }).map((day) => (
                  <li key={day.date} className={cx('gami-day', day.active && 'gami-day-on', day.today && 'gami-day-today')} title={day.date}>
                    <span className="gami-sr">{day.date}{day.active ? ', active' : ''}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="gami-muted gami-small">Best {item.longest} weeks</div>
            )}
            <div className="gami-muted gami-small">
              Best {item.longest}
              {item.freezes > 0 && ` · ${item.freezes} freeze${item.freezes === 1 ? '' : 's'} saved`}
            </div>
          </div>
        ))}
      </Status>
    </section>
  );
}

export interface LeaderboardProps {
  period?: LeaderboardPeriod;
  /** How many players to show. Defaults to 10. */
  limit?: number;
  className?: string;
}

/** The top players, with the player's own place pinned below when they are not in the list. */
export function Leaderboard({ period = 'all_time', limit = 10, className }: LeaderboardProps) {
  const { data, loading, error } = useLeaderboard(period, limit);
  const entries = data?.entries ?? [];
  const meVisible = entries.some((entry) => entry.isMe);
  return (
    <section className={cx('gami-card', className)} aria-label="Leaderboard">
      <Status loading={loading} error={error} empty={entries.length === 0 && 'No one is on the board yet.'}>
        <ol className="gami-board">
          {entries.map((entry) => (
            <li key={entry.rank} className={cx('gami-board-row', entry.isMe && 'gami-me')}>
              <span className="gami-rank">{entry.rank}</span>
              <span className="gami-name">{entry.name ?? 'Player'}{entry.isMe && ' (you)'}</span>
              <span className="gami-xp">{entry.xp.toLocaleString()} XP</span>
            </li>
          ))}
          {data?.me && !meVisible && (
            <li className="gami-board-row gami-me gami-pinned">
              <span className="gami-rank">{data.me.rank}</span>
              <span className="gami-name">{data.me.name ?? 'You'} (you)</span>
              <span className="gami-xp">{data.me.xp.toLocaleString()} XP</span>
            </li>
          )}
        </ol>
      </Status>
    </section>
  );
}

/** Challenges that are open now, with steps and when repeating ones start over. */
export function ChallengeList({ className }: { className?: string }) {
  const { data, loading, error } = useChallenges();
  const items = data ?? [];
  return (
    <section className={cx('gami-card', className)} aria-label="Challenges">
      <Status loading={loading} error={error} empty={items.length === 0 && 'No challenges right now.'}>
        <ul className="gami-list">
          {items.map((item) => (
            <li key={item.key} className="gami-challenge">
              <div className="gami-row">
                <strong>{item.name}</strong>
                {item.recurrence && <span className="gami-pill">{item.recurrence === 'daily' ? 'Daily' : 'Weekly'}</span>}
                {item.completed && <span className="gami-pill gami-done">Done</span>}
              </div>
              {item.description && <div className="gami-muted gami-small">{item.description}</div>}
              <ProgressBar fraction={item.target > 0 ? item.progress / item.target : 0} label={`${item.name} progress`} detail={`${item.progress} / ${item.target}`} />
              {item.steps && (
                <ol className="gami-steps">
                  {item.steps.map((step, index) => (
                    <li key={`${step.name}-${index}`} className={cx(step.done && 'gami-step-done')}>
                      <span aria-hidden="true">{step.done ? '✓' : '○'}</span> {step.name}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      </Status>
    </section>
  );
}

/** Recent notifications, with new ones appearing as they happen. */
export function NotificationFeed({ limit = 10, className }: { limit?: number; className?: string }) {
  const { data, loading, error } = useNotifications(limit);
  const items = data ?? [];
  return (
    <section className={cx('gami-card', className)} aria-label="Notifications">
      <Status loading={loading} error={error} empty={items.length === 0 && 'Nothing new yet.'}>
        <ul className="gami-list">
          {items.map((item) => (
            <li key={item.id} className="gami-note">
              <div className="gami-note-title">{item.title}</div>
              <div className="gami-muted gami-small">{item.message}</div>
            </li>
          ))}
        </ul>
      </Status>
    </section>
  );
}

export interface ToastHostProps {
  /** How long each toast stays, in milliseconds. Defaults to 5000. */
  duration?: number;
  /** Where to put the stack. Defaults to the bottom right. */
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  /** Draw a toast yourself instead of the default. */
  renderToast?: (notification: { id: string; title: string; message: string; type: string }) => ReactNode;
}

/** Shows a toast the moment the player earns XP, a badge, a level or a challenge. Needs live updates on. */
export function ToastHost({ duration = 5000, position = 'bottom-right', renderToast }: ToastHostProps) {
  const { notifications, dismiss } = useGami();
  const visible = notifications.slice(0, 4);

  useEffect(() => {
    if (visible.length === 0) return;
    const timers = visible.map((item) => setTimeout(() => dismiss(item.id), duration));
    return () => timers.forEach(clearTimeout);
  }, [visible.map((item) => item.id).join(','), duration, dismiss]);

  return (
    <div className={cx('gami-toasts', `gami-toasts-${position}`)} role="status" aria-live="polite">
      {visible.map((item) => (
        <div key={item.id} className={cx('gami-toast', `gami-toast-${item.type}`)}>
          {renderToast ? (
            renderToast(item)
          ) : (
            <>
              <div className="gami-toast-title">{item.title}</div>
              <div className="gami-small">{item.message}</div>
            </>
          )}
          <button type="button" className="gami-toast-close" onClick={() => dismiss(item.id)} aria-label="Dismiss">
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
