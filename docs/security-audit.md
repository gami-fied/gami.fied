# Security status

**This project has not had an independent security audit.** This page describes what the automated tests cover and who can do what. It is not a certification. Report vulnerabilities privately through [GitHub security advisories](https://github.com/gami-fied/gami.fied/security/advisories/new), not in a public issue.

## What the tests cover

| Area | Covered by automated tests |
| :--- | :--- |
| Authentication | Session checks, email verification, OTP limits, password reset, account lockout |
| API keys | Scopes, expiry, rotation, default deny for unmapped routes |
| Roles | Organization roles, platform admin boundaries |
| Tenant isolation | Cross-project access across REST routes |
| Webhooks | SSRF blocking, DNS rebinding at connect time, signatures |
| Backups | Checksums, encryption, restore |
| Worker | Idempotent rewards, retries, claim handling |
| Public API and SDK | Every documented example runs against the real API, and responses must match the docs |
| Docker images | CI boots the images and sends a real event through them |

## Not covered

- Penetration testing
- A full script Content-Security-Policy on the dashboard, which is not set yet

## Authorization matrix

| Resource / Action | Unauthenticated | API Key (Scoped) | Org Member | Org Admin | Org Owner | Platform Admin |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Health checks, OpenAPI spec** | Read | Read | Read | Read | Read | Read |
| **Sign up / sign in** | Write | Denied | Denied | Denied | Denied | Denied |
| **Ingest event (`POST /v1/events`)** | Denied | `events:write` | Denied | Denied | Denied | Denied |
| **Read end-user email addresses** | Denied | `users:read` | Hidden | Read | Read | Read |
| **Read project analytics** | Denied | `analytics:read` | Read | Read | Read | Full |
| **Manage rules, achievements, challenges** | Denied | `*:write` | Read | Full | Full | Full |
| **Manage API keys, project members, project settings** | Denied | Denied | Denied | Full | Full | Full |
| **Manage organization members** | Denied | Denied | Read | Full | Full | Full |
| **Transfer organization ownership** | Denied | Denied | Denied | Denied | Full | Full |
| **Export or import organization data** | Denied | Denied | Denied | Full | Full | Full |
| **Platform diagnostics (`/api/admin/*`)** | Denied | Denied | Denied | Denied | Denied | Full |
| **Create or restore platform backups** | Denied | Denied | Denied | Denied | Denied | Full |
