import { describe, expect, it } from 'vitest';
import { cleanTypedSlug, slugify } from './slug';

describe('slugify', () => {
  it('turns a name into a slug', () => {
    expect(slugify('Acme Corp')).toBe('acme-corp');
    expect(slugify('  Mobile App  (Production) ')).toBe('mobile-app-production');
    expect(slugify('Ünïcode & Co.')).toBe('unicode-co');
    expect(slugify('---')).toBe('');
  });

  it('keeps following the whole name, not only the first letter', () => {
    const typed = 'My App';
    const slugs = [...typed].map((_, index) => slugify(typed.slice(0, index + 1)));
    expect(slugs.at(-1)).toBe('my-app');
  });
});

describe('cleanTypedSlug', () => {
  it('keeps a dash being typed and drops what a slug cannot hold', () => {
    expect(cleanTypedSlug('acme-')).toBe('acme-');
    expect(cleanTypedSlug('Acme Corp!')).toBe('acme-corp');
  });
});
