# Platform Backup Restoration Procedures

This guide documents the procedures and safety safeguards for performing PostgreSQL database restorations in **Gami.Fied Community Edition**.

## Destructive Restore Safeguards

Restoration replaces committed database state with a historical snapshot. To prevent accidental data loss, the following mandatory controls are enforced:

1. **Platform Admin Authorization**: Requires active Platform Admin session or token.
2. **Explicit Confirmation Payload**: The API request must explicitly set `"confirmRestore": true`.
3. **Mandatory Pre-Restore Safety Backup**: The backup service automatically creates and verifies a `backupType: 'safety'` backup before executing the restore.
4. **Target Checksum Integrity Verification**: The target backup's SHA-256 checksum is verified against host storage prior to restoration.

## Procedure & Downtime

```bash
# Execute restoration via Server CLI:
pnpm backup:restore --id bkp_1771438500000_abc1

# Or via Platform Admin API:
POST /api/admin/backups/bkp_1771438500000_abc1/restore
Body: { "confirmRestore": true }
```

> [!WARNING]
> Restoration will overwrite data created after the target backup timestamp. The automatic safety backup allows operators to revert if necessary.
