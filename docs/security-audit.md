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

- Penetration testing by an independent reviewer

## Self-review, 17 November 2026

Done by the maintainers against release 1.3.0, before the public launch. It is not a substitute for an independent review.

- **Content-Security-Policy.** The dashboard now sends a full policy with a fresh nonce per page. An injected inline script or event handler is blocked, which was checked in a browser. The page walk opens every dashboard page in both themes, at phone width and as a plain member and a platform admin, and fails if the policy blocks anything a page needs.
- **Automated scan.** An OWASP ZAP baseline scan of the dashboard and the API found no failures. Of its warnings, one was fixed (the dashboard announced `X-Powered-By: Next.js`), and the rest are by design: badge images may come from any HTTPS address, and inline styles are allowed because components set style attributes.
- **Images.** A Trivy scan of the published 1.3.0 images found a critical issue in esbuild's bundled Go runtime and high ones in npm's dependencies. Neither runs in production. Both are removed from the images, and CI now scans every image and fails on a fixable critical issue.
- **Dependencies.** `pnpm audit` finds no known vulnerabilities in production dependencies. CI checks this on every change, and Dependabot proposes updates weekly.
- **Routes added in 1.3.0.** Boxes, season passes, teams, shared goals, cosmetics, journeys, leaderboard prizes, the inbox, translations and web push were checked against the matrix below. Every player route that changes something needs a write token, except saving a language and marking notifications read, which a read-only token may do on purpose. Dashboard writes need an admin, API keys need the matching scope, and unmapped paths are closed. Concurrent box opens, pass claims and team joins are covered by tests.

## Authorization matrix

| Resource / Action | Unauthenticated | API Key (Scoped) | Org Member | Org Admin | Org Owner | Platform Admin |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Health checks, OpenAPI spec** | Read | Read | Read | Read | Read | Read |
| **Sign up / sign in** | Write | Denied | Denied | Denied | Denied | Denied |
| **Ingest event (`POST /v1/events`)** | Denied | `events:write` | Denied | Denied | Denied | Denied |
| **Read end-user email addresses** | Denied | `users:read` | Hidden | Read | Read | Read |
| **Read project analytics** | Denied | `analytics:read` | Read | Read | Read | Full |
| **Manage rules, achievements, challenges** | Denied | `*:write` | Read | Full | Full | Full |
| **Manage boxes, season passes, cosmetics** | Denied | `rewards:write` | Read | Full | Full | Full |
| **Manage teams** | Denied | `social:write` | Read | Full | Full | Full |
| **Manage shared goals and journeys** | Denied | `challenges:write` | Read | Full | Full | Full |
| **Manage leaderboard prizes** | Denied | `leaderboard:write` | Read | Full | Full | Full |
| **Manage translations** | Denied | `project:write` | Read | Full | Full | Full |
| **Manage API keys, project members, project settings** | Denied | Denied | Denied | Full | Full | Full |
| **Manage organization members** | Denied | Denied | Read | Full | Full | Full |
| **Transfer organization ownership** | Denied | Denied | Denied | Denied | Full | Full |
| **Export or import organization data** | Denied | Denied | Denied | Full | Full | Full |
| **Platform diagnostics (`/api/admin/*`)** | Denied | Denied | Denied | Denied | Denied | Full |
| **Create or restore platform backups** | Denied | Denied | Denied | Denied | Denied | Full |
