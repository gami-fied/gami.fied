# Gami Community Edition

**Gami** is an open-source, self-hostable gamification infrastructure platform that allows applications to integrate gamification mechanics without building a custom gamification system from scratch.

Features supported by Gami include:

- XP & Levels
- Points & Balances
- Achievements & Badges
- Streaks & Milestones
- Quests & Challenges
- Leaderboards
- Rules Engine & Event-Driven Gamification

## Repository Overview

This repository contains the **Gami Community Edition** monorepo, structured for high maintainability, strict type safety, and seamless integration with future enterprise offerings such as **Gami Cloud**.

### Structure

```text
gami-community/
├── apps/
│   ├── api/          # @gami/api - Fastify REST API server
│   ├── worker/       # @gami/worker - Event & queue background worker
│   └── dashboard/    # @gami/dashboard - Next.js administrative dashboard
├── packages/
│   ├── config/       # @gami/config - Shared configurations & environment helpers
│   ├── types/        # @gami/types - Shared TypeScript type definitions
│   └── ui/           # @gami/ui - Shared UI components & design system
├── docs/             # Technical documentation & architecture guides
├── scripts/          # Repository scripts & automation tooling
├── .dockerignore     # Docker build context exclusion rules
└── docker-compose.yml# Local infrastructure (PostgreSQL & Redis)
```

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [pnpm](https://pnpm.io/) (v10+ recommended)
- [Docker](https://www.docker.com/) & Docker Compose

### 1. Installation

Clone the repository and install dependencies:

```bash
pnpm install
```

### 2. Infrastructure Setup (PostgreSQL & Redis)

Start the local database and cache services via Docker Compose:

```bash
# Start infrastructure containers in detached mode
pnpm infra:up

# Check infrastructure health status
pnpm infra:status

# View infrastructure logs
pnpm infra:logs

# Stop infrastructure containers
pnpm infra:down
```

#### Provisioned Infrastructure Services & Ports

| Service    | Image                | Default Host Port | Internal Network Service Host |
| ---------- | -------------------- | ----------------- | ----------------------------- |
| PostgreSQL | `postgres:17-alpine` | `5432`            | `postgres`                    |
| Redis      | `redis:7-alpine`     | `6379`            | `redis`                       |

> [!NOTE]
> When running applications locally on host machine, use `localhost` (e.g. `localhost:5432`, `localhost:6379`). When applications run inside Docker containers on `gami-network`, connect using Docker service names (`postgres`, `redis`).

#### Persistent Data & Resetting Storage

Infrastructure containers write to named Docker volumes (`gami_postgres_data` and `gami_redis_data`). Restarting or recreating containers preserves development data.

If you intentionally need to reset your local database and cache data, run:

```bash
docker compose down -v
```

> [!WARNING]
> Running `docker compose down -v` permanently removes the named volumes and deletes all local development data.

### 3. Application Development

Run all workspace applications in development mode:

```bash
pnpm dev
```

You can also run specific applications individually:

```bash
pnpm --filter @gami/api dev
pnpm --filter @gami/worker dev
pnpm --filter @gami/dashboard dev
```

### 4. Code Quality & Verification

Validate type safety, code formatting, and linting across the monorepo:

```bash
# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Check code formatting
pnpm format:check

# Auto-format code
pnpm format

# Build all workspace packages and applications
pnpm build
```

## License

Apache-2.0
