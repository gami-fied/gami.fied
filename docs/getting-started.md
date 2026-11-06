# Getting Started & Quickstart

This guide sets up **Gami.Fied Community Edition** for local development, then connects an app with `@gami.fied/sdk`.

To run it without building anything, see [Installing from published images](./deployment-and-production.md#installing-from-published-images).

---

## 1. Prerequisites

Ensure your system meets the following requirements:

- **Node.js**: 22 or later
- **pnpm**: 11 or later (`npm i -g pnpm`)
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

### Create Your Environment File

```bash
cp .env.example .env
```

### Start Database & Cache Containers

```bash
# Start PostgreSQL (port 5432) and Redis (port 6379)
pnpm infra:up

# Check container health status
pnpm infra:status
```

### Run Database Migrations

Apply the database schema to PostgreSQL:

```bash
pnpm db:migrate:dev
```

### Load Demo Data (Optional)

```bash
pnpm db:seed
```

This creates a demo organization, project, rules and users, then prints a dashboard login and a fresh API key. Start the apps afterwards so the worker can process the demo events.

---

## 3. Running Applications in Development

Start all workspace applications concurrently:

```bash
pnpm dev
```

This starts:
- 🌐 **Dashboard UI**: `http://localhost:3000`
- ⚙️ **API**: `http://localhost:3001`
- 🔄 **Worker**: Runs rules and sends deliveries in the background

### Individual Application Commands

```bash
pnpm --filter @gami/api dev       # Start API server only
pnpm --filter @gami/worker dev    # Start worker process only
pnpm --filter @gami/dashboard dev # Start dashboard UI only
```

---

## 4. Becoming a platform admin

1. Open `http://localhost:3000/register` and create an account.
2. Go to `http://localhost:3000/admin` while signed in.
3. Enter `PLATFORM_BOOTSTRAP_SECRET` from your `.env`.

This only works while the server has no platform admins. To add more, or to recover access, see [Platform administration](./platform-administration.md#1-becoming-a-platform-admin).

---

## 5. Integrating with `@gami.fied/sdk`

The TypeScript SDK works in Node.js, Next.js, Express and other server code. To use Gami.Fied from a browser, see [Using the SDK in a browser](./sdk.md#using-the-sdk-in-a-browser).

### Installation

```bash
pnpm add @gami.fied/sdk
```

### Sending an event and reading progress

```typescript
import { Gami } from '@gami.fied/sdk';

const gami = new Gami({
  baseUrl: 'http://localhost:3001',
  apiKey: 'gami_live_your_project_api_key',
});

// Send a user event. Rules and challenges run in the background.
const event = await gami.events.track({
  userId: 'user_123',
  type: 'lesson_completed',
  properties: { lessonId: 'les_99', score: 100 },
});

console.log('Accepted event:', event.id);

// Read the user's progress. This needs a key with the levels:read scope.
const progress = await gami.levels.getUserProgress({ userId: 'user_123' });
console.log(`Level ${progress.level.number}, ${progress.totalXp} XP`);
```

### Fetching a leaderboard

```typescript
import { Gami } from '@gami.fied/sdk';

const gami = new Gami({ baseUrl: 'http://localhost:3001', apiKey: 'gami_live_REPLACE_ME' });

const leaderboard = await gami.leaderboards.list({ limit: 10 });

leaderboard.entries.forEach((entry) => {
  console.log(`#${entry.rank} ${entry.externalId}: ${entry.xp} XP`);
});
```

Only users with XP are ranked, and deactivated users are hidden.

## Environment files

The apps read `.env` from the repository root. `.env.local` is not loaded, so copy values you need into `.env`. Variables set in your shell also work, because `turbo.json` passes them through.
