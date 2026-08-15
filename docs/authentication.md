# Authentication & Security

Gami uses project-scoped secret API keys to authenticate SDK requests.

---

## Canonical Authentication Header

All SDK requests automatically transmit your secret key using the canonical header:

```http
x-api-key: gami_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

---

## Security Guidelines

> [!IMPORTANT]
> **Server-Side Only**: Gami API keys grant administrative permissions to ingest events, query balances, and grant XP. API keys MUST only be used in secure server-side environments (Node.js, Next.js API routes, Express servers, AWS Lambda, Cloud Run).

- **DO NOT** embed API keys in frontend Single Page Applications (React, Vue, Angular, Svelte, iOS, Android).
- **DO NOT** commit `.env` files to git repositories.
- Use secret managers or environment variables (`process.env.GAMI_API_KEY`).
- Rotate API keys immediately if compromised via the Gami Dashboard (**API Keys** menu).
