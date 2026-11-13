import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const entry = (file: string) => fileURLToPath(new URL(`../${file}`, import.meta.url));

/** Bundles an entry for the browser and returns the code, or the errors esbuild reports. */
async function bundle(file: string) {
  const result = await build({
    entryPoints: [entry(file)],
    bundle: true,
    write: false,
    platform: 'browser',
    format: 'esm',
    logLevel: 'silent',
  }).catch((error: { errors?: { text: string }[] }) => ({ errors: error.errors ?? [], outputFiles: [] }));
  return { errors: result.errors.map((e) => e.text), code: result.outputFiles[0]?.text ?? '' };
}

// The website playground runs the engine in the browser, so the main entry must stay free of Node.
describe('browser bundle', () => {
  it('bundles the main entry for the browser with no Node built-ins', async () => {
    const { errors, code } = await bundle('index.ts');
    expect(errors).toEqual([]);
    expect(code).not.toMatch(/\b(Buffer|process)\.|from ["']node:|require\(/);
  });

  it('evaluates a rule from the bundle', async () => {
    const { code } = await bundle('index.ts');
    const engine = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
    const result = engine.evaluateRule(
      { trigger: 'lesson_completed', conditions: { field: 'payload.score', operator: 'greater_than', value: 80 }, actions: [{ type: 'award_xp', params: { amount: 50 } }] },
      { id: 'evt_1', projectId: 'p', userId: 'u', type: 'lesson_completed', payload: { score: 92 }, occurredAt: new Date().toISOString() }
    );
    expect(result.matched).toBe(true);
    expect(result.actions).toEqual([{ type: 'award_xp', params: { amount: 50 } }]);
  });

  it('keeps the plugin loader out of the browser entry', async () => {
    const { errors } = await bundle('node.ts');
    expect(errors.join('\n')).toMatch(/node:path|node:url/);
  });
});
