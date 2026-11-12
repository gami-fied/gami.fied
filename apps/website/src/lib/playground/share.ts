/**
 * Playground state in a link. The setup and events are compressed into the URL's hash, which
 * browsers never send to a server, so a shared link holds everything and nothing is stored.
 */
import type { PlaygroundEvent, PlaygroundSetup } from './simulate';

export interface SharedState {
  version: 1;
  scenario: string | null;
  setup: PlaygroundSetup;
  events: PlaygroundEvent[];
}

/** Links longer than this stop working in some chat apps, so the page warns instead. */
export const MAX_LINK_LENGTH = 8000;

const toBase64Url = (bytes: Uint8Array) => {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const fromBase64Url = (text: string) => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** `z.` marks compressed state; `j.` plain JSON, for browsers without CompressionStream. */
export async function encodeState(state: SharedState): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(state));
  if (typeof CompressionStream === 'undefined') return `j.${toBase64Url(json)}`;
  return `z.${toBase64Url(await pipe(json, new CompressionStream('deflate-raw')))}`;
}

/** Reads state from a link, or returns null when it is missing, damaged or not a playground setup. */
export async function decodeState(encoded: string): Promise<SharedState | null> {
  try {
    const [kind, data] = [encoded.slice(0, 2), encoded.slice(2)];
    let bytes = fromBase64Url(data);
    if (kind === 'z.') bytes = await pipe(bytes, new DecompressionStream('deflate-raw'));
    else if (kind !== 'j.') return null;
    const state = JSON.parse(new TextDecoder().decode(bytes)) as SharedState;
    if (state?.version !== 1 || !state.setup || !Array.isArray(state.setup.rules) || !Array.isArray(state.events)) return null;
    return state;
  } catch {
    return null;
  }
}

/**
 * The rules as the JSON a real install accepts: `POST /api/projects/:id/rules` takes one each.
 * Achievements and currencies they award must exist in that project first, with the same keys.
 */
export function exportRules(setup: PlaygroundSetup) {
  return setup.rules.map((rule) => ({
    name: rule.name,
    enabled: rule.enabled,
    trigger: rule.definition.trigger,
    ...(rule.definition.conditions ? { conditions: rule.definition.conditions } : {}),
    actions: rule.definition.actions,
  }));
}
