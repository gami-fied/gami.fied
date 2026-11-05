import fs from 'fs';
import path from 'path';
import { product } from '@gami/config';
import { describe, expect, it } from 'vitest';

describe('Version', () => {
  it('matches the root package.json', () => {
    const file = path.resolve(import.meta.dirname, '../../../../package.json');
    const { version } = JSON.parse(fs.readFileSync(file, 'utf8')) as { version: string };

    expect(product.version).toBe(version);
  });
});
