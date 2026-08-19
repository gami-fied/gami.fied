# Quick Start: Node.js / TypeScript

Integrate Gami.Fied Community Engine using `@gami.fied/sdk`.

## 1. Install Package
```bash
pnpm add @gami.fied/sdk
```

## 2. Copy Code Snippet
```typescript
import { Gami, GamiError } from '@gami.fied/sdk';

const gami = new Gami({
  apiKey: process.env.GAMI_API_KEY || 'gami_pk_live_REPLACE_ME',
  baseUrl: 'https://gamiapi.fied.cc',
});

async function main() {
  try {
    const result = await gami.events.ingest({
      projectId: 'prj_123',
      externalId: 'user_123',
      event: 'purchase',
      payload: { amount: 4999 },
      idempotencyKey: `purchase_${Date.now()}`,
    });

    console.log('Event Ingested:', result.id);
  } catch (error) {
    if (error instanceof GamiError) {
      console.error('API Error:', error.status, error.code, error.requestId, error.message);
    }
  }
}

main();
```
