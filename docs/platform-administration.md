# Platform Administration & Audit Logs

The Platform Administration Console provides top-level administrative controls, global server configuration management, user profile settings, audit logging, and storage cleanup.

---

## 1. Platform Admin Console (`/admin/*`)

Access to `/admin/*` routes is strictly restricted to users with `isPlatformAdmin === true`.

Key Admin Modules:
- 📊 **Overview**: Total instance metrics (users, orgs, projects, events ingested, webhooks sent).
- ⚙️ **Server Configuration**: Configure SMTP, Security, Registration, Rate Limits, Notifications, Webhooks, and Integrations.
- 📜 **Security Audit Logs**: Immutable record of all system configuration changes, role promotions, and security events.
- 🧹 **System & Storage Cleanup**: Run manual or automated data retention purges for audit logs and webhooks.

---

## 2. Global Server Configurations

Configuration categories managed via `PUT /api/admin/config`:

| Category | Managed Properties |
| :--- | :--- |
| **`smtp`** | Host, Port, User, Password (encrypted at rest), From Email, From Name, TLS/SSL. |
| **`security`** | Email OTP Verification toggle, Session Expiration, Rate Limits, Failed Login Lockouts. |
| **`registration`** | Public User Registration toggle, Org Creation toggle, API Key creation toggle. |
| **`rate_limits`** | Per-IP limits, Per-Project limits, Window duration (ms). |
| **`webhooks`** | Webhooks enabled toggle, Max webhooks per project, Default timeout, Max retry attempts. |
| **`integrations`**| External SSO toggle, Discord integration toggle, Slack integration toggle. |

---

## 3. User Profile & Email Subscriptions

Users can edit their account details directly from the bottom sidebar profile menu:

- **Profile Details**: Name, Email address update.
- **System Email Subscriptions**: Toggle optional platform system notifications (`subscribedToSystemEmails`).
- **Security Safeguard**: Operational emails (e.g. Email OTP Verification) bypass subscription settings and are always delivered.

---

## 4. Immutable Audit Logs

Security and configuration actions automatically emit immutable audit entries to `audit_logs`:

- **Recorded Fields**: `actorType`, `actorId`, `action`, `severity`, `resourceType`, `resourceId`, `ipAddress`, `userAgent`, `metadata`.
- **Retention Safeguard**: Foreign key relations on `audit_logs` use `ON DELETE SET NULL` so historical security logs are preserved permanently even if an organization or project is deleted.

---

## 5. Storage Cleanup Tools

Platform Admins can trigger storage retention purges via `POST /api/admin/storage/cleanup`:

- Purge audit logs older than target retention period (e.g. 90 days).
- Purge webhook delivery logs older than target retention period (e.g. 30 days).
- Returns exact count of purged rows per table.
