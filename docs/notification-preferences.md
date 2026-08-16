# User Notification Preferences

End-user notification channel preferences are project-scoped and stored in `notification_preferences`.

## Preference Model & Default Rules

- **Unique Constraint**: `(projectId, userId, channel, notificationType)`
- **Channels**: `in_app`, `email`
- **Notification Types**: `xp_awarded`, `achievement_unlocked`, `level_up`, `challenge_completed`

### Defaults
- `in_app`: `enabled = true` (Default on for all users).
- `email`: `enabled = false` (Default off unless explicitly enabled by user or admin).

## Notification Preferences API

### 1. Get Notification Preferences
```http
GET /api/projects/:projectId/users/:userId/notification-preferences
```
Returns list of channel preferences for the user.

### 2. Update Notification Preferences
```http
PATCH /api/projects/:projectId/users/:userId/notification-preferences
```

#### Request Body
```json
{
  "preferences": [
    {
      "channel": "email",
      "notificationType": "achievement_unlocked",
      "enabled": true
    },
    {
      "channel": "email",
      "notificationType": "level_up",
      "enabled": true
    }
  ]
}
```
