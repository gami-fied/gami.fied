# Quick Start: Next.js (App Router Server Actions & Route Handlers)

Integrate Gami.Fied Community Engine securely in Next.js backend Server Actions.

```typescript
// app/actions/gamification.ts
'use server';

import { Gami } from '@gami.fied/sdk';

const gami = new Gami({
  apiKey: process.env.GAMI_API_KEY!,
  baseUrl: process.env.GAMI_API_URL || 'https://gamiapi.fied.cc',
});

export async function trackUserPurchase(userId: string, amount: number) {
  return await gami.events.ingest({
    projectId: process.env.NEXT_PUBLIC_GAMI_PROJECT_ID!,
    externalId: userId,
    event: 'purchase',
    payload: { amount },
    idempotencyKey: `order_${Date.now()}`,
  });
}
```
