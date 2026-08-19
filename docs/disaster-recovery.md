# Disaster Recovery Playbook

This document provides a practical disaster recovery playbook for operators self-hosting **Gami.Fied Community Edition**.

## Disaster Scenarios & Recovery Steps

### Scenario 1: Total Host Server Failure
1. Provision a new server instance.
2. Clone the repository and configure `.env` variables (`POSTGRES_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`).
3. Restore persistent host storage directory (`storage/backups`) from offsite storage.
4. Execute CLI restoration:
   ```bash
   pnpm backup:restore --id <target_backup_id>
   ```

### Scenario 2: Corrupted Application Database State
1. Log in to `/admin/backups` as Platform Admin.
2. Select the latest verified backup record (`status: verified`).
3. Click **Verify SHA-256 Checksum** to confirm file integrity.
4. Click **Restore Database**. The system automatically creates a pre-restore safety backup and restores PostgreSQL state.

### Scenario 3: Accidental Organization Deletion
1. Obtain the organization's latest logical export package (`gami-org-export-*.json`).
2. Log in as Organization Owner or Platform Admin.
3. Open `/dashboard/organization/data`.
4. Run **Validate & Import Data** to re-import projects, users, XP ledger, and gamification mechanics.
