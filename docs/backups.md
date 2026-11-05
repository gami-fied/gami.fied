# Platform Infrastructure Backups Specification

This document details the platform-level infrastructure backup architecture for **Gami.Fied Community Edition**.

## Overview & Authorization Scope

Platform infrastructure backups are strictly **Platform Admin Only**. PostgreSQL backups contain multi-tenant database records and platform configuration that must never be exposed to organization owners, admins, or project members.

- **Endpoints**: `/api/admin/backups/*`
- **Dashboard UI**: `/admin/backups`
- **Metadata Persistence**: `platform_backups` PostgreSQL database table.
- **Physical Dump Files**: Persistent host filesystem storage (`storage/backups` or `BACKUP_STORAGE_PATH`).

## Backup Lifecycle States

Every platform backup record transitions through explicit lifecycle states:
- `creating`: Initial state when database dump process starts.
- `available`: Dump completed successfully and saved to disk.
- `verifying`: SHA-256 integrity check in progress.
- `verified`: File exists on host storage and SHA-256 checksum matches catalog.
- `failed`: Dump failed or checksum verification mismatch detected.
- `restoring`: System restoration currently executing from this backup.
- `restored`: Restoration successfully completed.
- `deleted`: Physical backup file deleted from host storage.

Partially-created (`creating`) or failed backups are never marked as usable.

## Security & Encryption at Rest

- **Integrity**: Every backup calculates a SHA-256 checksum immediately after dump creation.
- **Confidentiality**: Backups support AES-256-GCM encryption at rest using `BETTER_AUTH_SECRET` or dedicated server backup key.
- **Path Traversal Shield**: User-supplied filenames are sanitized (`path.basename`) and verified to reside inside `BACKUP_STORAGE_PATH`. User paths are validated strictly against database primary keys in `platform_backups`.

## Restoring

This guide documents the procedures and safety safeguards for performing PostgreSQL database restorations in **Gami.Fied Community Edition**.

### Destructive Restore Safeguards

Restoration replaces committed database state with a historical snapshot. To prevent accidental data loss, the following mandatory controls are enforced:

1. **Platform Admin Authorization**: Requires active Platform Admin session or token.
2. **Explicit Confirmation Payload**: The API request must explicitly set `"confirmRestore": true`.
3. **Mandatory Pre-Restore Safety Backup**: The backup service automatically creates and verifies a `backupType: 'safety'` backup before executing the restore.
4. **Target Checksum Integrity Verification**: The target backup's SHA-256 checksum is verified against host storage prior to restoration.

### Procedure & Downtime

```bash
## Execute restoration via Server CLI:
pnpm backup:restore --id bkp_1771438500000_abc1

## Or via Platform Admin API:
POST /api/admin/backups/bkp_1771438500000_abc1/restore
Body: { "confirmRestore": true }
```

> [!WARNING]
> Restoration will overwrite data created after the target backup timestamp. The automatic safety backup allows operators to revert if necessary.

## Encryption and storage

Backups are encrypted by default with `ENCRYPTION_MASTER_KEY`, and they include password hashes and API key hashes. Keep that key separately, because a backup can't be restored without it. Sessions are left out, so a restore signs everyone out.

Backups are JSON files on the API's disk (`BACKUP_STORAGE_PATH`, a Compose volume by default). They are built in memory, so for large installs use `pg_dump` from outside the app as well. Copy them off the machine yourself, as there is no S3 support yet.

To schedule backups, set `backupIntervalHours` in the `retention` settings. See [Data retention](./data-retention.md).

