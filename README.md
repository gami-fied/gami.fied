# Gami Community Edition

[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-5.2-green)](https://fastify.dev/)
[![Next.js](https://img.shields.io/badge/Next.js-16.0-black)](https://nextjs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-blue)](https://www.postgresql.org/)

**Gami** is an open-source, self-hostable gamification engine and infrastructure platform. It allows software applications to seamlessly integrate gamification mechanics—such as **XP & Points**, **Levels & Progression**, **Achievements & Badges**, **Challenges & Quests**, **Leaderboards**, **Rules Engine**, **Webhooks**, **Email OTP**, and **Discord Notifications**—without building custom gamification code from scratch.

---

## Key Features

- ⚡ **Event-Driven Rules Engine**: Trigger XP, achievements, and quest progress automatically via custom event payloads.
- 🏆 **Gamification Core**: Balances, XP ledgers, levels, achievements, and leaderboards.
- 🎯 **Challenges**: Counter-based challenges with idempotent reward outbox processing.
- 🔔 **Multi-Channel Delivery**: In-app notifications, transactional SMTP emails, webhooks (with HMAC SHA-256 signatures), and Discord embeds.
- 🛡️ **Security & Isolation**: Multi-tenant organization/project scoping, RBAC permissions, encrypted vault secrets (AES-256-GCM), and platform admin controls.
- 💻 **Isomorphic TypeScript SDK**: Official `@gami.fied/sdk` with automatic retries, strict typing, and zero runtime dependencies.

---

## Monorepo Architecture

```text
gami-fied/
├── apps/
│   ├── api/          # Fastify 5 REST API microservice (@gami/api)
│   ├── worker/       # BullMQ + Redis background worker (@gami/worker)
│   └── dashboard/    # Next.js 16 (App Router) control console (@gami/dashboard)
├── packages/
│   ├── database/     # PostgreSQL schema, Drizzle ORM models & migrations
│   ├── sdk/          # Isomorphic TypeScript Client (@gami.fied/sdk)
│   ├── rules/        # Event rules evaluation engine
│   ├── progression/  # XP calculation & level curves engine
│   ├── challenges/   # Challenge completion logic
│   ├── leaderboards/ # Leaderboard scoring & Redis caching
│   ├── notifications/# Multi-channel notification router
│   ├── webhooks/     # Webhook dispatcher & HMAC signing
│   ├── integrations/ # External integration providers (Discord)
│   ├── queue/        # Shared BullMQ queue definitions
│   ├── types/        # Monorepo TypeScript definitions
│   └── config/       # Shared environment configuration
└── docs/             # Complete technical & API documentation
```

---

## Quickstart & Local Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ required)
- [pnpm](https://pnpm.io/) (v10+ recommended)
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
- ⚙️ **API Engine**: `http://localhost:3001`
- 🔄 **Background Worker**: Active process polling queues & outbox

---

## SDK Quickstart

Install `@gami.fied/sdk` in your application:

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

const projectId = 'prj_your_project_id';

// Send a user event. Rules and challenges run in the background.
const event = await gami.events.track({
  projectId,
  userId: 'usr_12345',
  type: 'lesson_completed',
  properties: { lessonId: 'les_99', score: 100 },
});

console.log('Accepted event:', event.id);

// Read the user's progress. This needs a key with the levels:read scope.
const progress = await gami.levels.getUserProgress({ projectId, userId: 'usr_12345' });
console.log(`Level ${progress.level.number}, ${progress.totalXp} XP`);
```

---

## Self-Hosting with Docker

Published images are available, so you don't need to build anything. See [Installing from published images](./docs/deployment-and-production.md#installing-from-published-images).

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

Comprehensive documentation is available in the [`docs/`](./docs) folder:

- 🚀 [Getting Started & Quickstart](./docs/getting-started.md)
- 🔒 [Authentication & Security Architecture](./docs/authentication-and-security.md)
- 🎮 [Gamification Mechanics & Rules Engine](./docs/gamification-mechanics.md)
- 🔔 [Notifications, Webhooks & Integrations](./docs/notifications-and-integrations.md)
- ⚙️ [Platform Administration & Audit Logs](./docs/platform-administration.md)
- 🐳 [Production Deployment & Troubleshooting](./docs/deployment-and-production.md)
- 🧭 [Architecture & Security Model](./docs/architecture.md)

---

## License

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [LICENSE](LICENSE) for details.
