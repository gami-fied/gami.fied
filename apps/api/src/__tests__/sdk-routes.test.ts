import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const apiSrc = path.resolve(import.meta.dirname, '..');
const sdkSrc = path.resolve(apiSrc, '../../../packages/sdk/src');

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(full);
    return entry.name.endsWith('.ts') ? [full] : [];
  });
}

describe('SDK paths', () => {
  it('only call routes that exist in the API', () => {
    const routes = new Set<string>();
    for (const file of sourceFiles(apiSrc)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/'(\/(?:api|v1|health|ready|metrics)[^'\s]*)'/g)) {
        routes.add(match[1]!.replace(/:[A-Za-z]+/g, ':param'));
      }
    }

    const missing: string[] = [];
    for (const file of sourceFiles(sdkSrc)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/path:\s*[`']([^`']+)[`']/g)) {
        const route = match[1]!.replace(/\$\{[^}]+\}/g, ':param').split('?')[0]!;
        if (!routes.has(route)) missing.push(match[1]!);
      }
    }

    expect(missing).toEqual([]);
  });
});
