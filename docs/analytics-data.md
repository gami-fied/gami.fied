# Analytics Data Layer & Query Architecture

This guide describes the PostgreSQL data aggregation queries and indexing strategies powering Gami's project analytics.

---

## Query Patterns & Indexes

### 1. Active Users Calculation
- **Query**: `SELECT COUNT(DISTINCT user_id) FROM events WHERE project_id = $1 AND occurred_at >= $2 AND occurred_at <= $3`
- **Index Used**: `events_project_occurred_at_idx` (`project_id`, `occurred_at`)

### 2. User Growth Over Time
- **Query**: `SELECT date_trunc('day', created_at) as date, COUNT(*) FROM end_users WHERE project_id = $1 AND created_at >= $2 AND created_at <= $3 GROUP BY date_trunc('day', created_at)`
- **Index Used**: `end_users_project_created_idx` (`project_id`, `created_at`)

### 3. XP Awarded Trend & Average
- **Query**: `SELECT date_trunc('day', created_at) as date, SUM(amount) FROM xp_ledger WHERE project_id = $1 AND created_at >= $2 AND created_at <= $3 GROUP BY date_trunc('day', created_at)`
- **Index Used**: `xp_ledger_proj_user_created_idx` (`project_id`, `user_id`, `created_at`)

### 4. Most Triggered Rules
- **Query**: `SELECT rules.id, rules.name, rules.trigger, COUNT(rule_executions.id) FROM rule_executions INNER JOIN rules ON rules.id = rule_executions.rule_id WHERE rules.project_id = $1 AND rule_executions.created_at >= $2 AND rule_executions.created_at <= $3 GROUP BY rules.id, rules.name, rules.trigger ORDER BY COUNT(rule_executions.id) DESC LIMIT 10`
- **Indexes Used**: `rule_executions_rule_id_idx`, `idx_rules_project_id`.

---

## Empty State & Partial Dataset Handling

All analytics functions use fallback defaults (`coalesce(sum(...), 0)`, `count(...)`) so that empty projects or projects with partial activity return clean structured zero counts (`0`) without null or division-by-zero runtime exceptions.
