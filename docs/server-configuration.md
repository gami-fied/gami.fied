# Server Configuration Store

## Allowlisted Configuration Categories

Server configuration is stored in the `server_configs` table and managed via `ServerConfigService`. Only allowlisted categories with strict Zod validation are permitted:

1. `smtp`: Host, port, user, encrypted password, from email, from name, secure.
2. `security`: Session expiration minutes, max lifetime hours, login rate limits, API rate limits, lockout thresholds.
3. `registration`: Public registration toggles, org creation toggles, API key toggles.
4. `rate_limits`: Per-IP limits, per-project limits, window duration.
5. `notifications`: Enabled toggle, default email notifications, max daily emails per user, retry attempts.
6. `webhooks`: Enabled toggle, max webhooks per project, default timeout ms, max retry attempts.
7. `integrations`: Enabled toggle, allow external SSO, allow Slack integration, allow Discord integration.

### Endpoints

- `GET /api/admin/config`: Safe status listing (secrets redacted).
- `PATCH /api/admin/config`: Update configuration for an allowlisted category.
