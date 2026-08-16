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

// Initialize Gami.Fied Client
const gami = new Gami({
  baseUrl: 'http://localhost:3001', // or your self-hosted API domain e.g. https://api.gami.fied.cc
  apiKey: process.env.GAMI_API_KEY!,
});

// 1. Ingest a user event
async function handleUserPurchase(userId: string, amount: number) {
  const result = await gami.events.track({
    userId,
    eventKey: 'order_completed',
    attributes: {
      amount,
      currency: 'USD',
    },
  });

  console.log(`Event processed! Execution time: ${result.executionTimeMs}ms`);
}

// 2. Fetch user XP balance and progression level
async function getUserProfile(userId: string) {
  const progress = await gami.users.getProgress(userId);
  console.log(`User Level: ${progress.level.currentLevel} | XP: ${progress.xp.totalXp}`);
}
```

---

## Core Resources & Methods

### 1. Events (`gami.events`)
- `gami.events.track({ userId, eventKey, attributes?, idempotencyKey? })`: Track a user action and trigger rules evaluation.
- `gami.events.replay({ eventId })`: Replay an event to re-evaluate gamification rules.

### 2. Users & Progress (`gami.users`)
- `gami.users.getProgress(userId)`: Retrieve total XP, current level, progress percentage to next level, and completed achievements.
- `gami.users.list({ limit?, page?, search? })`: List end users inside project.
- `gami.users.create({ externalId, email?, name? })`: Provision or link an end user.

### 3. XP & Ledgers (`gami.xp`)
- `gami.xp.get(userId)`: Fetch XP summary and balance.
- `gami.xp.adjust({ userId, amount, reason })`: Manually award or deduct XP.
- `gami.xp.getLedger(userId, { limit?, page? })`: View audit ledger entries for XP transactions.

### 4. Leaderboards (`gami.leaderboards`)
- `gami.leaderboards.get({ leaderboardId, period?, limit? })`: Fetch global or project leaderboards.
- `gami.leaderboards.getUserRank(leaderboardId, userId, { period? })`: Get user rank and score.

### 5. Achievements & Challenges (`gami.achievements` & `gami.challenges`)
- `gami.achievements.listUserAchievements(userId)`: List unlocked achievements and badges for user.
- `gami.challenges.listUserChallenges(userId)`: Track user progress on multi-step challenges and quests.

### 6. Notifications (`gami.notifications`)
- `gami.notifications.list(userId, { limit?, unreadOnly? })`: Retrieve in-app notifications for end user.
- `gami.notifications.markRead(userId, notificationId)`: Mark specific notification as read.
- `gami.notifications.markAllRead(userId)`: Mark all user notifications as read.

### 7. Webhooks & Integrations (`gami.webhooks` & `gami.integrations`)
- `gami.webhooks.list()`: Manage destination webhook endpoints.
- `gami.webhooks.test({ webhookId })`: Send test payload to verify HMAC signature setup.
- `gami.integrations.list()`: Manage external channel connections (e.g. Discord bot embeds).

---

## Error Handling

All SDK API requests throw typed `GamiError` subclasses:

```typescript
import { 
  Gami, 
  GamiAuthenticationError, 
  GamiValidationError, 
  GamiRateLimitError 
} from '@gami.fied/sdk';

try {
  await gami.events.track({ userId: 'u_123', eventKey: 'signup' });
} catch (err) {
  if (err instanceof GamiAuthenticationError) {
    console.error('Invalid API Key provided');
  } else if (err instanceof GamiValidationError) {
    console.error('Invalid event attributes payload:', err.message);
  } else if (err instanceof GamiRateLimitError) {
    console.error('Rate limited. Retry after seconds:', err.retryAfterSeconds);
  } else {
    console.error('An unexpected error occurred:', err);
  }
}
```

---

## License

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [LICENSE](https://github.com/gami-fied/gami.fied/blob/main/LICENSE) for details.
