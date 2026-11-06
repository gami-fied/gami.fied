# Disaster Recovery Playbook

This document provides a practical disaster recovery playbook for operators self-hosting **Gami.Fied Community Edition**.

## Disaster Scenarios & Recovery Steps

### Scenario 1: Total Host Server Failure
1. Provision a new server instance.
2. Clone the repository and restore your `.env`, including `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET` and `ENCRYPTION_MASTER_KEY`. Backups can't be read without the same `ENCRYPTION_MASTER_KEY`.
3. Start PostgreSQL and Redis, and run the migrations.
4. Copy your backup files from offsite storage into `BACKUP_STORAGE_PATH` (`storage/backups` by default).
5. Restore the backup:
   ```bash
   pnpm backup:restore --id <target_backup_id>
   ```

### Scenario 2: Corrupted Application Database State
1. Log in to `/admin/backups` as Platform Admin.
2. Select the latest verified backup record (`status: verified`).
3. Verify the backup to confirm the file is intact.
4. Restore it, and confirm **Restore database**. A safety backup is created first, and everyone is signed out afterwards.

### Scenario 3: Accidental Organization Deletion
1. Obtain the organization's latest logical export package (`gami-org-export-*.json`).
2. Log in as Organization Owner or Platform Admin.
3. Create the organization again if needed, and open **Team > Data** (`/dashboard/organization/data`).
4. Choose **Validate & Import Data** to bring back its projects, users, XP history, achievements, challenges and rules.

Imported data gets new IDs, and imported external IDs and keys gain an `_imp_` suffix. See [Data import](./data-import.md).
