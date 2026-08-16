# Getting Started & Quickstart

This guide covers setting up **Gami.Fied Community Edition** locally, starting infrastructure services, running database migrations, and integrating your application using `@gami.fied/sdk`.

---

## 1. Prerequisites

Ensure your system meets the following requirements:

- **Node.js**: v22.0.0 or higher
- **pnpm**: v10.0.0 or higher (`npm i -g pnpm`)
- **Docker & Docker Compose**: Installed and running locally
- **PostgreSQL**: v17 (provided via Docker Compose)
- **Redis**: v7 (provided via Docker Compose)

---

## 2. Installation & Infrastructure Spinup

### Clone Repository

```bash
git clone https://github.com/gami-fied/gami.fied.git
cd gami.fied
pnpm install
```

### Start Database & Cache Containers

```bash
# Start PostgreSQL (port 5432) and Redis (port 6379)
pnpm infra:up

# Check container health status
pnpm infra:status
```

### Run Database Migrations

Apply the database schema and 22 initial Drizzle migrations to PostgreSQL:

```bash
pnpm --filter @gami/database migrate
```

---

## 3. Running Applications in Development

Start all workspace applications concurrently:

```bash
pnpm dev
```

This starts:
- 🌐 **Dashboard UI**: `http://localhost:3000`
- ⚙️ **API Server**: `http://localhost:3001`
- 🔄 **Worker Process**: Background Queue & Outbox Poller

### Individual Application Commands

```bash
pnpm --filter @gami/api dev       # Start API server only
pnpm --filter @gami/worker dev    # Start worker process only
pnpm --filter @gami/dashboard dev # Start dashboard UI only
```

---

## 4. Bootstrapping Initial Admin Account

When Gami is launched for the first time:

1. Open `http://localhost:3000/sign-up` in your browser.
2. Register a new user account.
3. If no Platform Admin exists yet, you can claim the Platform Admin role via the initial bootstrap endpoint or using the emergency CLI tool:

```bash
# Promote an existing user to Platform Administrator directly via CLI
pnpm --filter @gami/api admin:promote --email admin@example.com
```

---

## 5. Integrating with `@gami.fied/sdk`

Gami.Fied provides an isomorphic TypeScript SDK (`@gami.fied/sdk`) that works in Node.js, Next.js, Express, and backend services.

### Installation

```bash
pnpm add @gami.fied/sdk
```

### Initializing Client

```typescript
import { GamiClient } from '@gami.fied/sdk';

const gami = new GamiClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'gami_live_your_project_api_key', // Obtain from Dashboard -> API Keys
});
```

### Event Ingestion & Gamification Trigger

```typescript
// Ingest a user activity event
const response = await gami.ingestEvent({
  userId: 'usr_1001',
  eventType: 'lesson_completed',
  data: { lessonId: 'les_42', score: 95 },
});

console.log('Event Ingested:', response.eventId);
```

### Fetching User XP & Progression

```typescript
const userXp = await gami.getUserXp('usr_1001');

console.log(`Current Balance: ${userXp.balance} XP`);
console.log(`Current Level: ${userXp.level.currentLevel} (${userXp.level.name})`);
console.log(`Progress to Next Level: ${userXp.level.progressPercent}%`);
```

### Fetching Leaderboards

```typescript
const leaderboard = await gami.getLeaderboard('leaderboard_global_xp', {
  limit: 10,
});

leaderboard.entries.forEach((entry, idx) => {
  console.log(`#${entry.rank} - User: ${entry.userId} (${entry.score} pts)`);
});
```
