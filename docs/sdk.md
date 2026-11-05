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
