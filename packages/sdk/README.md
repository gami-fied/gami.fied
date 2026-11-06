# @gami.fied/sdk

[![npm version](https://img.shields.io/npm/v/@gami.fied/sdk.svg)](https://www.npmjs.com/package/@gami.fied/sdk)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](https://github.com/gami-fied/gami.fied/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue)](https://www.typescriptlang.org/)

Official isomorphic TypeScript client for [**Gami.Fied**](https://github.com/gami-fied/gami.fied)—the open-source, self-hostable gamification engine and infrastructure platform.

---

## Features

- ⚡ **Isomorphic**: Runs seamlessly in Node.js, Next.js, Express, Bun, Deno, and browser runtimes.
- 🎯 **Strictly Typed**: Full TypeScript definitions for all API endpoints, events, parameters, and response objects.
- 🔄 **Resilient**: Automatic exponential backoff retries on transient network and rate-limit (429/5xx) errors.
- 🛡️ **Robust Error Handling**: Typed exceptions (`GamiAuthenticationError`, `GamiValidationError`, `GamiRateLimitError`).
- 🪶 **Zero External Runtime Dependencies**: Built using native `fetch`.

---

## Installation

The SDK is an ES module and needs Node.js 18 or later. Use `import`. `require()` works from Node.js 22.

```bash
# pnpm
pnpm add @gami.fied/sdk

# npm
npm install @gami.fied/sdk

# yarn
yarn add @gami.fied/sdk
```

---

## Quickstart

```typescript
import { Gami } from '@gami.fied/sdk';

const gami = new Gami({
  baseUrl: process.env.GAMI_API_URL!, // Your API address, for example http://localhost:3001
  apiKey: process.env.GAMI_API_KEY!,
});

// 1. Track what a user did. Rules, XP and achievements run in the background.
const event = await gami.events.track({
  userId: 'user_123',
  type: 'order_completed',
  properties: { amount: 4999, currency: 'USD' },
});
console.log(`Accepted event ${event.id}`);

// 2. Read their progress
const progress = await gami.levels.getUserProgress({ userId: 'user_123' });
console.log(`Level ${progress.level.number}, ${progress.totalXp} XP`);
```

New API keys can only send events (`events:write`). Create the key with more scopes to read data, as in step 2. See [API authentication](https://github.com/gami-fied/gami.fied/blob/master/docs/api-authentication.md).

---

## Core resources

Every method takes one object. Your API key identifies the project, and `userId` can be your own ID for the user.

| Resource | Methods |
| :--- | :--- |
| `gami.events` | `track` |
| `gami.users` | `list`, `get`, `getByExternalId`, `create`, `update`, `delete` |
| `gami.xp` | `getBalance`, `getLedger`, `getSummary`, `adjust` |
| `gami.levels` | `list`, `get`, `create`, `update`, `summary`, `getUserProgress` |
| `gami.leaderboards` | `list`, `getUserRank` |
| `gami.achievements` | `list`, `get`, `summary`, `listForUser`, `getForUser` |
| `gami.challenges` | `list`, `get`, `summary`, `listForUser`, `getForUser` |

`gami.notifications`, `gami.webhooks`, `gami.integrations`, `gami.analytics`, `gami.auditLogs` and `gami.system` are also available. `gami.organizations` needs a signed-in session, so API keys get 403.

To verify incoming webhooks, use `verifyWebhook`. See [the SDK guide](https://github.com/gami-fied/gami.fied/blob/master/docs/sdk.md).

---

## Error handling

All API requests throw typed `GamiError` subclasses:

```typescript
import {
  Gami,
  GamiAuthenticationError,
  GamiRateLimitError,
  GamiValidationError,
} from '@gami.fied/sdk';

const gami = new Gami({ baseUrl: 'http://localhost:3001', apiKey: 'gami_live_REPLACE_ME' });

try {
  await gami.events.track({ userId: 'user_123', type: 'signup' });
} catch (err) {
  if (err instanceof GamiAuthenticationError) {
    console.error('Invalid API key');
  } else if (err instanceof GamiValidationError) {
    console.error('Invalid event:', err.message);
  } else if (err instanceof GamiRateLimitError) {
    console.error('Rate limited, try again shortly');
  } else {
    throw err;
  }
}
```

---

## License

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [LICENSE](https://github.com/gami-fied/gami.fied/blob/main/LICENSE) for details.
