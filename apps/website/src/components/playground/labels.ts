import type { Effect, PlaygroundSetup } from '../../lib/playground/simulate';

export type Tone = 'xp' | 'level' | 'badge' | 'currency' | 'streak' | 'muted';

/** A short, plain description of one thing the engine did. */
export function effectLabel(effect: Effect, setup: PlaygroundSetup): { text: string; tone: Tone } {
  switch (effect.kind) {
    case 'xp':
      return { text: `+${effect.amount} XP`, tone: 'xp' };
    case 'level':
      return { text: `Reached level ${effect.level}, ${effect.name}`, tone: 'level' };
    case 'badge':
      return { text: `Unlocked ${effect.name}`, tone: 'badge' };
    case 'badge_repeat':
      return { text: `${effect.name} already unlocked, skipped`, tone: 'muted' };
    case 'currency': {
      const currency = setup.currencies.find((item) => item.key === effect.currency);
      return { text: `+${effect.amount} ${currency?.name ?? effect.currency}`, tone: 'currency' };
    }
    case 'streak': {
      const what = {
        started: `${effect.name} started`,
        extended: `${effect.name} is ${effect.current} in a row`,
        frozen: `${effect.name} saved by ${effect.freezesUsed === 1 ? 'a freeze' : `${effect.freezesUsed} freezes`}, now ${effect.current}`,
        reset: `${effect.name} restarted`,
        same_period: '',
        ignored: '',
      }[effect.change];
      return { text: effect.freezesEarned ? `${what}, earned a freeze` : what, tone: 'streak' };
    }
    case 'plugin':
      return { text: `${effect.type} would run on a real install`, tone: 'muted' };
  }
}

export const TONES: Record<Tone, string> = {
  // Quiet tags: one grey frame, with the colour in the text, so orange stays for the main action.
  xp: 'border-zinc-800 bg-zinc-900/60 text-warning-300',
  level: 'border-zinc-800 bg-zinc-900/60 text-zinc-100',
  badge: 'border-zinc-800 bg-zinc-900/60 text-info-300',
  currency: 'border-zinc-800 bg-zinc-900/60 text-success-300',
  streak: 'border-zinc-800 bg-zinc-900/60 text-zinc-200',
  muted: 'border-zinc-800 bg-zinc-900/60 text-zinc-400',
};

/** "2 days ago", "in 3 hours", or the date for anything further away. */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = new Date(iso).getTime() - now;
  const minutes = Math.round(diff / 60_000);
  const format = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return format.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return format.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return format.format(days, 'day');
  return new Date(iso).toLocaleDateString('en', { day: 'numeric', month: 'short' });
}
