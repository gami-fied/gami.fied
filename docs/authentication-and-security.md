# Authentication & Security Architecture

Gami provides multi-layered security including session authentication, RBAC authorization, project-scoped API key isolation, Email OTP verification, and AES-256-GCM secret encryption.

---

## 1. Authentication & Session Management

- **Dashboard Auth**: Managed via **Better Auth** session cookies and Bearer tokens.
- **Session Lifetimes**: Sessions last `maxSessionLifetimeHours` from sign-in and are not extended by activity.
- **Emergency Session Revocation**: Platform Admins can view and revoke all active administrative sessions in one click via `POST /api/admin/sessions/revoke-all`.

---

## 2. Role-Based Access Control (RBAC)

Gami supports strict hierarchical roles:

| Role | Scope | Permissions |
| :--- | :--- | :--- |
| **Platform Admin** | Instance-Wide | Access `/admin/*` routes, global server configs, storage cleanup, system metrics, and all orgs/projects. |
| **Org Owner** | Organization | Full control over organization, members, projects, API keys, and integrations. |
| **Org Admin** | Organization | Can manage projects, rules, webhooks, and view organization members. |
| **Org Member** | Project-Scoped | Restricted strictly to assigned projects in `project_members`. Cannot view unassigned projects or organization settings. |

---

## 3. Project API Keys & Header Format

SDK integration requests are authenticated using project secret API keys.

### Header Format

```http
x-api-key: gami_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

### Key Security Guidelines

- **Server-Side Only**: API keys MUST only be used in server-side environments (Node.js, Next.js API routes, AWS Lambda). Never expose keys in client-side JS bundles.
- **Scoped Permissions**: Keys support specific scopes (e.g. `["*"]`, `["events:write"]`).
- **Isolation**: API keys are strictly tied to a single project and cannot cross project boundaries or access `/api/admin/*` endpoints.

---

## 4. Email OTP Verification

Platform Admins can enforce platform-wide **Email OTP Verification** upon new user registration:

1. Enabled via `/admin/security` (`requireEmailOtpVerification: true`).
2. Require active SMTP server configuration.
3. Newly registered users are automatically redirected to `/verify-email` and prompted for a 6-digit OTP code sent via Nodemailer.
4. OTP codes expire after 15 minutes. A code is stored only as a hash, is destroyed after 5 wrong guesses, and can only be used by the signed-in user it was sent to.
5. The policy is enforced by the API as well as the dashboard. Unverified users get `403 EMAIL_NOT_VERIFIED`. Platform admin routes are exempt, so a broken SMTP setup cannot lock everyone out.

Users can reset a forgotten password from `/forgot-password`. This needs working SMTP, and a successful reset signs the user out everywhere.

---

## 5. Secret Encryption at Rest (AES-256-GCM)

All sensitive vault secrets—including SMTP passwords, Webhook signing secrets, and third-party API credentials—are symmetrically encrypted at rest using **AES-256-GCM**.

- **Master Encryption Key**: Configured via `ENCRYPTION_MASTER_KEY` environment variable.
- **Redaction in API & Logs**: Encrypted secrets are **never** returned in plaintext in GET endpoints, logs, or audit metadata. Responses return safe placeholders (e.g. `"[REDACTED]"` or `passwordConfigured: true`).

---

## 6. Platform Admin Bootstrap & Emergency CLI Tool

- **First-Time Bootstrap**: `POST /api/admin/bootstrap` allows claiming the initial Platform Admin role when 0 Platform Admins exist in PostgreSQL, protected by `PLATFORM_BOOTSTRAP_SECRET`.
- **Emergency CLI Promotion**: Run server-side directly against PostgreSQL:
  ```bash
  pnpm --filter @gami/api admin:promote --email user@example.com
  ```
