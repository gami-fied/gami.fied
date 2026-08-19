# Gami.Fied Community Edition — v1.0 Release Readiness Checklist

This document details the release validation procedure for **Gami.Fied Community Edition v1.0 Release Candidate**.

---

## 1. Security & Authorization Audit
- [x] Every API endpoint enforces authentication and authorization controls.
- [x] Platform Admin endpoints (`/api/admin/*`) require `isPlatformAdmin === true` and reject API keys (`403 Forbidden`).
- [x] Project endpoints enforce project membership or valid scoped API keys (`x-api-key`).
- [x] Unauthorized project queries return `404 Not Found` (IDOR/BOLA protection).
- [x] Standardized nested error response `{ error: { code, message, requestId } }` verified across all routes.
- [x] Secret redaction verified (passwords, tokens, API key secrets, webhook hashes).

## 2. Tenant Isolation Audit
- [x] Organization A cannot read or modify Organization B resources.
- [x] Project A cannot read or modify Project B resources.
- [x] Organization logical exports contain only organization-owned records.
- [x] Cross-organization import references rejected.

## 3. Database Migration & Integrity
- [x] Database migrations execute deterministically on fresh install.
- [x] Database migrations execute cleanly against existing databases.
- [x] Foreign key indexes exist for `projectId`, `organizationId`, `userId`, `createdAt`, `occurredAt`, `status`.

## 4. Backup & Disaster Recovery Verification
- [x] System-wide platform backups snapshot all 23 database tables.
- [x] Physical backup files verified with SHA-256 checksum and AES-256-GCM encryption.
- [x] Automated pre-restore safety backup created prior to restoration.
- [x] Database restore tested and verified end-to-end.

## 5. Docker Deployment Verification
- [x] Docker Compose stack starts PostgreSQL, Redis, API, Worker, and Dashboard.
- [x] Readiness endpoint (`/ready`) verifies PostgreSQL and Redis connectivity.
- [x] First-time platform admin bootstrap flow functional.
- [x] Persistent data survives container restart (`docker compose restart`).

## 6. Environment & Secret Validation
- [x] Production environment startup validation (`validateProductionConfig`) enforces mandatory secrets.
- [x] Insecure development defaults (`super-secret-...`, `change_me_...`) strictly rejected when `NODE_ENV=production`.

## 7. Dependency & Security Audit
- [x] Monorepo dependencies audited for vulnerabilities.
- [x] Typechecking (`pnpm typecheck`) clean across all 16 packages.
- [x] Full build (`pnpm build`) completed without warnings.

## 8. Worker Reliability & Idempotency
- [x] SIGTERM / SIGINT graceful shutdown handling verified in Worker and API services.
- [x] Outbox processing utilizes `SELECT FOR UPDATE SKIP LOCKED` for transactional idempotency.
- [x] External delivery failures (Discord, Webhooks, SMTP) isolated from core transactional database updates.
