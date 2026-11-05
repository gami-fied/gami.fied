# API Authentication & Security

Gami.Fied Community Engine uses API Key Authentication for public server-to-server endpoints (such as `POST /v1/events`) and Session Cookie / JWT authentication for Control Center dashboard management routes.

## Public API Keys (`x-api-key`)

Public server-to-server API endpoints require the `x-api-key` header:

```http
POST /v1/events HTTP/1.1
Host: api.example.com
Content-Type: application/json
x-api-key: gami_live_REPLACE_ME
```

### Key Security & Scope
- **Project Isolation**: Every API key is strictly scoped to a single Project.
- **Prefix**: Server-side API keys start with `gami_live_`.
- **Environment Isolation**: API keys cannot access resources outside their designated project.
- **Organization Suspension**: If an Organization is suspended, requests using its API keys return `403 Forbidden`.

### Scopes

Keys only do what their scopes allow. New keys default to `events:write`, so a key on your backend can send events and nothing else.

Scopes take the form `resource:read` or `resource:write`, and `write` includes `read` on the same resource. Resources are `project`, `events`, `rules`, `users`, `xp`, `achievements`, `levels`, `leaderboard`, `challenges`, `notifications`, `webhooks`, `integrations`, `analytics`, `audit-logs` and `system`. The scope `*` grants all of them.

### What keys can never do

These need a signed-in user, whatever the key's scopes:

- Create, list, rotate or revoke API keys
- Manage project members
- Update or delete a project
- Use any organization endpoint

### Expiry and rotation

Keys can have an expiry date. To replace a key without downtime, rotate it from the dashboard or with `POST /api/projects/:projectId/api-keys/:keyId/rotate`. You get a new key with the same scopes, and the old key keeps working for 24 hours by default (set `overlapHours`, up to 168).

> [!WARNING]
> Never commit API keys to public source code repositories or expose them in client-side browser bundles. Store them securely in server environment variables.
