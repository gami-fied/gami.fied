/**
 * The starter snippets on Developer Hub. They are built from the objects below, and
 * apps/api/src/__tests__/starter-snippets.test.ts sends those same requests to the API, so the
 * snippets can't drift from what the API and SDK accept. Keep this file free of React and Next.
 */

/** Where the docs live. Every link from the dashboard to the docs starts here. */
export const DOCS_URL = 'https://gami.fied.cc/docs';

/** Pages on the docs site, for "Read more" links. */
export const DOCS = {
  home: `${DOCS_URL}/`,
  gettingStarted: `${DOCS_URL}/getting-started/`,
  apiReference: `${DOCS_URL}/api-reference/`,
  apiExplorer: `${DOCS_URL}/api-explorer/`,
  rest: `${DOCS_URL}/quickstarts/rest/`,
  sdk: `${DOCS_URL}/sdk/`,
  playerTokens: `${DOCS_URL}/player-token-security/`,
  react: `${DOCS_URL}/react/`,
} as const;

/** Stands in for the API key, which the person pastes from API Keys. */
export const API_KEY_PLACEHOLDER = 'gami_live_REPLACE_ME';

/** The event every snippet sends: the body `POST /v1/events` takes. */
export const SAMPLE_EVENT = {
  event: 'lesson_completed',
  user_id: 'user_123',
  payload: { score: 90 },
} as const;

/** The same event, as `gami.events.track()` takes it. */
export const SAMPLE_TRACK = {
  userId: SAMPLE_EVENT.user_id,
  type: SAMPLE_EVENT.event,
  properties: SAMPLE_EVENT.payload,
} as const;

/** The React components the last snippet uses, all exported by @gami.fied/react. */
export const REACT_COMPONENTS = ['GamiProvider', 'LevelProgress', 'BadgeGrid'] as const;

export interface StarterSnippet {
  id: 'curl' | 'sdk' | 'token' | 'react';
  title: string;
  description: string;
  code: string;
  readMore: string;
}

const json = (value: unknown) => JSON.stringify(value, null, 2);
/** An object literal as it reads in TypeScript: `{ userId: 'user_123', ... }`. */
const literal = (value: unknown): string =>
  json(value)
    .replace(/"([a-zA-Z_]\w*)":/g, '$1:')
    .replace(/"/g, "'");

export function starterSnippets(apiUrl: string): StarterSnippet[] {
  return [
    {
      id: 'curl',
      title: 'Send an event with curl',
      description: 'From any server or terminal. Rules then turn it into XP and badges.',
      code: `curl -X POST ${apiUrl}/v1/events \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${API_KEY_PLACEHOLDER}" \\
  -d '${JSON.stringify(SAMPLE_EVENT)}'`,
      readMore: DOCS.rest,
    },
    {
      id: 'sdk',
      title: 'Set up the TypeScript SDK',
      description: 'The same event from a Node.js server. Keep the API key on the server.',
      code: `pnpm add @gami.fied/sdk

import { Gami } from '@gami.fied/sdk';

const gami = new Gami({
  apiKey: process.env.GAMI_API_KEY!,
  baseUrl: '${apiUrl}',
});

await gami.events.track(${literal(SAMPLE_TRACK)});`,
      readMore: DOCS.sdk,
    },
    {
      id: 'token',
      title: 'Make a player token on your server',
      description: 'A short-lived token for one player, to pass to their browser instead of the API key.',
      code: `const { token } = await gami.endUserTokens.create({ userId: '${SAMPLE_TRACK.userId}' });
// Send \`token\` to the player's browser.`,
      readMore: DOCS.playerTokens,
    },
    {
      id: 'react',
      title: 'Show progress in React',
      description: "The player's level and badges, updating live, with the token from your server.",
      code: `pnpm add @gami.fied/react

import { ${REACT_COMPONENTS.join(', ')} } from '@gami.fied/react';
import '@gami.fied/react/styles.css';

<GamiProvider endUserToken={token} baseUrl="${apiUrl}">
  <LevelProgress />
  <BadgeGrid />
</GamiProvider>`,
      readMore: DOCS.react,
    },
  ];
}
