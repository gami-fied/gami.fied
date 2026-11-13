import type { EventData } from './types.js';

/**
 * Plugins add rule actions of your own, such as "send a gift in our shop" or "post to our CRM".
 *
 * A plugin is a module whose default export comes from `definePlugin`. List the modules in
 * `GAMI_PLUGINS` (comma separated package names or file paths), and both the API (which checks
 * rules when they are saved) and the worker (which runs them) load it at start-up with
 * `loadPlugins` from `@gami/rules/node`.
 *
 * Everything in this file runs in a browser too. Loading plugins from disk does not, so it lives in
 * `node.ts`.
 */

export interface PluginActionContext {
  projectId: string;
  /** The person the event is about. Null for events without a user. */
  userId: string | null;
  event: EventData;
  params: Record<string, unknown>;
  ruleId: string;
  /**
   * The same for every retry of this action on this event. Pass it on to anything you call so a
   * retry never does the work twice.
   */
  idempotencyKey: string;
}

export interface PluginAction {
  /** Shown in the dashboard's action picker. */
  label: string;
  description?: string;
  /** Throw an Error with a readable message to reject a rule before it is saved. */
  validate?: (params: Record<string, unknown>) => void;
  /** Throw to mark the action failed. The worker retries the event, so make it safe to repeat. */
  run: (context: PluginActionContext) => Promise<void> | void;
}

export interface GamiPlugin {
  name: string;
  version?: string;
  /** Action types must be namespaced, such as `acme.send_gift`, so they never clash with built-ins. */
  actions: Record<string, PluginAction>;
}

export const PLUGIN_ACTION_TYPE = /^[a-z][a-z0-9_-]*\.[a-z][a-z0-9_.-]*$/;

/** Gives a plugin its types. It returns the plugin unchanged. */
export function definePlugin(plugin: GamiPlugin): GamiPlugin {
  return plugin;
}

const actions = new Map<string, PluginAction & { plugin: string }>();
const loaded: { name: string; version?: string; actions: string[] }[] = [];

export function registerPlugin(plugin: GamiPlugin): void {
  if (!plugin || typeof plugin.name !== 'string' || !plugin.name || typeof plugin.actions !== 'object') {
    throw new Error('A plugin needs a name and an actions object');
  }
  for (const [type, action] of Object.entries(plugin.actions)) {
    if (!PLUGIN_ACTION_TYPE.test(type)) throw new Error(`Plugin action "${type}" must be namespaced, like "${plugin.name}.do_something"`);
    if (actions.has(type)) throw new Error(`Plugin action "${type}" is registered twice`);
    if (typeof action?.run !== 'function') throw new Error(`Plugin action "${type}" needs a run function`);
    actions.set(type, { ...action, plugin: plugin.name });
  }
  loaded.push({ name: plugin.name, version: plugin.version, actions: Object.keys(plugin.actions) });
}

export function getPluginAction(type: string) {
  return actions.get(type);
}

/** What is installed, for the dashboard and the health page. */
export function listPlugins() {
  return {
    plugins: [...loaded],
    actions: [...actions.entries()].map(([type, action]) => ({ type, label: action.label, description: action.description ?? null, plugin: action.plugin })),
  };
}

/** For tests. */
export function clearPlugins(): void {
  actions.clear();
  loaded.length = 0;
}
