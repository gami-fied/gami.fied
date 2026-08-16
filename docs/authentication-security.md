# Authentication & API Key Security

## Authentication Protections

1. **Session Enforcement**:
   - Platform admin endpoints require `isPlatformAdmin === true` on the authenticated user.
2. **First-Time Bootstrap Lock**:
   - `POST /api/admin/bootstrap` allows claiming the initial Platform Admin role when zero Platform Admins exist in PostgreSQL.
   - Requires explicit `PLATFORM_BOOTSTRAP_SECRET` environment variable setup.
   - Permanently locks out further HTTP bootstrap claims as soon as 1+ Platform Admins exist.
3. **Emergency CLI Recovery**:
   - Emergency server-side promotion `pnpm admin:promote --email <email>` operates directly against the database with audit event `admin.promoted_via_cli`.
4. **API Key Security**:
   - API keys store structured `scopes` (e.g. `["*"]`, `["events:write"]`).
   - Supports key revocation (`revokedAt`), expiration (`expiresAt`), and organization suspension checks.
   - Project API keys are explicitly denied access to `/api/admin/*`.
5. **Session Revocation**:
   - Platform administrators can view active administrative sessions and execute bulk revocation via `POST /api/admin/sessions/revoke-all`.
