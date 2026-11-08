# Gami.Fied Community Edition

[![Release](https://img.shields.io/github/v/release/gami-fied/gami.fied)](https://github.com/gami-fied/gami.fied/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![SDK licence](https://img.shields.io/badge/SDK-MIT-blue.svg)](packages/sdk/LICENSE)

**Gami.Fied** is a self-hosted gamification engine. Your app sends it events, and rules you configure turn them into **XP**, **levels**, **achievements**, **challenges** and **leaderboards**, with notifications and webhooks included. Your users' data stays on your own server.

Built with Fastify, Next.js, PostgreSQL, Redis and TypeScript.

---

## Key features

- ⚡ **Rules engine**: Turn events into XP and achievements, with conditions, a simulator and a trace of why a rule fired.
- 🏆 **Gamification core**: XP history, levels, achievements, challenges, and all-time, daily, weekly and monthly leaderboards.
- 🔔 **Delivery**: In-app notifications, email, signed webhooks with retries and replay, and Discord.
- 💻 **Dashboard**: Analytics, CSV exports, audit logs, delivery health, and owner, admin and member roles.
- 🛡️ **Security**: Organization and project isolation, scoped API keys, end-user tokens for browsers, and encrypted secrets.
- 🧩 **Developer API**: A stable `/v1` API with a full reference in the dashboard, and a TypeScript SDK.
- 🗄️ **Self-hosting**: Prebuilt Docker images, backups, data export and import, and user erasure for privacy requests.

---

## Project layout

```text
gami-fied/
├── apps/
│   ├── api/           # Fastify API on port 3001 (@gami/api)
│   ├── worker/        # Background worker for rules and delivery (@gami/worker)
│   └── dashboard/     # Next.js dashboard on port 3000 (@gami/dashboard)
├── packages/
│   ├── database/      # PostgreSQL schema, Drizzle ORM, migrations and auth
│   ├── sdk/           # TypeScript client (@gami.fied/sdk)
│   ├── rules/         # Rule evaluation
│   ├── rewards/       # XP and achievement grants
│   ├── progression/   # Level calculations
│   ├── challenges/    # Challenge progress
│   ├── leaderboards/  # Rankings
│   ├── notifications/ # In-app and email notifications
│   ├── webhooks/      # Webhook delivery and signing
│   ├── integrations/  # Discord
│   ├── queue/         # Shared queue definitions
│   ├── types/         # Shared TypeScript types
│   └── config/        # Shared configuration
└── docs/              # Documentation
```

---

## Local development

To run it rather than work on it, see [Self-hosting with Docker](#self-hosting-with-docker).

### Prerequisites

- [Node.js](https://nodejs.org/) 22 or later
- [pnpm](https://pnpm.io/) 11 or later
- [Docker & Docker Compose](https://www.docker.com/)

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/gami-fied/gami.fied.git
cd gami.fied
pnpm install
```

### 2. Create Your Environment File

```bash
cp .env.example .env
```

The defaults match the local Docker services. For deployments, use `.env.production.example`.

### 3. Start Local Infrastructure (PostgreSQL & Redis)

```bash
# Spin up PostgreSQL (port 5432) and Redis (port 6379)
pnpm infra:up

# Check container health status
pnpm infra:status
```

### 4. Run Database Migrations

```bash
pnpm db:migrate:dev
```

### 5. Load Demo Data (Optional)

```bash
pnpm db:seed
```

This prints a demo dashboard login and a fresh API key.

### 6. Start Development Applications

```bash
pnpm dev
```

This starts:
- 🌐 **Dashboard UI**: `http://localhost:3000`
- ⚙️ **API**: `http://localhost:3001`
- 🔄 **Worker**: Runs rules and sends deliveries in the background

---

## SDK Quickstart

Install `@gami.fied/sdk` in your server code:

```bash
pnpm add @gami.fied/sdk
# or npm install @gami.fied/sdk
```

Initialize the client and record an event:

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

---

## Self-hosting with Docker

Prebuilt images are published for `linux/amd64` and `linux/arm64`, so there's nothing to build.

```bash
curl -LO https://github.com/gami-fied/gami.fied/releases/latest/download/docker-compose.yml
curl -LO https://github.com/gami-fied/gami.fied/releases/latest/download/env.example
cp env.example .env
```

Fill in the secrets in `.env`, then run `docker compose up -d`. The dashboard is at `http://localhost:3000`.

See [Installing from published images](./docs/deployment-and-production.md#installing-from-published-images), and put it behind a [reverse proxy with TLS](./docs/deployment-and-production.md#reverse-proxy-and-tls) in production.

---

## Verification & Code Quality

```bash
# Run all tests (PostgreSQL and Redis must be running)
pnpm test

# Run TypeScript type check across monorepo
pnpm typecheck

# Run linter across monorepo
pnpm lint
```

---

## Documentation

Everything is in the [`docs/`](./docs) folder:

- 🚀 [Getting started](./docs/getting-started.md)
- ⚡ [Quick starts](./docs/quickstarts/rest.md) for REST, Node.js, Python, Next.js and React
- 🎮 [Gamification mechanics](./docs/gamification-mechanics.md)
- 🛒 [Economy and store](./docs/economy-and-store.md)
- 🏆 [Segments, leagues and social](./docs/social-and-competition.md)
- 🔌 [Connectors, environments and plugins](./docs/connectors-environments-and-plugins.md)
- 🎛️ [Features and organization rules](./docs/platform-administration-features.md)
- 🛠️ [API reference](./docs/api-reference.md) and [TypeScript SDK](./docs/sdk.md)
- 🔔 [Notifications, webhooks and integrations](./docs/notifications-and-integrations.md)
- 🐳 [Deployment and production](./docs/deployment-and-production.md)
- ⚙️ [Platform administration](./docs/platform-administration.md)
- 🧭 [Architecture and security](./docs/architecture.md)

See the [changelog](./CHANGELOG.md) for what's new.

---

## License

The server, worker and dashboard are distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [LICENSE](LICENSE) for details.

The SDK in `packages/sdk` is distributed under the **MIT License**, so you can use it in closed-source apps. See its [LICENSE](packages/sdk/LICENSE).
