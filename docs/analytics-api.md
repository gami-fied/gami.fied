# Analytics API Reference

Project-scoped REST endpoints for querying product analytics, user activity, event volume, gamification stats, and delivery metrics.

---

## Authorization & Headers

All endpoints require project access authorization via session cookie or API key (`x-api-key`).

---

## Endpoints

### 1. Overview Analytics
```http
GET /api/projects/:projectId/analytics/overview?range=7d
```
Returns summary metrics (Total Users, Active Users, Events Received, Total XP Awarded, Achievements Unlocked, Challenges Completed).

### 2. User Growth & Activity
```http
GET /api/projects/:projectId/analytics/users?range=30d
```
Returns total users, new user count in range, active user count in range, and daily user growth trend.

### 3. Event Volume & Top Types
```http
GET /api/projects/:projectId/analytics/events?range=7d
```
Returns total events ingested, daily event volume trend, and top 10 event types.

### 4. Gamification Insights
```http
GET /api/projects/:projectId/analytics/gamification?range=30d
```
Returns XP awarded over time, average XP per active user, top unlocked achievements, challenge completion rate, and top 10 most triggered rules.

### 5. Notification Activity
```http
GET /api/projects/:projectId/analytics/notifications?range=7d
```
Returns generated in-app notification counts and email outbox delivery status counts.

### 6. Integration Delivery Health
```http
GET /api/projects/:projectId/analytics/integrations?range=7d
```
Returns webhook outbox delivery status and external integration delivery status.

### 7. CSV Export Download
```http
GET /api/projects/:projectId/analytics/export?type=overview&range=30d
```
Returns downloadable CSV data file (`Content-Type: text/csv; charset=utf-8`).

---

## SDK Usage Example

```typescript
import { Gami } from '@gami.fied/sdk';

const gami = new Gami({ apiKey: 'gami_pk_live_...' });

// Fetch Overview
const overview = await gami.analytics.getOverview('prj_123', { range: '30d' });
console.log('Total XP Awarded:', overview.xpAwarded);

// Export CSV
const csvData = await gami.analytics.export('prj_123', { type: 'events', range: '7d' });
```
