# Quick Start: Next.js (App Router Server Actions & Route Handlers)

Integrate Gami.Fied Community Engine securely in Next.js backend Server Actions.

```typescript
// app/actions/gamification.ts
'use server';

import { Gami } from '@gami.fied/sdk';

const gami = new Gami({
  apiKey: process.env.GAMI_API_KEY!,
  baseUrl: process.env.GAMI_API_URL || 'https://api.example.com',
});

export async function trackUserPurchase(userId: string, amount: number) {
  return await gami.events.ingest({
    externalId: userId,
    event: 'purchase',
    payload: { amount },
    idempotencyKey: `order_${Date.now()}`,
  });
}
```
