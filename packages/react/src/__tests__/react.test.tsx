import { Gami } from '@gami.fied/sdk';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BadgeGrid, GamiProvider, Leaderboard, LevelProgress, ProgressBar, StreakCalendar, ToastHost, runDays } from '../index.js';

const client = new Gami({ endUserToken: 'geu_test', baseUrl: 'http://api.test' });

describe('ProgressBar', () => {
  it('labels the bar for screen readers and clamps the value', () => {
    const html = renderToStaticMarkup(<ProgressBar fraction={0.634} label="Level 2" detail="63 / 100" />);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Level 2"');
    expect(html).toContain('aria-valuenow="63"');
    expect(html).toContain('width:63%');
    expect(renderToStaticMarkup(<ProgressBar fraction={4} label="x" />)).toContain('aria-valuenow="100"');
    expect(renderToStaticMarkup(<ProgressBar fraction={-1} label="x" />)).toContain('aria-valuenow="0"');
  });
});

describe('components', () => {
  it('show a loading state before data arrives, inside a provider', () => {
    const html = renderToStaticMarkup(
      <GamiProvider client={client} live={false}>
        <LevelProgress />
        <BadgeGrid />
        <StreakCalendar />
        <Leaderboard period="weekly" />
      </GamiProvider>
    );
    expect(html.match(/aria-busy="true"/g)).toHaveLength(4);
    expect(html).toContain('aria-label="Level"');
    expect(html).toContain('aria-label="Achievements"');
    expect(html).toContain('aria-label="Streaks"');
    expect(html).toContain('aria-label="Leaderboard"');
  });

  it('draws the toast area as a polite live region', () => {
    const html = renderToStaticMarkup(
      <GamiProvider client={client} live={false}>
        <ToastHost position="top-left" />
      </GamiProvider>
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('gami-toasts-top-left');
  });

  it('explain themselves when used outside the provider', () => {
    expect(() => renderToStaticMarkup(<LevelProgress />)).toThrow('inside <GamiProvider>');
  });

  it('need a client or a token', () => {
    expect(() => renderToStaticMarkup(<GamiProvider live={false}>x</GamiProvider>)).toThrow('client');
  });
});

describe('runDays', () => {
  const now = new Date('2026-03-18T12:00:00Z'); // a Wednesday

  it('draws whole Monday-to-Sunday weeks ending with this one', () => {
    const days = runDays({ current: 0, lastActivityAt: null, timeZone: 'UTC', weeks: 2, now });
    expect(days).toHaveLength(14);
    expect(days[0]!.date).toBe('2026-03-09'); // a Monday
    expect(days.at(-1)!.date).toBe('2026-03-22'); // the Sunday after today
    expect(days.filter((day) => day.today).map((day) => day.date)).toEqual(['2026-03-18']);
    expect(days.some((day) => day.active)).toBe(false);
  });

  it('marks the days of the current run, ending on the last active day', () => {
    const days = runDays({ current: 3, lastActivityAt: '2026-03-18T08:00:00Z', timeZone: 'UTC', weeks: 2, now });
    expect(days.filter((day) => day.active).map((day) => day.date)).toEqual(['2026-03-16', '2026-03-17', '2026-03-18']);
  });

  it('shows a run that has not been continued today', () => {
    const days = runDays({ current: 2, lastActivityAt: '2026-03-17T20:00:00Z', timeZone: 'UTC', weeks: 1, now });
    expect(days.filter((day) => day.active).map((day) => day.date)).toEqual(['2026-03-16', '2026-03-17']);
  });

  it("uses the player's own time zone", () => {
    // 20:00 UTC on the 17th is already the 18th in Tokyo.
    const days = runDays({ current: 1, lastActivityAt: '2026-03-17T20:00:00Z', timeZone: 'Asia/Tokyo', weeks: 1, now });
    expect(days.filter((day) => day.active).map((day) => day.date)).toEqual(['2026-03-18']);
  });
});
