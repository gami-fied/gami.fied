# Gami.Fied Technical Documentation & Sitemap

Welcome to the official technical documentation for **Gami.Fied Community Edition**.

Gami.Fied is an open-source, self-hostable gamification engine and infrastructure platform built with Fastify, Next.js, PostgreSQL, Redis, and TypeScript.

---

## Documentation Sections

| Guide | Description |
| :--- | :--- |
| 🚀 [**Getting Started**](./getting-started.md) | Prerequisites, repository installation, local Docker setup, and `@gami.fied/sdk` integration. |
| 🔒 [**Authentication & Security**](./authentication-and-security.md) | Better Auth sessions, RBAC permissions, API Key management, Email OTP verification, and AES-256-GCM vault encryption. |
| 🎮 [**Gamification Mechanics**](./gamification-mechanics.md) | Event Ingestion API, Rules Evaluation Engine, XP Ledgers, Level Progression Curves, Achievements, Quests/Challenges, and Leaderboards. |
| 🔔 [**Notifications & Integrations**](./notifications-and-integrations.md) | In-App Notifications, Transactional SMTP Email Outbox, HMAC-signed Webhooks, and Discord Embed Integrations. |
| ⚙️ [**Platform Administration**](./platform-administration.md) | Platform Admin Console (`/admin/*`), Global Server Configurations, User Profile management, Immutable Audit Logs, and Storage Cleanup tools. |
| 🐳 [**Deployment & Production**](./deployment-and-production.md) | Production Docker Compose setup, Environment variable checklist, Health check APIs (`/health`, `/ready`), Observability metrics, and Troubleshooting. |
| 📜 [**Master Technical Inventory**](./CURRENT_IMPLEMENTATION.md) | Authoritative technical inventory detailing every route, queue, schema, and system component. |

---

## Workspace Architecture Quick Map

```text
gami-fied/
├── apps/
│   ├── api/          # @gami/api - Fastify 5 REST API Server (Port 3001)
│   ├── worker/       # @gami/worker - BullMQ + Outbox Background Worker
│   └── dashboard/    # @gami/dashboard - Next.js 16 Control Console (Port 3000)
├── packages/
│   ├── database/     # PostgreSQL Schema, Drizzle ORM & 22 Database Migrations
│   ├── sdk/          # Isomorphic TypeScript SDK (@gami.fied/sdk)
│   ├── rules/        # Event Evaluation Engine
│   ├── progression/  # XP Calculations & Level Curves
│   ├── challenges/   # Challenge Completion Processor
│   ├── leaderboards/ # Leaderboard Scoring & Redis Caching
│   ├── notifications/# Multi-Channel Router
│   ├── webhooks/     # Webhook Delivery & HMAC Signatures
│   ├── integrations/ # External Providers (Discord)
│   ├── queue/        # Shared Queue Definitions
│   ├── types/        # TypeScript Interfaces
│   ├── config/       # Shared Configs
│   └── ui/           # Shared UI Component Library
└── docs/             # Documentation Portal
```
