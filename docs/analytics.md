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

## API

Project-scoped REST endpoints for querying product analytics, user activity, event volume, gamification stats, and delivery metrics.

---

### Authorization & Headers

All endpoints require project access authorization via session cookie or API key (`x-api-key`).

---

### Endpoints

#### 1. Overview Analytics
```http
GET /api/projects/:projectId/analytics/overview?range=7d
```
Returns summary metrics (Total Users, Active Users, Events Received, Total XP Awarded, Achievements Unlocked, Challenges Completed).

#### 2. User Growth & Activity
```http
GET /api/projects/:projectId/analytics/users?range=30d
```
Returns total users, new user count in range, active user count in range, and daily user growth trend.

#### 3. Event Volume & Top Types
```http
GET /api/projects/:projectId/analytics/events?range=7d
```
Returns total events ingested, daily event volume trend, and top 10 event types.

#### 4. Gamification Insights
```http
GET /api/projects/:projectId/analytics/gamification?range=30d
```
Returns XP awarded over time, average XP per active user, top unlocked achievements, challenge completion rate, and top 10 most triggered rules.

#### 5. Notification Activity
```http
GET /api/projects/:projectId/analytics/notifications?range=7d
```
Returns generated in-app notification counts and email outbox delivery status counts.

#### 6. Integration Delivery Health
```http
GET /api/projects/:projectId/analytics/integrations?range=7d
```
Returns webhook outbox delivery status and external integration delivery status.

#### 7. CSV Export Download
```http
GET /api/projects/:projectId/analytics/export?type=overview&range=30d
```
Returns downloadable CSV data file (`Content-Type: text/csv; charset=utf-8`).

---

### SDK Usage Example

```typescript
import { Gami } from '@gami.fied/sdk';

const gami = new Gami({ apiKey: 'gami_live_...' });

// Fetch Overview
const overview = await gami.analytics.getOverview('prj_123', { range: '30d' });
console.log('Total XP Awarded:', overview.xpAwarded);

// Export CSV
const csvData = await gami.analytics.export('prj_123', { type: 'events', range: '7d' });
```

## Data definitions

This guide describes the PostgreSQL data aggregation queries and indexing strategies powering Gami's project analytics.

---

### Query Patterns & Indexes

#### 1. Active Users Calculation
- **Query**: `SELECT COUNT(DISTINCT user_id) FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at <= $3`
- **Index Used**: `events_project_occurred_at_idx` (`project_id`, `occurred_at`)

#### 2. User Growth Over Time
- **Query**: `SELECT date_trunc('day', created_at) as date, COUNT(*) FROM end_users WHERE project_id = $1 AND created_at >= $2 AND created_at <= $3 GROUP BY date_trunc('day', created_at)`
- **Index Used**: `end_users_project_created_idx` (`project_id`, `created_at`)

#### 3. XP Awarded Trend & Average
- **Query**: `SELECT date_trunc('day', created_at) as date, SUM(amount) FROM xp_ledger WHERE project_id = $1 AND created_at >= $2 AND created_at <= $3 GROUP BY date_trunc('day', created_at)`
- **Index Used**: `xp_ledger_proj_user_created_idx` (`project_id`, `user_id`, `created_at`)

#### 4. Most Triggered Rules
- **Query**: `SELECT rules.id, rules.name, rules.trigger, COUNT(rule_executions.id) FROM rule_executions INNER JOIN rules ON rules.id = rule_executions.rule_id WHERE rules.project_id = $1 AND rule_executions.created_at >= $2 AND rule_executions.created_at <= $3 GROUP BY rules.id, rules.name, rules.trigger ORDER BY COUNT(rule_executions.id) DESC LIMIT 10`
- **Indexes Used**: `rule_executions_rule_id_idx`, `idx_rules_project_id`.

---

### Empty State & Partial Dataset Handling

All analytics functions use fallback defaults (`coalesce(sum(...), 0)`, `count(...)`) so that empty projects or projects with partial activity return clean structured zero counts (`0`) without null or division-by-zero runtime exceptions.

## Exports

Gami.Fied Community Edition supports direct CSV export for project analytics tabular datasets.

---

### Supported Export Types

- **`overview`**: Summary overview metrics (Total Users, Active Users, Events Processed, XP Awarded, Achievements Unlocked, Challenges Completed).
- **`users`**: End user directory (`User ID`, `External ID`, `Name`, `Email`, `Active`, `Created At`).
- **`events`**: Event log summary (`Event ID`, `Event Type`, `User ID`, `Occurred At`, `Idempotency Key`).
- **`xp`**: XP ledger audit table (`Ledger ID`, `User ID`, `Amount`, `Reason`, `Created At`).
- **`achievements`**: Unlocked achievements (`Achievement ID`, `Achievement Name`, `User ID`, `Awarded At`).

---

### Safety Limits & Boundaries

To ensure safe memory consumption and prevent database starvation on large datasets:
1. **Row Count Cap**: CSV export responses are hard-capped at a maximum of **5,000 rows**.
2. **Date Window Cap**: Custom date ranges for exports are hard-capped at a maximum window of **90 days**.
3. **Field Sanitization**: Quotes and double quotes in user strings are automatically escaped (`""`).
