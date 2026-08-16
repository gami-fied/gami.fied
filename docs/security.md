# Production Security & Data Protection

## Security Architecture

1. **Secret Encryption at Rest**:
   - Symmetrically encrypts SMTP passwords, webhook secrets, and sensitive server config values using AES-256-GCM.
2. **Secrets Protection & Redaction**:
   - Secrets are **never** exposed in API responses, logs, audit metadata, or dashboard displays.
   - Status endpoints return safe indicators such as `"[REDACTED]"` or `{ "configured": true }`.
3. **Audit Log Persistence**:
   - Foreign key constraints on `audit_logs.projectId` and `organizationId` use `ON DELETE SET NULL`.
   - Historical audit logs survive project/organization deletion and remain append-only.
4. **Tenant Isolation**:
   - Every project API request strictly verifies organization ownership and project scoping.
   - API keys cannot cross project boundaries or access platform admin endpoints.
