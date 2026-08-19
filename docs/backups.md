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
