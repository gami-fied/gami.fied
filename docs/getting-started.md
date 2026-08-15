# Getting Started with Gami TypeScript SDK (`@gami/sdk`)

This guide walks you through integrating Gami into your application in 8 simple steps using `@gami/sdk`.

---

## 1. Create or Select a Gami Project

Log into your Gami Admin Dashboard (`http://localhost:3000`) and select or create a project.
Note down your **Project ID** (e.g. `prj_12345678`).

---

## 2. Generate an API Key

1. Navigate to **API Keys** (`/dashboard/api-keys`).
2. Click **Create API Key**.
3. Copy your live API secret key (starts with `gami_live_...`).

> [!WARNING]
> Store your API Key securely in server-side environment variables (e.g. `.env`). **Never expose your Gami API Key in browser or client-side code.**

---

## 3. Install `@gami/sdk`

```bash
pnpm add @gami/sdk
# or npm install @gami/sdk
# or yarn add @gami/sdk
```

---

## 4. Initialize the Client

```typescript
import { Gami } from '@gami/sdk';

const gami = new Gami({
  apiKey: process.env.GAMI_API_KEY!,
  baseUrl: process.env.GAMI_API_URL || 'http://localhost:3001',
});
```

---

## 5. Track Your First Event

Track incoming user events from your backend API endpoints:

```typescript
const result = await gami.events.track({
  projectId: 'prj_12345678',
  userId: 'usr_player_101',
  type: 'order_completed',
  properties: {
    amount: 149.99,
    tier: 'pro',
  },
});

console.log('Event tracked:', result.eventId);
```

---

## 6. Configure a Gamification Rule in the Dashboard

1. Navigate to **Rules** (`/dashboard/rules`).
2. Click **Create Rule**.
3. Set **Trigger Event** to `order_completed`.
4. Set **Action**: `Award 100 XP`.
5. Click **Save Rule**.

---

## 7. Trigger the Event & Worker Pipeline

When your application emits `order_completed` via `gami.events.track()`, Gami's durable outbox and background workers automatically evaluate the rule and award XP to the user.

---

## 8. Query XP, Level Progression & Notifications

Fetch the updated user progress directly using the SDK:

```typescript
// Fetch user XP balance
const balance = await gami.xp.getBalance({
  projectId: 'prj_12345678',
  userId: 'usr_player_101',
});

// Fetch user level progress
const progress = await gami.levels.getUserProgress({
  projectId: 'prj_12345678',
  userId: 'usr_player_101',
});

// Fetch in-app notifications
const notifications = await gami.notifications.list({
  projectId: 'prj_12345678',
  userId: 'usr_player_101',
});

console.log(`User ${progress.userId} is Level ${progress.currentLevel} (${balance.totalXp} XP)`);
```
