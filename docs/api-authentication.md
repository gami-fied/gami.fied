# API Authentication & Security

There are three ways to authenticate:

- **API keys** for your server, on `/v1` routes.
- **End-user tokens** for browsers and apps, on `/v1/me` routes.
- **Session cookies** for people signed in to the dashboard.

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

## End-user tokens

To show a user their own progress in a browser or app, your server creates a short-lived token for them:

```bash
curl -X POST https://api.example.com/v1/end-user-tokens \
  -H "x-api-key: gami_live_REPLACE_ME" \
  -H "Content-Type: application/json" \
  -d '{ "userId": "user_123", "expiresInSeconds": 900 }'
```

This needs a key with the `users:write` scope. The frontend then sends the token as `Authorization: Bearer <token>` to `/v1/me`, `/v1/me/achievements`, `/v1/me/challenges`, `/v1/me/notifications` and `/v1/me/rank`. A token can only read that one user's data, and lasts 15 minutes by default, up to one hour.

To limit which sites can use tokens, set `allowedOrigins` on the project under **Settings**.

> [!WARNING]
> Never commit API keys to public source code repositories or expose them in client-side browser bundles. Store them securely in server environment variables.
