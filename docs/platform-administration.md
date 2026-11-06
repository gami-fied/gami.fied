# Platform administration

Platform admins manage the whole server from `/admin`. This is separate from owning an organization.

---

## 1. Becoming a platform admin

**First admin:** sign up, go to `/admin` while signed in, and enter `PLATFORM_BOOTSTRAP_SECRET` from your `.env`. This only works while the server has no platform admins.

**Further admins, or recovery:** the person signs up first, then you run the command for your install:

```bash
# From a checkout
pnpm --filter @gami/database admin:promote --email admin@example.com

# With the published Docker images
docker compose exec api node packages/database/dist/scripts/promote-admin.js --email admin@example.com
```

Both are recorded in the audit log. Once you're an admin, a **Platform Admin** link appears at the bottom of the dashboard sidebar.

---

## 2. Admin pages

| Page | Purpose |
| :--- | :--- |
| Overview | Totals for users, organizations, projects and events |
| Organizations | Every organization, with the option to suspend one |
| Platform Health | Database, Redis, queues, workers and API traffic |
| Backups | Create, verify, restore and delete backups. See [Backups](./backups.md) |
| Storage | See what's using database space, and clear finished records |
| Security | Email verification, sessions, sign-in limits and password rules |
| Sessions | See who's signed in, and end sessions |
| Audit Logs | Security events and admin changes |
| Server Settings | Email, registration, rate limits, notifications, webhooks and integrations |

---

## 3. Server settings

The dashboard uses `GET` and `PATCH /api/admin/config`. See the [settings list](./deployment-and-production.md#instance-settings).

---

## 4. User profile

Everyone can open their profile from the bottom of the sidebar to change their name and password, choose whether to receive optional system emails, and delete their account. Security emails, such as verification codes, are always sent.

---

## 5. Audit logs

Security and configuration changes are recorded in `audit_logs`, with the actor, action, severity, resource, IP address, user agent and details.

Audit logs are never removed automatically. They keep their history if an organization or project is deleted, because those links are set to null rather than removing the row.

---

## 6. Storage cleanup

The worker removes old data on a schedule. See [Data retention](./data-retention.md). The Storage page can also clear finished records by hand, using `POST /api/admin/storage/clean`, and it reports how many rows were removed.
