import * as react from '@gami.fied/react';
import { describe, expect, it } from 'vitest';
import { ELEMENTS, propsFrom, readAttribute } from '../definitions.js';

describe('reading attributes', () => {
  it('turns text into the kind of value a component expects', () => {
    expect(readAttribute('number', '5')).toBe(5);
    expect(readAttribute('string', 'daily_chest')).toBe('daily_chest');
    expect(readAttribute({ oneOf: ['daily', 'weekly'] }, 'weekly')).toBe('weekly');
    // A boolean attribute is on when present, as in HTML, unless it says false.
    expect(readAttribute('boolean', '')).toBe(true);
    expect(readAttribute('boolean', 'true')).toBe(true);
    expect(readAttribute('boolean', 'false')).toBe(false);
  });

  it('leaves a prop out, so the default applies, when the attribute is missing or makes no sense', () => {
    expect(readAttribute('number', null)).toBeNull();
    expect(readAttribute('number', 'lots')).toBeNull();
    expect(readAttribute('number', '')).toBeNull();
    expect(readAttribute('string', '')).toBeNull();
    expect(readAttribute('boolean', null)).toBeNull();
    expect(readAttribute({ oneOf: ['daily', 'weekly'] }, 'yearly')).toBeNull();
  });

  it('builds the props of an element from its attributes', () => {
    const attributes: Record<string, string> = { period: 'weekly', limit: '5', class: 'mine' };
    expect(propsFrom(ELEMENTS['gami-leaderboard']!, (name) => attributes[name] ?? null)).toEqual({ period: 'weekly', limit: 5 });
    expect(propsFrom(ELEMENTS['gami-leaderboard']!, () => null)).toEqual({});
    expect(propsFrom(ELEMENTS['gami-badge-grid']!, (name) => (name === 'show-locked' ? 'false' : null))).toEqual({ showLocked: false });
  });
});

describe('the elements', () => {
  it('have valid tag names and draw a real component', () => {
    for (const [tag, definition] of Object.entries(ELEMENTS)) {
      // A custom element name is lower case and has a dash.
      expect(tag, tag).toMatch(/^gami-[a-z]+(-[a-z]+)*$/);
      expect(typeof definition.component, tag).toBe('function');
      for (const name of Object.keys(definition.attributes)) expect(name, `${tag} ${name}`).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('cover every component the React package has', () => {
    const drawn = new Set(Object.values(ELEMENTS).map((definition) => definition.component));
    // ProgressBar is a building block with required props, not something to drop on a page.
    const skipped = new Set(['ProgressBar', 'GamiProvider']);
    const missing = Object.entries(react)
      .filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === 'function' && !skipped.has(name) && !drawn.has(value as never))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });

  it('can be loaded where there is no browser, and then does nothing', async () => {
    const elements = await import('../index.js');
    expect(elements.client()).toBeNull();
    expect(() => elements.setToken('geu_x')).toThrow(/configure first/);
    expect(() => elements.configure({ baseUrl: '', token: '' })).toThrow(/baseUrl and a token/);
  });
});
