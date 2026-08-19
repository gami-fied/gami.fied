# Analytics CSV Export Specification

Gami.Fied Community Edition supports direct CSV export for project analytics tabular datasets.

---

## Supported Export Types

- **`overview`**: Summary overview metrics (Total Users, Active Users, Events Processed, XP Awarded, Achievements Unlocked, Challenges Completed).
- **`users`**: End user directory (`User ID`, `External ID`, `Name`, `Email`, `Active`, `Created At`).
- **`events`**: Event log summary (`Event ID`, `Event Type`, `User ID`, `Occurred At`, `Idempotency Key`).
- **`xp`**: XP ledger audit table (`Ledger ID`, `User ID`, `Amount`, `Reason`, `Created At`).
- **`achievements`**: Unlocked achievements (`Achievement ID`, `Achievement Name`, `User ID`, `Awarded At`).

---

## Safety Limits & Boundaries

To ensure safe memory consumption and prevent database starvation on large datasets:
1. **Row Count Cap**: CSV export responses are hard-capped at a maximum of **5,000 rows**.
2. **Date Window Cap**: Custom date ranges for exports are hard-capped at a maximum window of **90 days**.
3. **Field Sanitization**: Quotes and double quotes in user strings are automatically escaped (`""`).
