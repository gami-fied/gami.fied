import '@gami.fied/react/styles.css';
import { BadgeGrid, ChallengeList, GamiProvider, Leaderboard, LevelProgress, NotificationFeed, StreakCalendar } from '@gami.fied/react';
import type { Gami } from '@gami.fied/sdk';
import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Every ready-made component, live, with made-up data. Nothing is fetched: the components get a
 * stand-in for the SDK client that answers from this file, so the page works without a server.
 */
const now = Date.now();
const daysAgo = (days: number) => new Date(now - days * 86_400_000).toISOString();

const SAMPLE = {
  me: { externalId: 'user_123', name: 'Ada', totalXp: 1840, level: { number: 7, name: 'Explorer' }, xpToNextLevel: 660, progressPercent: 62 },
  streaks: [
    { key: 'daily_lesson', name: 'Daily lesson', cadence: 'daily' as const, current: 12, longest: 21, freezes: 1, atRisk: true, timeZone: 'UTC', lastActivityAt: daysAgo(1) },
    { key: 'weekly_goal', name: 'Weekly goal', cadence: 'weekly' as const, current: 4, longest: 9, freezes: 0, atRisk: false, timeZone: 'UTC', lastActivityAt: daysAgo(2) },
  ],
  achievements: [
    { key: 'first_lesson', name: 'First lesson', description: 'Finish a lesson.', iconUrl: null, earned: true, tier: 1, tierCount: 1, tierName: null, value: 1, nextTarget: null, fraction: 1, complete: true },
    { key: 'bookworm', name: 'Bookworm', description: 'Finish 100 lessons.', iconUrl: null, earned: true, tier: 2, tierCount: 3, tierName: 'Silver', value: 64, nextTarget: 100, fraction: 0.64, complete: false },
    { key: 'polyglot', name: 'Polyglot', description: 'Learn in three languages.', iconUrl: null, earned: false, tier: 0, tierCount: 1, tierName: null, value: 2, nextTarget: 3, fraction: 0.67, complete: false },
    { key: 'night_owl', name: 'Night owl', description: 'Study after midnight.', iconUrl: null, earned: false, tier: 0, tierCount: 1, tierName: null, value: 0, nextTarget: 1, fraction: 0, complete: false },
  ],
  challenges: [
    { key: 'five_lessons', name: 'Five lessons this week', description: 'Any language counts.', iconUrl: null, type: 'counter' as const, recurrence: 'weekly' as const, target: 5, progress: 3, completed: false, periodEndsAt: new Date(now + 3 * 86_400_000).toISOString(), steps: null },
    {
      key: 'getting_started',
      name: 'Getting started',
      description: null,
      iconUrl: null,
      type: 'steps' as const,
      recurrence: null,
      target: 3,
      progress: 2,
      completed: false,
      periodEndsAt: null,
      steps: [
        { name: 'Pick a language', done: true },
        { name: 'Finish a lesson', done: true },
        { name: 'Invite a friend', done: false },
      ],
    },
  ],
  leaderboard: [
    { rank: 1, name: 'Grace', avatarUrl: null, xp: 2310, levelName: 'Voyager', isMe: false },
    { rank: 2, name: 'Linus', avatarUrl: null, xp: 2075, levelName: 'Voyager', isMe: false },
    { rank: 3, name: 'Ada', avatarUrl: null, xp: 1840, levelName: 'Explorer', isMe: true },
    { rank: 4, name: 'Margaret', avatarUrl: null, xp: 1620, levelName: 'Explorer', isMe: false },
    { rank: 5, name: 'Alan', avatarUrl: null, xp: 1410, levelName: 'Explorer', isMe: false },
  ],
  notifications: [
    { id: 'n1', type: 'achievement_unlocked', title: 'Badge unlocked', message: 'Bookworm, Silver tier', createdAt: daysAgo(0) },
    { id: 'n2', type: 'level_up', title: 'Level 7 reached', message: 'You are now an Explorer.', createdAt: daysAgo(1) },
    { id: 'n3', type: 'xp_awarded', title: '+50 XP', message: 'Lesson completed', createdAt: daysAgo(1) },
  ],
};

const sampleClient = {
  me: {
    get: async () => SAMPLE.me,
    streaks: async () => ({ data: SAMPLE.streaks }),
    achievementProgress: async () => ({ data: SAMPLE.achievements }),
    challenges: async () => ({ data: SAMPLE.challenges }),
    notifications: async () => ({ data: SAMPLE.notifications.map((item, index) => ({ ...item, read: index > 0, readAt: index > 0 ? item.createdAt : null })), unreadCount: 1, hasMore: false }),
    leaderboard: async ({ period = 'all_time', limit = 10 }: { period?: string; limit?: number } = {}) => ({
      period,
      total: 36,
      entries: SAMPLE.leaderboard.slice(0, limit),
      me: SAMPLE.leaderboard[2]!,
    }),
    subscribe: () => ({ close: () => undefined }),
  },
} as unknown as Gami;

