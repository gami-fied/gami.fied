# Organization Invitations & Security

Gami supports secure email-based organization invitations with cryptographic token hashing, expiration, and strict email identity validation.

## Invitation Lifecycle & Flow

1. **Invite Member (`POST /api/organizations/:id/invitations`)**:
   - Generates cryptographically secure random token (`crypto.randomBytes(32)`).
   - Computes SHA-256 hash of token for storage. Plaintext token is **never stored** in the database, API response logs, or audit logs.
   - Sets 7-day expiration date.
   - Queues notification email with acceptance link (`/accept-invitation?token=...`).

2. **Invitation Acceptance Security (`POST /api/invitations/:token/accept`)**:
   - Hashes provided token with SHA-256 to query database.
   - Verifies invitation status is `pending` and `expiresAt > now()`.
   - Verifies organization is active (not suspended).
   - **STRICT SECURITY GUARD**: Verifies `session.user.email.toLowerCase() === invitation.email.toLowerCase()`. Rejects mismatching email attempts with `403 Forbidden`.
   - Attaches user account to organization atomically and marks invitation status `accepted`.

3. **Account Creation Flow**:
   - Unauthenticated recipient visiting `/accept-invitation?token=...` can inspect invitation details via `GET /api/invitations/:token`.
   - The user is guided through sign-up using the invited email address.
   - Upon registration & sign-in, the user accepts the invitation and attaches to the organization seamlessly.

## Invitation Endpoints

- `POST /api/organizations/:id/invitations` — Invite member by email
- `GET /api/organizations/:id/invitations` — List invitations for organization
- `POST /api/organizations/:id/invitations/:id/resend` — Resend invitation (generates new token & updates expiration)
- `DELETE /api/organizations/:id/invitations/:id` — Revoke invitation
- `GET /api/invitations/:token` — Public invitation details query
- `POST /api/invitations/:token/accept` — Accept invitation
- `POST /api/invitations/:token/decline` — Decline invitation
