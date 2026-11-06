# Authentication & Security Architecture

How people and apps sign in, what each role can do, and how secrets are stored.

---

## 1. Authentication & Session Management

- **Dashboard sign-in**: Managed by **Better Auth** with session cookies.
- **Session Lifetimes**: Sessions last `maxSessionLifetimeHours` from sign-in and are not extended by activity.
- **Emergency Session Revocation**: Platform Admins can view and revoke all active administrative sessions in one click via `POST /api/admin/sessions/revoke-all`.

---

## 2. Role-Based Access Control (RBAC)

| Role | Scope | Permissions |
| :--- | :--- | :--- |
| **Platform Admin** | Whole server | The `/admin` area, server settings, backups, and every organization and project. |
| **Org Owner** | Organization | Everything an admin can do, plus transferring ownership and deleting the organization. |
| **Org Admin** | Organization | All projects, rules, API keys, webhooks, integrations, settings, members and invitations, and data export and import. |
| **Org Member** | Assigned projects | Reads data in projects they're assigned to, and can send test events. End-user email addresses are hidden from them. |

See the full [authorization matrix](./security-audit.md#authorization-matrix).

---

## 3. Project API Keys & Header Format

Your server authenticates with a project API key. See [API authentication](./api-authentication.md).

### Header Format

```http
x-api-key: gami_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

### Key Security Guidelines

- **Server-Side Only**: API keys MUST only be used in server-side environments (Node.js, Next.js API routes, AWS Lambda). Never expose keys in client-side JS bundles.
- **Scoped Permissions**: Keys only do what their scopes allow, such as `events:write`, and `*` allows everything.
- **Isolation**: API keys are strictly tied to a single project and cannot cross project boundaries or access `/api/admin/*` endpoints.

---

## 4. Email OTP Verification

Platform Admins can enforce platform-wide **Email OTP Verification** upon new user registration:

1. Enabled via `/admin/security` (`requireEmailOtpVerification: true`).
2. Require active SMTP server configuration.
3. Newly registered users are redirected to `/verify-email` and asked for a 6-digit code sent by email.
4. OTP codes expire after 15 minutes. A code is stored only as a hash, is destroyed after 5 wrong guesses, and can only be used by the signed-in user it was sent to.
5. The policy is enforced by the API as well as the dashboard. Unverified users get `403 EMAIL_NOT_VERIFIED`. Platform admin routes are exempt, so a broken SMTP setup cannot lock everyone out.

Users can reset a forgotten password from `/forgot-password`. This needs working SMTP, and a successful reset signs the user out everywhere.

---

## 5. Secret Encryption at Rest (AES-256-GCM)

Stored secrets, including SMTP passwords and webhook signing secrets, are encrypted at rest with **AES-256-GCM**.

- **Master Encryption Key**: Configured via `ENCRYPTION_MASTER_KEY` environment variable.
- **Redaction in API & Logs**: Encrypted secrets are **never** returned in plaintext in GET endpoints, logs, or audit metadata. Responses return safe placeholders (e.g. `"[REDACTED]"` or `passwordConfigured: true`).

---

## 6. Platform admins

Claim the first admin at `/admin` with `PLATFORM_BOOTSTRAP_SECRET`, which works only while no platform admin exists. Further admins are added with a server command. See [Platform administration](./platform-administration.md#1-becoming-a-platform-admin).
