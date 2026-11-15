# Platform Infrastructure Backups Specification

This document details the platform-level infrastructure backup architecture for **Gami.Fied Community Edition**.

## Overview & Authorization Scope

Platform infrastructure backups are strictly **Platform Admin Only**. PostgreSQL backups contain multi-tenant database records and platform configuration that must never be exposed to organization owners, admins, or project members.

- **Endpoints**: `/api/admin/backups/*`
- **Dashboard UI**: `/admin/backups`
- **Metadata Persistence**: `platform_backups` PostgreSQL database table.
- **Backup files**: `BACKUP_STORAGE_PATH`, or `storage/backups` by default.

## Backup Lifecycle States

Every platform backup record transitions through explicit lifecycle states:
- `creating`: Initial state when database dump process starts.
- `available`: Backup completed and saved to disk.
- `verified`: The file exists and its SHA-256 checksum matches.
- `failed`: Dump failed or checksum verification mismatch detected.
- `restoring`: System restoration currently executing from this backup.
- `restored`: Restoration successfully completed.
- `deleted`: Physical backup file deleted from host storage.

Partially-created (`creating`) or failed backups are never marked as usable.

## Security & Encryption at Rest

- **Integrity**: Every backup calculates a SHA-256 checksum immediately after dump creation.
- **Confidentiality**: Backups are encrypted at rest with AES-256-GCM and `ENCRYPTION_MASTER_KEY`.
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

From the **Backups** admin page, choose a backup and restore it. The page sends this request for you:

```http
POST /api/admin/backups/bkp_1771438500000_abc1/restore

{ "confirmRestore": true }
```

From a checkout with access to the database:

```bash
pnpm backup:restore --id bkp_1771438500000_abc1
```

> [!WARNING]
> Restoration will overwrite data created after the target backup timestamp. The automatic safety backup allows operators to revert if necessary.

## What a backup holds

A backup holds every table in the database except the ones below. The list is built from the schema, so tables added by a new version are included without any change to the backup code.

| Left out | Why |
| :--- | :--- |
| `platform_backups` | The list of backup files has to survive a restore. |
| `session` | Sign-ins. Everyone signs in again after a restore. |
| `verification` | Short-lived codes and password reset links. |
| `notification_outbox`, `email_notification_outbox`, `webhook_outbox`, `integration_deliveries` | Deliveries that were waiting to be sent. Restoring them would send them a second time. |

The audit log is saved in every backup, but a restore adds to it and never removes from it, so the record of what happened, the restore included, is not cut.

A restore runs in one transaction. If any part fails, nothing changes and the backup can be tried again.

### Backups made by 1.2.0 and earlier

Backups made by 1.2.0 and earlier hold only the 22 tables that existed at 1.0. Restoring one on those versions also emptied every other table, including XP totals, streaks, wallets, the store, leagues and referrals.

A restore now refuses a backup that is missing tables, and lists them. If the old backup is all you have and you accept that the missing tables end up empty, run it from a checkout with the `--partial` flag:

```bash
pnpm backup:restore --id bkp_1771438500000_abc1 --partial
```

Make a new backup after upgrading, so your next restore is complete.

## Encryption and storage

Backups are encrypted by default with `ENCRYPTION_MASTER_KEY`, and they include password hashes and API key hashes. Keep that key separately, because a backup can't be restored without it. Sessions are left out, so a restore signs everyone out.

Backups are JSON files on the API's disk (`BACKUP_STORAGE_PATH`, a Compose volume by default). They are built in memory, so for large installs use `pg_dump` from outside the app as well. Copy them off the machine yourself, as there is no S3 support yet.

To schedule backups, set `backupIntervalHours` in the `retention` settings. See [Data retention](./data-retention.md).

