# `@gami.fied/sdk` TypeScript Client Reference

Official isomorphic Node.js / TypeScript SDK for Gami.Fied Community Engine.


> [!NOTE]
> The SDK authenticates with a project API key, so it can only reach what the key's scopes allow. New keys are limited to `events:write`. Organization methods and API key management need a signed-in user and return 403 with an API key.

## Installation

```bash
pnpm add @gami.fied/sdk
# or
npm install @gami.fied/sdk
```

## Initialization

```typescript
import { Gami } from '@gami.fied/sdk';

const gami = new Gami({
  apiKey: process.env.GAMI_API_KEY!,
  baseUrl: 'https://api.example.com', // Optional, defaults to http://localhost:3001
});
```

## Methods

### 1. Ingest Event (`gami.events.ingest`)

```typescript
const result = await gami.events.ingest({
  projectId: 'prj_123',
  externalId: 'user_456',
  event: 'purchase',
  payload: { amount: 4999 },
  idempotencyKey: 'tx_987654321',
});

console.log(result.id); // evt_...
console.log(result.duplicate); // false
```

## Error Handling

All SDK errors inherit from `GamiError` and expose structured properties:

```typescript
try {
  await gami.events.ingest({
    projectId: 'prj_123',
    event: 'purchase',
  });
} catch (error) {
  if (error instanceof GamiError) {
    console.error(error.status);    // 400
    console.error(error.code);      // "BAD_REQUEST"
    console.error(error.requestId); // "req_1724001122..."
    console.error(error.message);   // "Invalid event request schema"
  }
}
```

## Verifying webhooks

Each delivery carries `X-Gami-Timestamp` and `X-Gami-Signature-V2`. The signature covers both the timestamp and the body, so a captured delivery can't be replayed later. `verifyWebhook` checks both, and rejects anything older than 5 minutes by default.

```ts
import { verifyWebhook } from '@gami.fied/sdk';

// rawBody is the body exactly as received, before JSON parsing.
export function isValidDelivery(rawBody: string, headers: Record<string, string>) {
  return verifyWebhook({
    rawBody,
    secret: process.env.GAMI_WEBHOOK_SECRET!,
    timestamp: headers['x-gami-timestamp']!,
    signature: headers['x-gami-signature-v2']!,
  });
}
```

When you rotate a secret, deliveries are signed with both the new and old secrets for 24 hours, so you can switch without missing any.

After 20 deliveries in a row use up all their retries, the endpoint is disabled and its owners are emailed if SMTP is set up. Turning it back on resets the count.

## Using the SDK in a browser

API keys must stay on your server, and the SDK refuses to run with one in a browser. Instead, have your backend create a short-lived token for the signed-in user:

```ts
import { Gami } from '@gami.fied/sdk';

const gami = new Gami({
  baseUrl: process.env.GAMI_API_URL!,
  apiKey: process.env.GAMI_API_KEY!,
});

export async function createToken(userId: string) {
  const response = await fetch(`${process.env.GAMI_API_URL}/v1/end-user-tokens`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.GAMI_API_KEY!,
    },
    body: JSON.stringify({ userId }),
  });
  return response.json();
}

export const serverClient = gami;
```

Then use that token in the browser. It can only read that user's own data, and it expires after 15 minutes unless you set `expiresInSeconds`, up to one hour.

```ts
import { Gami } from '@gami.fied/sdk';

const gami = new Gami({ baseUrl: 'https://api.example.com', endUserToken: 'geu_REPLACE_ME' });

const me = await gami.me.get();
console.log(`${me.totalXp} XP`);
```

To limit which sites can use tokens, set `allowedOrigins` on the project with `PATCH /api/projects/:id`. An empty list allows any site.

## Showing rewards straight away

Rewards are normally processed in the background. To show them immediately, add `?wait=true` to `POST /v1/events`. The response then includes a `rewards` object after up to 5 seconds. If `rewards.evaluated` is `false`, the worker hasn't finished, and the rewards will still arrive.

## Sending many events

`POST /v1/events/batch` takes up to 100 events and returns 207 with a result for each one, so you only need to retry the ones that failed.
