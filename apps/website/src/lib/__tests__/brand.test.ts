// The mark lives in packages/ui/brand/mark.svg. Favicons need their own copies, so check they match.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../../../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8').replace(/\r\n/g, '\n').trim();

describe('brand mark', () => {
  const mark = read('packages/ui/brand/mark.svg');

  it.each(['apps/website/public/favicon.svg', 'apps/dashboard/src/app/icon.svg'])('%s is the same as the mark', (copy) => {
    expect(read(copy)).toBe(mark);
  });

  it('matches the LogoMark component', () => {
    const component = read('packages/ui/src/logo.tsx');
    for (const part of mark.match(/d="[^"]+"|fill="#[0-9a-f]+"|stroke="#[0-9a-f]+"/g) ?? []) expect(component).toContain(part);
  });
});
