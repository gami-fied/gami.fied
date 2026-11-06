# Organization Logical Data Import Guide

This document details the organization import semantics, dry-run validation, and deterministic ID remapping mechanics in **Gami.Fied Community Edition**.

## Import Authorization & Endpoints

Organization owners and admins can import into their organization.

- **Dry-Run Validation**: `POST /api/organizations/:organizationId/import/validate`
- **Transactional Import**: `POST /api/organizations/:organizationId/import`

## Deterministic ID Remapping & Tenant Rewriting

To prevent cross-tenant reference leaks and ID collisions:
1. **Target Organization Identity**: The target `organizationId` remains strictly untouched. Imported data is rewritten to belong to the target organization.
2. **Entity Remapping**: Project, user, achievement, challenge and rule IDs are given new IDs, such as `prj_imp_<timestamp>_<idx>`. Imported user external IDs and achievement and challenge keys gain an `_imp_<idx>` suffix, so they can't clash with what's already there.
3. **Foreign Keys**: All child entity references (`events`, `xpLedger`, `userAchievements`, `userChallengeProgress`, `notifications`) are remapped to match the newly generated IDs inside an atomic PostgreSQL transaction.

## Dry-Run Validation Mode

Before importing data, `/import/validate` evaluates:
- Format compatibility (`format === "gami-organization-export"`)
- Schema version compatibility (`version === 1`)
- Scans for embedded raw secret leaks
- Calculates entity remapping counts