const ACCENTS = [
  { name: 'Orange', value: '#ea580c' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Violet', value: '#7c3aed' },
];

const THEMES = {
  light: { '--gami-bg': '#ffffff', '--gami-fg': '#18181b', '--gami-muted': '#52525b', '--gami-border': '#e4e4e7', '--gami-track': '#e4e4e7' },
  dark: { '--gami-bg': '#18181b', '--gami-fg': '#f4f4f5', '--gami-muted': '#a1a1aa', '--gami-border': '#3f3f46', '--gami-track': '#3f3f46' },
};

const COMPONENTS: { name: string; code: string; note: string; render: () => ReactNode }[] = [
  { name: 'LevelProgress', code: '<LevelProgress />', note: "The player's level and how far they are to the next one.", render: () => <LevelProgress /> },
  { name: 'StreakCalendar', code: '<StreakCalendar />', note: 'Each streak on a calendar, with a warning when it is about to end.', render: () => <StreakCalendar /> },
  { name: 'BadgeGrid', code: '<BadgeGrid showLocked />', note: 'Earned badges, and locked ones with their progress.', render: () => <BadgeGrid /> },
  { name: 'ChallengeList', code: '<ChallengeList />', note: 'Open challenges, with steps or a count.', render: () => <ChallengeList /> },
  { name: 'Leaderboard', code: '<Leaderboard period="weekly" limit={5} />', note: 'The top players and the player’s own place.', render: () => <Leaderboard limit={5} /> },
  { name: 'NotificationFeed', code: '<NotificationFeed limit={3} />', note: 'What the player earned lately.', render: () => <NotificationFeed limit={3} /> },
];

export default function ComponentGallery() {
  const [theme, setTheme] = useState<keyof typeof THEMES>('dark');
  const [accent, setAccent] = useState(ACCENTS[0]!.value);
  const [radius, setRadius] = useState(8);
  const [copied, setCopied] = useState<string | null>(null);

  // The components read these variables, so restyling is setting them on a parent.
  const style = useMemo(() => ({ ...THEMES[theme], '--gami-accent': accent, '--gami-radius': `${radius}px` }) as unknown as CSSProperties, [theme, accent, radius]);
  const css = `.my-app {\n  --gami-accent: ${accent};\n  --gami-radius: ${radius}px;\n}`;

  const copy = async (name: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(name);
      window.setTimeout(() => setCopied((current) => (current === name ? null : current)), 1600);
    } catch {
      // Copying needs a secure page. The code is on screen either way.
    }
  };

  const control = 'border px-3 py-2 text-sm transition-colors';
  const on = 'border-brand-500 bg-brand-500/10 text-zinc-50';
  const off = 'border-zinc-700 text-zinc-300 hover:border-zinc-500';

  return (
    <div className="space-y-8">
      <div className="grid gap-6 border border-zinc-800 bg-zinc-900/30 p-5 md:grid-cols-3">
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Theme</legend>
          <div className="mt-2 flex gap-2">
            {(['dark', 'light'] as const).map((option) => (
              <button key={option} type="button" aria-pressed={theme === option} onClick={() => setTheme(option)} className={`${control} ${theme === option ? on : off}`}>
                {option === 'dark' ? 'Dark' : 'Light'}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Accent</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCENTS.map((option) => (
              <button key={option.value} type="button" aria-pressed={accent === option.value} onClick={() => setAccent(option.value)} className={`${control} flex items-center gap-2 ${accent === option.value ? on : off}`}>
                <span className="h-3 w-3" style={{ background: option.value }} aria-hidden="true" />
                {option.name}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="gallery-radius" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Corners: {radius}px
          </label>
          <input id="gallery-radius" type="range" min={0} max={16} value={radius} onChange={(event) => setRadius(Number(event.target.value))} className="mt-4 block w-full accent-brand-500" />
        </div>
      </div>

      <GamiProvider client={sampleClient} live={false}>
        <div className="grid gap-6 lg:grid-cols-2" style={style}>
          {COMPONENTS.map((item) => (
            <section key={item.name} className="flex flex-col border border-zinc-800 bg-zinc-950">
              <header className="border-b border-zinc-800 px-4 py-3">
                <h2 className="font-mono text-sm font-semibold text-zinc-100">{item.name}</h2>
                <p className="mt-1 text-xs text-zinc-400">{item.note}</p>
              </header>
              <div className={`flex-1 p-4 ${theme === 'light' ? 'bg-zinc-100' : 'bg-zinc-900/40'}`}>{item.render()}</div>
              <footer className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-2">
                <code className="overflow-x-auto whitespace-nowrap font-mono text-xs text-zinc-300">{item.code}</code>
                <button type="button" onClick={() => void copy(item.name, item.code)} className="shrink-0 text-xs text-brand-400 hover:text-brand-300">
                  {copied === item.name ? 'Copied' : 'Copy'}
                </button>
              </footer>
            </section>
          ))}
        </div>
      </GamiProvider>

      <div className="border border-zinc-800 bg-zinc-950">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-zinc-100">Your theme, as CSS</h2>
          <button type="button" onClick={() => void copy('css', css)} className="text-xs text-brand-400 hover:text-brand-300">
            {copied === 'css' ? 'Copied' : 'Copy'}
          </button>
        </div>
        <pre tabIndex={0} className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-zinc-300">
          {css}
        </pre>
      </div>
    </div>
  );
}
