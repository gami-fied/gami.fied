# API Authentication & Security

Gami.Fied Community Engine uses API Key Authentication for public server-to-server endpoints (such as `POST /v1/events`) and Session Cookie / JWT authentication for Control Center dashboard management routes.

## Public API Keys (`x-api-key`)

Public server-to-server API endpoints require the `x-api-key` header:

```http
POST /v1/events HTTP/1.1
Host: gamiapi.fied.cc
Content-Type: application/json
x-api-key: gami_pk_live_REPLACE_ME
```

### Key Security & Scope
- **Project Isolation**: Every API key is strictly scoped to a single Project.
- **Prefix**: Server-side API keys start with `gami_pk_live_`.
- **Environment Isolation**: API keys cannot access resources outside their designated project.
- **Organization Suspension**: If an Organization is suspended, requests using its API keys return `403 Forbidden`.

> [!WARNING]
> Never commit API keys to public source code repositories or expose them in client-side browser bundles. Store them securely in server environment variables.
