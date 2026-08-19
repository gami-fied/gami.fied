# Project Analytics, Insights & Reporting

Gami.Fied Community Edition provides built-in, near-real-time project analytics and reporting to help project administrators track user engagement, event ingestion volume, XP progression, level distribution, achievement unlocks, challenge completion rates, most triggered rules, and multi-channel delivery metrics (notifications, webhooks, Discord).

---

## Key Characteristics

- **Near-Real-Time Execution**: Analytics queries read committed PostgreSQL database state directly.
- **Strict Read-Only Guarantee**: Analytics operations execute completely out-of-band and will **never** block or roll back event ingestion, XP calculations, or transactional outbox operations.
- **Tenant Isolation**: Every query requires `projectId` scoping and organization authorization. Cross-project data leakage is structurally impossible.
- **Self-Hostable**: 100% powered by native PostgreSQL aggregations (`COUNT`, `SUM`, `AVG`, `date_trunc`). Zero third-party cloud analytics services required.
- **Platform Separation**: Product engagement analytics are kept completely separate from Platform Admin server observability metrics.

---

## Date Range Presets & Boundaries

Analytics support configurable date windows:
- **`24h`**: Last 24 hours
- **`7d`**: Last 7 days (default)
- **`30d`**: Last 30 days
- **`90d`**: Last 90 days
- **`custom`**: Explicit `startDate` and `endDate` ISO-8601 timestamps.

### Active User Definition
An **Active User** is defined as a distinct `endUser` ID (`COUNT(DISTINCT userId)`) with qualifying event ingestion or XP ledger activity within the selected date window.

---

## Consistency & Performance Model

1. **Near-Real-Time**: Analytics reflect all committed database transactions as of query execution time.
2. **PostgreSQL Aggregation**: Queries leverage compound indexes (`events_project_occurred_at_idx`, `xp_ledger_proj_user_created_idx`, `user_achievements_awarded_idx`, etc.).
3. **Bounded Exports**: CSV exports are hard-capped at 5,000 records and a maximum 90-day window to prevent database memory spikes.
