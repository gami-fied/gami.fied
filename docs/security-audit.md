# Gami.Fied Community Edition — Security Audit & Authorization Matrix

This document provides the security audit results, tenant isolation verification, and centralized authorization matrix for **Gami.Fied Community Edition v1.0 Release Candidate**.

---

## 1. Security Regression Matrix

| Area | Tested | Result | Notes |
| :--- | :---: | :---: | :--- |
| **Authentication** | Yes | **PASS** | Session cookie validation via Better-Auth, single-use invitation tokens, secure password hashing. |
| **Platform Admin** | Yes | **PASS** | Platform Admin endpoints strictly enforce `users.isPlatformAdmin === true` and reject API keys & non-admin users with `403 Forbidden`. |
| **Organization RBAC** | Yes | **FIXED** | Verified role boundaries (`owner`, `admin`, `member`). Standardized error response body to `{ error: { code, message, requestId } }`. |
| **Project RBAC** | Yes | **PASS** | Evaluates Platform Admin, Org Owner/Admin, and explicit `project_members` assignments. |
| **API Keys** | Yes | **PASS** | Raw secrets stored as HMAC/SHA-256 hashes (`gami_live_...`). Rejects expired, revoked, and wrong-project keys. |
| **IDOR / BOLA** | Yes | **FIXED** | Unauthorized project queries return `404 Not Found` to prevent project existence enumeration. Atomic `update`/`delete` queries filter by `projectId` & `organizationId`. |
| **Tenant Isolation** | Yes | **PASS** | Verified cross-tenant boundary isolation across REST endpoints, events, exports, imports, analytics, and audit logs. |
| **Rate Limiting** | Yes | **PASS** | Redis sliding window rate limiter with fail-open fallback. Payload body cap enforced at 64KB. |
| **Secret Redaction** | Yes | **PASS** | Passwords, API key secrets, session tokens, and webhook/integration secrets are redacted from exports, logs, and API responses. |
| **Backups** | Yes | **PASS** | Platform backups stored on persistent storage with SHA-256 integrity verification, AES-256-GCM encryption at rest, and audit logging. |
| **Import / Export** | Yes | **PASS** | Organization logical exports contain only organization-owned data. Mandatory pre-import dry-run validation. |
| **Webhooks** | Yes | **PASS** | Full SSRF protection with loopback, RFC1918 private IP blocking, 169.254.169.254 metadata defense, and DNS rebinding shield. |
| **Discord Integration** | Yes | **PASS** | Custom embed templates with per-event toggles and delivery isolation. |
| **Notifications** | Yes | **PASS** | In-app outbox and SMTP email notifications bound to tenant organization & project scope. |
| **Worker / Outbox** | Yes | **PASS** | Transactional outbox processing using `SELECT FOR UPDATE SKIP LOCKED` for idempotent execution. |
| **Database** | Yes | **PASS** | Indexes exist for all high-cardinality foreign keys (`projectId`, `organizationId`, `userId`, `createdAt`, `occurredAt`, `status`). |

---

## 2. Centralized Authorization Matrix

| Resource / Action | Unauthenticated | API Key (Scoped) | Project Member | Org Member | Org Admin | Org Owner | Platform Admin |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Liveness & Readiness (`/health`, `/ready`)** | Read | Read | Read | Read | Read | Read | Read |
| **OpenAPI Spec (`/openapi.json`)** | Read | Read | Read | Read | Read | Read | Read |
| **Auth Sign Up / Sign In** | Write | Denied | Denied | Denied | Denied | Denied | Denied |
| **Ingest Event (`POST /v1/events`)** | Denied | Ingest Scope | Ingest Scope | Ingest Scope | Ingest Scope | Ingest Scope | Full Access |
| **Read Project Analytics** | Denied | Read Scope | Read | Read | Read | Read | Full Access |
| **Manage Rules / Achievements / Challenges** | Denied | Write Scope | Read Only | Read Only | Full Access | Full Access | Full Access |
| **Manage Organization Members** | Denied | Denied | Denied | Read Only | Full Access | Full Access | Full Access |
| **Transfer Organization Ownership** | Denied | Denied | Denied | Denied | Denied | Full Access | Full Access |
| **Export Organization Data** | Denied | Denied | Denied | Denied | Full Access | Full Access | Full Access |
| **Import Organization Data** | Denied | Denied | Denied | Denied | Full Access | Full Access | Full Access |
| **Platform System Diagnostics (`/api/admin/*`)** | Denied | Denied | Denied | Denied | Denied | Denied | Full Access |
| **Create & Restore Platform Backups** | Denied | Denied | Denied | Denied | Denied | Denied | Full Access |
