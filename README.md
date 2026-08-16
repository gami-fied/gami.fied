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
- 🏆 **Gamification Core**: Balances, XP ledgers, leveling curves, streak tracking, and real-time leaderboards.
- 🎯 **Quests & Challenges**: Multi-step challenge progression with idempotent reward outbox processing.
- 🔔 **Multi-Channel Delivery**: In-app notifications, transactional SMTP emails, webhooks (with HMAC SHA-256 signatures), and Discord embeds.
- 🛡️ **Enterprise Security & Isolation**: Multi-tenant organization/project scoping, RBAC permissions, encrypted vault secrets (AES-256-GCM), and platform admin controls.
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
│   ├── config/       # Shared environment & ESLint configurations
│   └── ui/           # Shared UI design system & components
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

### 2. Start Local Infrastructure (PostgreSQL & Redis)

```bash
# Spin up PostgreSQL (port 5432) and Redis (port 6379)
pnpm infra:up

# Check container health status
pnpm infra:status
```

### 3. Run Database Migrations

```bash
pnpm --filter @gami/database migrate
```

### 4. Start Development Applications

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
import { GamiClient } from '@gami.fied/sdk';

const gami = new GamiClient({
  baseUrl: 'http://localhost:3001',
  apiKey: 'gami_live_your_project_api_key',
});

// Ingest a user event to trigger XP and challenge evaluation
const result = await gami.ingestEvent({
  userId: 'usr_12345',
  eventType: 'lesson_completed',
  data: { lessonId: 'les_99', score: 100 },
});

console.log('Ingested Event ID:', result.eventId);

// Retrieve user XP and level details
const userXp = await gami.getUserXp('usr_12345');
console.log(`User Level: ${userXp.level.currentLevel}, XP: ${userXp.balance}`);
```

---

## Verification & Code Quality

```bash
# Run full unit test suite (20 test files, 155+ tests)
pnpm --filter @gami/api test

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
- 📜 [Master Technical System Inventory](./docs/CURRENT_IMPLEMENTATION.md)

---

## License

Distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [LICENSE](LICENSE) for details.
