# Event Ingestion API Guide (`gami.events`)

Gami's Event Pipeline ingests high-throughput user activity events and triggers rules, XP awards, achievements, level progression, and challenges.

---

## Tracking an Event (`gami.events.track`)

```typescript
import { Gami } from '@gami/sdk';

const gami = new Gami({ apiKey: process.env.GAMI_API_KEY! });

const response = await gami.events.track({
  projectId: 'prj_123',
  userId: 'usr_player_1',
  type: 'quest_completed',
  properties: {
    questId: 'dragon_slayer',
    difficulty: 'hard',
    score: 9500,
  },
  occurredAt: new Date(),
});

console.log('Ingested Event ID:', response.eventId);
```

---

## External User ID Resolution

If your application references users by an external system ID (such as a UUID, email, or database primary key), pass `externalId`:

```typescript
await gami.events.track({
  projectId: 'prj_123',
  externalId: 'customer_ext_9948',
  type: 'order_shipped',
  properties: {
    total: 299.99,
  },
});
```

Gami automatically resolves or provisions the `endUser` record seamlessly.
