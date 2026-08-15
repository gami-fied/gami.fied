# `@gami/sdk` Complete API Reference

The `@gami/sdk` package is Gami's official TypeScript/JavaScript client SDK.

---

## Installation

```bash
pnpm add @gami/sdk
```

---

## Configuration (`GamiConfig`)

```typescript
import { Gami } from '@gami/sdk';

const gami = new Gami({
  apiKey: process.env.GAMI_API_KEY!, // Secret API key starting with gami_live_
  baseUrl: process.env.GAMI_API_URL || 'http://localhost:3001',
  timeout: 10000, // Request timeout in ms (default: 10000)
  retry: {
    maxRetries: 3, // Max retry attempts for transient status codes (default: 3)
    initialDelayMs: 300, // Initial delay before first retry
    maxDelayMs: 3000, // Max backoff cap in ms
  },
  headers: {
    'x-custom-header': 'value',
  },
});
```

---

## SDK Modules & Methods Summary

| Module               | Method                    | Description                                      |
| :------------------- | :------------------------ | :----------------------------------------------- |
| `gami.events`        | `track(params)`           | Track an event for a user or external ID         |
| `gami.users`         | `get(params)`             | Get user gamification status & level progression |
| `gami.xp`            | `getBalance(params)`      | Get total XP balance                             |
|                      | `getLedger(params)`       | Get XP transaction ledger history                |
|                      | `getSummary(params)`      | Get project XP summary metrics                   |
|                      | `adjust(params)`          | Manually adjust XP (with idempotency support)    |
| `gami.achievements`  | `list(params)`            | List configured achievements                     |
|                      | `get(params)`             | Get single achievement details                   |
|                      | `summary(params)`         | Get achievement summary metrics                  |
|                      | `listForUser(params)`     | List user's unlocked achievements                |
|                      | `getForUser(params)`      | Get specific user achievement unlock state       |
| `gami.levels`        | `list(params)`            | List level progression tiers                     |
|                      | `get(params)`             | Get single level details                         |
|                      | `summary(params)`         | Get level summary metrics                        |
|                      | `getUserProgress(params)` | Get user level progression status                |
| `gami.leaderboards`  | `list(params)`            | List leaderboard rankings                        |
|                      | `getUserRank(params)`     | Get specific user rank position                  |
| `gami.challenges`    | `list(params)`            | List configured challenges & quests              |
|                      | `get(params)`             | Get single challenge details                     |
|                      | `summary(params)`         | Get challenge metrics summary                    |
|                      | `listForUser(params)`     | List user's challenge progress                   |
|                      | `getForUser(params)`      | Get specific user challenge progress             |
| `gami.notifications` | `list(params)`            | List in-app notifications                        |
|                      | `getUnreadCount(params)`  | Get unread notification count                    |
|                      | `markAsRead(params)`      | Mark single notification as read                 |
|                      | `markAllAsRead(params)`   | Mark all notifications as read                   |

---

## Error Handling

All SDK errors inherit from `GamiError`:

```typescript
import {
  GamiAuthenticationError,
  GamiAuthorizationError,
  GamiError,
  GamiNetworkError,
  GamiNotFoundError,
  GamiRateLimitError,
  GamiServerError,
  GamiValidationError,
} from '@gami/sdk';

try {
  await gami.events.track({ projectId: 'prj_123', type: 'test' });
} catch (error) {
  if (error instanceof GamiRateLimitError) {
    console.error(`Rate limited! Retry after ${error.retryAfterSeconds} seconds.`);
  } else if (error instanceof GamiValidationError) {
    console.error(`Validation failed: ${error.message}`);
  } else if (error instanceof GamiError) {
    console.error(`Gami Error (${error.status}): ${error.message}`);
  }
}
```
