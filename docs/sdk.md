# `@gami.fied/sdk` TypeScript Client Reference

Official isomorphic Node.js / TypeScript SDK for Gami.Fied Community Engine.

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
  baseUrl: 'https://gamiapi.fied.cc', // Optional, defaults to http://localhost:3001
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
