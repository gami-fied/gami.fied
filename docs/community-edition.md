# Gami.Fied Community Edition Overview

**Gami.Fied Community Edition** is a self-hostable, open-source gamification engine and developer platform designed to add events, XP, levels, achievements, challenges, leaderboards, webhooks, and notifications to modern web applications.

---

## 1. Included Capabilities

### Core Gamification Engine
- **Event Ingestion**: Async event ingestion with client idempotency and 64KB payload caps.
- **Rules Engine**: Flexible trigger, condition, and multi-action processing engine.
- **XP & Progression**: XP ledger tracking, customizable level curves, and level-up events.
- **Achievements & Quests**: Multi-criteria achievement unlocking and challenge progress tracking.
- **Leaderboards**: Real-time project-scoped leaderboards with rank calculation and streak tracking.

### Developer Platform & Operations
- **Organization & Team Management**: Multi-tenant organization RBAC (`owner`, `admin`, `member`), single-use invitation tokens, and member project assignment.
- **API Key Management**: Scoped project API keys with SHA-256 secret hashing.
- **Webhooks & SSRF Defense**: Webhook delivery outbox with cryptographic signature headers (`X-Gami-Signature`), SSRF protection, loopback/private IP blocking, and DNS rebinding shield.
- **Integrations**: Built-in Discord integration framework supporting custom JSON embed templates and per-event delivery toggles.
- **Notifications & In-App Outbox**: In-app notification delivery outbox and SMTP email notifications.
- **Project Analytics & Reporting**: Near-real-time PostgreSQL aggregations for active users, event volume, top events, level distributions, and structured CSV exports.
- **Data Management & Recovery**: Platform-level encrypted database backups (`AES-256-GCM`), SHA-256 checksum integrity verification, pre-restore safety backups, and organization logical export/import.

---

## 2. Architectural Boundaries & Self-Hosting Standards

- **100% Self-Hostable**: Runs completely on standard PostgreSQL and Redis infrastructure.
- **Zero Cloud Lock-In**: Requires no proprietary cloud services or external SaaS subscriptions.
- **Multi-Tenant Isolation**: Enforces strict organization and project boundary checks at the database query level.
- **Read-Only Analytics**: Analytics queries are read-only PostgreSQL aggregations that never block event ingestion or transactional gamification logic.
