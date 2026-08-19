# Backup Retention & Automatic Pruning Policy

This document defines backup retention and automatic pruning policies for **Gami.Fied Community Edition**.

## Retention Policies

- **Manual Backups**: Retained indefinitely until manually deleted by Platform Admin via `/admin/backups` or `pnpm backup:delete`.
- **Scheduled Backups**: Subject to configured retention count (default: 30 backups). Older scheduled backups are automatically pruned.
- **Pre-Restore Safety Backups**: Automatically generated before destructive restores (`backupType: 'safety'`). Preserved to provide immediate rollback capabilities.

## Automatic Cleanup Command

```bash
# Verify integrity of all registered platform backups:
pnpm backup:verify --id <backupId>

# Delete expired platform backup:
DELETE /api/admin/backups/:backupId
```
