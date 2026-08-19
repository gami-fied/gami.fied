# Organization Logical Data Import Guide

This document details the organization import semantics, dry-run validation, and deterministic ID remapping mechanics in **Gami.Fied Community Edition**.

## Import Authorization & Endpoints

Only Organization Owners and Platform Admins can import logical organization datasets.

- **Dry-Run Validation**: `POST /api/organizations/:organizationId/import/validate`
- **Transactional Import**: `POST /api/organizations/:organizationId/import`

## Deterministic ID Remapping & Tenant Rewriting

To prevent cross-tenant reference leaks and ID collisions:
1. **Target Organization Identity**: The target `organizationId` remains strictly untouched. Imported data is rewritten to belong to the target organization.
2. **Entity Remapping**: Old project, user, achievement, challenge, and rule IDs are remapped to new deterministic target IDs (`prj_imp_<timestamp>_<idx>`, `usr_imp_<timestamp>_<idx>`).
3. **Foreign Keys**: All child entity references (`events`, `xpLedger`, `userAchievements`, `userChallengeProgress`, `notifications`) are remapped to match the newly generated IDs inside an atomic PostgreSQL transaction.

## Dry-Run Validation Mode

Before importing data, `/import/validate` evaluates:
- Format compatibility (`format === "gami-organization-export"`)
- Schema version compatibility (`version === 1`)
- Scans for embedded raw secret leaks
- Calculates entity remapping counts
