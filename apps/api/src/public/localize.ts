import { featuresFor, loadTranslator, type TranslatableType, type Translator } from '@gami/database';
import type { FastifyReply, FastifyRequest } from 'fastify';

/** Set by `authenticateEndUser`, so the response can be put into the player's language. */
export interface PlayerLocale {
  projectId: string;
  organizationId: string;
  locale: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    playerLocale?: PlayerLocale;
  }
}

type Item = Record<string, unknown>;
const isItem = (value: unknown): value is Item => typeof value === 'object' && value !== null && !Array.isArray(value);
const items = (value: unknown): Item[] => (Array.isArray(value) ? value.filter(isItem) : []);

/** Translates `name` and `description` of something whose key is in `keyField`. */
function named(tr: Translator, type: TranslatableType, item: Item, keyField = 'key'): void {
  const key = item[keyField];
  if (typeof key !== 'string' && typeof key !== 'number') return;
  if (typeof item['name'] === 'string') item['name'] = tr.t(type, key, 'name', item['name']);
  if (typeof item['description'] === 'string') item['description'] = tr.t(type, key, 'description', item['description']);
}

/** The name of a currency that sits beside its key, as `currency` and `currencyName` do. */
function currencyName(tr: Translator, item: Item, keyField = 'currency', nameField = 'currencyName'): void {
  if (typeof item[keyField] === 'string' && typeof item[nameField] === 'string') item[nameField] = tr.t('currency', item[keyField], 'name', item[nameField]);
}

/**
 * What to translate in each player response, by route. A route that is not here is sent as it
 * is. Each entry changes the body in place; the body is a fresh object made for this response.
 */
const ROUTES: Record<string, (tr: Translator, body: Item) => void> = {
  '/v1/me': (tr, body) => {
    if (isItem(body['level'])) named(tr, 'level', body['level'], 'number');
    const worn = body['cosmetics'];
    if (isItem(worn)) {
      if (isItem(worn['title'])) named(tr, 'cosmetic', worn['title']);
      if (isItem(worn['frame'])) named(tr, 'cosmetic', worn['frame']);
      for (const item of items(worn['items'])) named(tr, 'cosmetic', item);
    }
  },
  '/v1/me/achievements': (tr, body) => items(body['data']).forEach((item) => named(tr, 'achievement', item)),
  '/v1/me/achievements/progress': (tr, body) => items(body['data']).forEach((item) => named(tr, 'achievement', item)),
  '/v1/me/streaks': (tr, body) => items(body['data']).forEach((item) => named(tr, 'streak', item)),
  '/v1/me/challenges': (tr, body) => items(body['data']).forEach((item) => named(tr, 'challenge', item)),
  '/v1/me/wallets': (tr, body) => items(body['data']).forEach((item) => named(tr, 'currency', item, 'currency')),
  '/v1/me/rewards': (tr, body) =>
    items(body['data']).forEach((item) => {
      named(tr, 'reward', item);
      currencyName(tr, item);
    }),
  '/v1/me/boxes': (tr, body) =>
    items(body['data']).forEach((box) => {
      for (const drop of items(box['items'])) {
        if (typeof drop['name'] === 'string') drop['name'] = tr.t('box_item', `${String(box['key'])}.${String(drop['id'])}`, 'name', drop['name']);
      }
      named(tr, 'box', box);
      currencyName(tr, box);
    }),
  '/v1/me/passes': (tr, body) =>
    items(body['data']).forEach((pass) => {
      named(tr, 'pass', pass);
      if (isItem(pass['premium'])) currencyName(tr, pass['premium']);
    }),
  '/v1/me/goals': (tr, body) =>
    items(body['data']).forEach((goal) => {
      named(tr, 'goal', goal);
      if (isItem(goal['team'])) named(tr, 'team', goal['team']);
    }),
  '/v1/me/journeys': (tr, body) =>
    items(body['data']).forEach((journey) => {
      named(tr, 'journey', journey);
      for (const step of items(journey['steps'])) named(tr, 'challenge', step, 'challenge');
    }),
  '/v1/me/cosmetics': (tr, body) =>
    items(body['data']).forEach((cosmetic) => {
      named(tr, 'cosmetic', cosmetic);
      if (isItem(cosmetic['achievement'])) named(tr, 'achievement', cosmetic['achievement']);
    }),
  '/v1/me/team': (tr, body) => {
    if (isItem(body['team'])) named(tr, 'team', body['team']);
  },
  '/v1/me/teams': (tr, body) => items(body['data']).forEach((team) => named(tr, 'team', team)),
};

/**
 * Puts a player response into the player's language just before it is sent. It runs only for
 * `GET /v1/me...` answers that succeeded, and only when the player has a language, the feature is
 * on, and the project has text in that language. Anything else passes through untouched.
 */
export async function localizePlayerResponse(request: FastifyRequest, reply: FastifyReply, payload: unknown): Promise<unknown> {
  const player = request.playerLocale;
  if (!player?.locale || request.method !== 'GET' || reply.statusCode !== 200 || !isItem(payload)) return payload;
  const change = ROUTES[request.routeOptions.url ?? ''];
  if (!change) return payload;
  if (!(await featuresFor(player.organizationId)).translations) return payload;
  const translator = await loadTranslator(player.projectId, player.locale);
  if (translator.locale === null || !translator.has) return payload;
  // A copy, so nothing a handler still holds, or a cache it read from, is changed.
  const body = structuredClone(payload) as Item;
  change(translator, body);
  return body;
}
