<p><img src="packages/ui/brand/mark.svg" alt="" width="64" height="64"></p>

# Gami.Fied Community Edition

[![Release](https://img.shields.io/github/v/release/gami-fied/gami.fied)](https://github.com/gami-fied/gami.fied/releases)
[![License](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![SDK licence](https://img.shields.io/badge/SDK-MIT-blue.svg)](packages/sdk/LICENSE)
[![npm](https://img.shields.io/npm/v/@gami.fied/sdk)](https://www.npmjs.com/package/@gami.fied/sdk)

**Gami.Fied** is a self-hosted, open-source gamification engine. Your app sends it events, and rules you set up turn them into **XP**, **levels**, **streaks**, **badges**, **leaderboards** and **rewards**. Your players' data stays on your own server.

Website and docs: [gami.fied.cc](https://gami.fied.cc). Try the rules in your browser in the [playground](https://gami.fied.cc/playground/).

Built with Fastify, Next.js, PostgreSQL, Redis and TypeScript.

---

## What it does

- ⚡ **Rules engine**: turn events into XP, badges and currency, with conditions, drafts, a backtest against past events, and a trace of why a rule fired.
- 📈 **Progression**: levels, achievements with tiers, daily and weekly streaks with freezes, challenges with steps, journeys that chain challenges, and a season pass.
- 🪙 **Economy**: currencies and wallets with expiry, a reward store with stock and codes, mystery boxes with published odds, cosmetics, and boosts and limits against farming.
- 🏆 **Competition**: leaderboards by day, week and month with prizes for the top places, boards for segments, and leagues with promotion and relegation.
- 🤝 **Community**: teams and shared goals, friends, kudos, an activity feed, share cards and invite codes.
- 🔔 **Reaching players**: an in-app inbox, email, push for iPhone, Android and browsers, live updates, signed webhooks, Slack, Teams and Discord, and translations into each player's language.
- 💻 **Dashboard**: every feature has a page, with analytics, audit logs, delivery health, and owner, admin and member roles.
- 🧩 **For developers**: a stable `/v1` API with a full reference, a TypeScript SDK, React components, and web components for Vue, Svelte and plain pages.
- 🛡️ **Security**: organization and project isolation, scoped API keys, read-only and write tokens for players, encrypted secrets, and rate limits per address, key and player.
- 🗄️ **Self-hosting**: prebuilt Docker images, backups, export and import, connectors for Segment, RudderStack, Stripe and GitHub, and erasure for privacy requests.

Where it is weaker than the alternatives is on the [comparison page](https://gami.fied.cc/compare/).

---

## Run it with Docker

Prebuilt images are published for `linux/amd64` and `linux/arm64`, so there is nothing to build.

```bash
curl -LO https://github.com/gami-fied/gami.fied/releases/latest/download/docker-compose.yml
curl -LO https://github.com/gami-fied/gami.fied/releases/latest/download/env.example
cp env.example .env
```

Fill in the secrets in `.env`, then run `docker compose up -d`. The dashboard is at `http://localhost:3000`.

The ports are published on `127.0.0.1` only. To reach the dashboard from another machine, put it behind a [reverse proxy with TLS](./docs/install/reverse-proxy.md), or set `BIND_ADDRESS=0.0.0.0` in `.env` for a private network.

See [Install with Docker Compose](./docs/install/docker-compose.md), the [production checklist](./docs/install/production-checklist.md) and [Upgrading](./docs/install/upgrading.md).

---

## Use it from your app

### From your server

```bash
npm install @gami.fied/sdk
```

```typescript
import { Gami } from '@gami.fied/sdk';

const gami = new Gami({
  baseUrl: 'http://localhost:3001',
  apiKey: 'gami_live_your_project_api_key',
});

// Send what happened. Rules, streaks and challenges run in the background.
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

### In the player's browser

Never put an API key in a page. Your server makes a short-lived token for one player, and the page uses that:

```typescript
// On your server
const { token } = await gami.endUserTokens.create({ userId: 'user_123' });
```

A token only reads unless you ask for `access: 'write'`, which a player needs to buy a reward, open a box or add a friend.

With React:

```bash
npm install @gami.fied/react @gami.fied/sdk
```

```tsx
import { GamiProvider, LevelProgress, Leaderboard, ToastHost } from '@gami.fied/react';
import '@gami.fied/react/styles.css';

<GamiProvider endUserToken={token} baseUrl="https://gami.example.com">
  <LevelProgress />
  <Leaderboard period="weekly" />
  <ToastHost />
</GamiProvider>;
```

Without React, the same components are HTML elements:

```html
<script src="https://unpkg.com/@gami.fied/elements/dist/gami-elements.js"></script>
<script>
  GamiElements.configure({ baseUrl: 'https://gami.example.com', token });
</script>

<gami-level-progress></gami-level-progress>
<gami-leaderboard period="weekly"></gami-leaderboard>
```

See the [SDK guide](./docs/sdk.md), [React components](./docs/react.md) and [web components](./docs/web-components.md).

---

## Project layout

```text
gami-fied/
├── apps/
│   ├── api/           # Fastify API on port 3001 (@gami/api)
│   ├── worker/        # Background worker for rules and delivery (@gami/worker)
│   ├── dashboard/     # Next.js dashboard on port 3000 (@gami/dashboard)
│   └── website/       # gami.fied.cc: marketing pages, docs and playground (@gami/website)
├── packages/
│   ├── sdk/           # TypeScript client, on npm as @gami.fied/sdk (MIT)
│   ├── react/         # React components, on npm as @gami.fied/react (MIT)
│   ├── elements/      # The same components as HTML elements, @gami.fied/elements (MIT)
│   ├── database/      # PostgreSQL schema, Drizzle ORM, migrations and auth
│   ├── rules/         # Rule evaluation
│   ├── rewards/       # XP, badges, wallets and prizes
│   ├── progression/   # Levels and streaks
│   ├── challenges/    # Challenge progress
│   ├── leaderboards/  # Rankings, segments and leagues
│   ├── notifications/ # In-app and email notifications
│   ├── webhooks/      # Webhook delivery and signing
│   ├── integrations/  # Slack, Teams, Discord, HTTP and push
│   ├── queue/         # Shared queue definitions
│   ├── ui/            # Interface pieces shared by the dashboard and the website
│   ├── types/         # Shared TypeScript types
│   └── config/        # Shared configuration
├── deploy/            # One-click deploy files and the status page
└── docs/              # Documentation, also served at gami.fied.cc/docs
```

---

## Local development

To run it rather than work on it, see [Run it with Docker](#run-it-with-docker).

### Prerequisites

- [Node.js](https://nodejs.org/) 22 or later
- [pnpm](https://pnpm.io/) 11 or later
- [Docker & Docker Compose](https://www.docker.com/)

### Clone & Install Dependencies

```bash
git clone https://github.com/gami-fied/gami.fied.git
cd gami.fied
pnpm install
```

### Create Your Environment File

```bash
cp .env.example .env
```

The defaults match the local Docker services. For deployments, use `.env.production.example`.

### Start Local Infrastructure (PostgreSQL & Redis)

```bash
# Spin up PostgreSQL (port 5432) and Redis (port 6379)
pnpm infra:up

# Check container health status
pnpm infra:status
```

### Run Database Migrations

```bash
pnpm db:migrate:dev
```

### Load Demo Data (Optional)

```bash
pnpm db:seed
```

This prints a demo dashboard login and a fresh API key.

### Start Development Applications

```bash
pnpm dev
```

This starts:
- 🌐 **Dashboard UI**: `http://localhost:3000`
- ⚙️ **API**: `http://localhost:3001`
- 🔄 **Worker**: Runs rules and sends deliveries in the background

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

Everything is in the [`docs/`](./docs) folder, and at [gami.fied.cc/docs](https://gami.fied.cc/docs/) with search:

- 🚀 [Getting started](./docs/getting-started.md) and [installing](./docs/install/docker-compose.md)
- ⚡ [Quick starts](./docs/quickstarts/rest.md) for REST, Node.js, Python, Next.js and React
- 🎮 [Gamification mechanics](./docs/gamification-mechanics.md)
- 🛒 [Economy and store](./docs/economy-and-store.md)
- 🏆 [Segments, leagues and social](./docs/social-and-competition.md)
- 🌍 [Translations](./docs/translations.md)
- 🎁 [Boxes, passes, teams and journeys](./docs/boxes-passes-teams-and-journeys.md)
- 🔌 [Connectors, environments and plugins](./docs/connectors-environments-and-plugins.md)
- 🎛️ [Features and organization rules](./docs/platform-administration-features.md)
- 🛠️ [API reference](./docs/api-reference.md), [TypeScript SDK](./docs/sdk.md), [React components](./docs/react.md) and [web components](./docs/web-components.md)
- 🔔 [Notifications, webhooks and integrations](./docs/notifications-and-integrations.md)
- 🐳 [Deployment and production](./docs/deployment-and-production.md)
- ⚙️ [Platform administration](./docs/platform-administration.md)
- 🧭 [Architecture](./docs/architecture.md), [security](./docs/authentication-and-security.md) and [player tokens](./docs/player-token-security.md)
- 💾 [Backups](./docs/backups.md) and [upgrading](./docs/install/upgrading.md)

See the [changelog](./CHANGELOG.md) for what's new.

---

## License

The server, worker and dashboard are distributed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See [LICENSE](LICENSE) for details.

The SDK, the React components and the web components (`packages/sdk`, `packages/react` and `packages/elements`) are distributed under the **MIT License**, so you can use them in closed-source apps. See the [SDK's LICENSE](packages/sdk/LICENSE).
