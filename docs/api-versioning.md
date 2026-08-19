# API Versioning Strategy

Gami.Fied Community Engine follows a clear, predictable versioning strategy designed for stability and zero-downtime upgrades.

## URL Path Versioning

1. **Public Event Ingestion API (`/v1/*`)**:
   - High-throughput public ingestion endpoints use URI path versioning (`/v1/events`).
   - Major breaking changes to event ingestion will introduce `/v2/events` while maintaining `/v1/events` compatibility.

2. **Project & Management API (`/api/*`)**:
   - Dashboard and SDK management endpoints are mounted under `/api/*`.
   - Backward-compatible additions (new fields, optional parameters) occur in-place without version bumps.

## Deprecation Policy
- Deprecated endpoints will include `Sunset` and `Deprecation` HTTP headers 6 months prior to removal.
