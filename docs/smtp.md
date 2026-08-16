# Server SMTP Configuration & Security

SMTP email delivery is a server-level configuration concern managed by platform administrators.

## Authorization & Security

- **Authorization**: Endpoints under `/api/admin/smtp` require platform admin authorization via `x-platform-admin-secret` header or platform-admin owner session, strictly separating platform admin duties from organization project roles.
- **Credential Storage**: SMTP passwords are encrypted symmetrically at rest using AES-256-GCM (`encryptSecret` with `WEBHOOK_MASTER_KEY`).
- **Redaction**: Passwords are **never** returned in API responses, SDK, logs, or audit logs (`'[REDACTED]'`).

## Server Admin Endpoints

### 1. Get Server SMTP Status
```http
GET /api/admin/smtp
Header: x-platform-admin-secret: <PLATFORM_ADMIN_SECRET>
```

### 2. Configure Server SMTP Settings
```http
PUT /api/admin/smtp
Header: x-platform-admin-secret: <PLATFORM_ADMIN_SECRET>

{
  "host": "smtp.example.com",
  "port": 587,
  "user": "smtp-user",
  "password": "smtp-password",
  "fromEmail": "notifications@example.com",
  "fromName": "Gami Community Engine",
  "secure": false
}
```

### 3. Send Test Email
```http
POST /api/admin/smtp/test
Header: x-platform-admin-secret: <PLATFORM_ADMIN_SECRET>

{
  "recipientEmail": "admin@example.com"
}
```
