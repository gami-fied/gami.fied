# Gami.Fied documentation

Documentation for **Gami.Fied Community Edition**, a self-hosted gamification engine built with Fastify, Next.js, PostgreSQL, Redis and TypeScript.

---

## Documentation Sections

| Guide | Description |
| :--- | :--- |
| 🚀 [**Getting Started**](./getting-started.md) | Prerequisites, repository installation, local Docker setup, and `@gami.fied/sdk` integration. |
| 🛠️ [**Developer API Platform**](./api-reference.md) | Complete REST API Reference, [Authentication](./api-authentication.md), [Errors](./api-errors.md), [Request Tracing](./request-ids.md), [Idempotency](./idempotency.md), [API Versioning](./api-versioning.md), and [`@gami.fied/sdk`](./sdk.md). |
| ⚡ [**Quick Start Guides**](./quickstarts/rest.md) | Step-by-step integration guides for [REST / cURL](./quickstarts/rest.md), [Node.js](./quickstarts/node.md), [Python](./quickstarts/python.md), [Next.js](./quickstarts/nextjs.md), and [React](./quickstarts/react.md). |
| 🔒 [**Authentication & Security**](./authentication-and-security.md) | Sessions, roles, API keys, email verification and secret encryption. |
| 🔐 [**Route permissions**](./permissions.md) | Generated table of the role and API key scope each project route needs. |
| 🎮 [**Gamification Mechanics**](./gamification-mechanics.md) | Events, rules, XP, levels, achievements, challenges and leaderboards. |
| 🛒 [**Economy and Store**](./economy-and-store.md) | Boosts, limits, backtests, rule drafts, currencies, wallets and the reward store. |
| ⚛️ [**React & Live Updates**](./react.md) | Ready-made components, hooks, toasts and the live stream for your own app. |
| 🔔 [**Notifications & Integrations**](./notifications-and-integrations.md) | In-app notifications, email, signed webhooks and Discord. |
| ⚙️ [**Platform Administration**](./platform-administration.md) | Becoming an admin, the admin pages, audit logs and storage cleanup. |
| 🐳 [**Deployment & Production**](./deployment-and-production.md) | Docker Compose setup, environment variables, health checks, settings and troubleshooting. |
| 🩺 [**Operations**](./operations.md) | Prometheus metrics, alerts, logging, tuning and a runbook. See [Performance](./performance.md) for measured capacity. |
| 📊 [**Project Analytics & Insights**](./analytics.md) | The analytics API, how figures are calculated, and CSV exports. |
| 📦 [**Data Management & Backups**](./backups.md) | Platform Backups, [Restoration Procedures](./backups.md), [Data Export](./data-export.md), [Data Import](./data-import.md), [Disaster Recovery Playbook](./disaster-recovery.md), and [Retention Policy](./data-retention.md). |
| 🧭 [**Architecture & Security Model**](./architecture.md) | How the processes fit together, and how tenants and secrets are protected. [Security status](./security-audit.md) covers what has been tested. |
| 🏷️ [**Community Edition**](./community-edition.md) | What's included. See also the [release checklist](./release-checklist.md) and [changelog](../CHANGELOG.md). |

---

## Workspace Architecture Quick Map

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
