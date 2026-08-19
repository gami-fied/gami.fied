# Organization Logical Data Export Guide

This specification defines the organization-scoped logical export format for **Gami.Fied Community Edition**.

## Export Scope & Authorization

Organization Owner, Admin, and Platform Admin roles may initiate logical exports. Logical exports contain only data belonging to the requested organization.

- **Endpoint**: `POST /api/organizations/:organizationId/export`
- **Dashboard UI**: `/dashboard/organization/data`

## Strict Secret Redaction Shield

Exports **NEVER** contain sensitive credentials or system secrets:
- Password hashes -> Omitted
- Session tokens / HMAC secrets -> Omitted
- Raw API key secrets -> Omitted (`keyPrefix` & `{ "configured": true }` preserved)
- Webhook signing secrets -> Omitted (`{ "configured": true }` preserved)
- SMTP passwords / tokens -> Omitted
- Platform Admin records -> Omitted
- Other organizations' data -> Omitted

## Export Package Structure

```json
{
  "format": "gami-organization-export",
  "version": 1,
  "exportedAt": "2026-08-18T23:45:00.000Z",
  "manifest": {
    "organizationId": "org_123",
    "organizationName": "Acme Corp",
    "projectCount": 2,
    "userCount": 42
  },
  "organization": { "name": "Acme Corp", "slug": "acme" },
  "projects": [ ... ],
  "users": [ ... ],
  "events": [ ... ],
  "xpLedger": [ ... ],
  "achievements": [ ... ],
  "challenges": [ ... ],
  "rules": [ ... ]
}
```
