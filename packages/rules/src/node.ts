/**
 * The parts of the rules engine that need Node.js. Import them from `@gami/rules/node`, so the
 * main entry stays free of Node built-ins and runs in a browser, as the website playground does.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerPlugin, listPlugins, type GamiPlugin } from './plugins.js';

/**
 * Loads every plugin named in `GAMI_PLUGINS`. A plugin that fails to load stops start-up, because
 * rules that use it would otherwise fail quietly later.
 */
export async function loadPlugins(spec: string | undefined = process.env['GAMI_PLUGINS']): Promise<number> {
  const names = (spec ?? '').split(',').map((item) => item.trim()).filter(Boolean);
  for (const name of names) {
    const target = name.startsWith('.') || path.isAbsolute(name) ? pathToFileURL(path.resolve(name)).href : name;
    let mod: { default?: GamiPlugin } & Partial<GamiPlugin>;
    try {
      mod = (await import(target)) as typeof mod;
    } catch (err) {
      throw new Error(`Could not load the plugin "${name}": ${(err as Error).message}`, { cause: err });
    }
    const plugin = (mod.default ?? mod) as GamiPlugin;
    if (listPlugins().plugins.some((item) => item.name === plugin.name)) continue;
    registerPlugin(plugin);
  }
  return names.length;
}
