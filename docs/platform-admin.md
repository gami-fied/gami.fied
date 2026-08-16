# Platform Administration Architecture & Roles

## Overview

Gami separates **Platform Administration** (`/admin` & `/api/admin/*`) from **Project Administration** (`/dashboard` & `/api/projects/*`).

### Role Boundaries

| Role Scope | Path Prefix | Access Mechanism | Privileges |
|---|---|---|---|
| **Platform Administrator** | `/admin/*`, `/api/admin/*` | Authenticated session with `isPlatformAdmin: true` | Server-wide system health, organization suspension/reactivation, allowlisted server configuration, security policies, global audit logs, session revocation. |
| **Project Owner / Admin** | `/dashboard/*`, `/api/projects/*` | Authenticated session with project membership (`owner` or `admin`) | Project-scoped rules, events, users, XP, achievements, levels, challenges, leaderboards, webhooks, and local audit logs. |
| **Project Member** | `/dashboard/*`, `/api/projects/*` | Authenticated session with project membership (`member`) | Read-only project-scoped gamification data. |
| **Project API Key** | `/api/projects/*` | `x-api-key` header matching active key hash | System-to-system event tracking, user updates, and project queries. **Strictly forbidden** from accessing `/api/admin/*`. |

---

## First-Time Platform Admin Bootstrap

When Gami is deployed on a fresh database with **zero Platform Administrators**:

1. Configure the `PLATFORM_BOOTSTRAP_SECRET` environment variable on your server:
   ```env
   PLATFORM_BOOTSTRAP_SECRET=your_long_random_bootstrap_secret_string
   ```
2. Sign up or log in as your initial admin user in the dashboard.
3. Navigate to `/admin`. The interface will display a **First-Time Setup Card**.
4. Enter the `PLATFORM_BOOTSTRAP_SECRET` to claim the first Platform Administrator role (`POST /api/admin/bootstrap`).
5. Once at least one Platform Administrator exists, `POST /api/admin/bootstrap` is **permanently locked and disabled** (`409 Conflict`).

---

## Emergency Server CLI Promotion

If server administrators lose access to all Platform Admin accounts, an emergency server-side CLI tool is available for recovery:

```bash
# Promotes an existing user by email directly in PostgreSQL
pnpm admin:promote --email admin@example.com
```

### CLI Behavior
- Requires direct server/database environment access (never exposed over HTTP).
- Checks `users` table for the specified email address.
- Fails safely if the user does not exist.
- Sets `isPlatformAdmin = true` and logs system audit event `admin.promoted_via_cli`.
