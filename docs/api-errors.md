# API errors

Every error uses a standard HTTP status and the same JSON body.

## Error format

```json
{
  "error": {
    "code": "BAD_REQUEST",
    "message": "Invalid event request schema",
    "requestId": "req_1724001122334_a1b2c3d4",
    "details": { "_errors": [], "event": { "_errors": ["Required"] } }
  },
  "message": "Invalid event request schema",
  "code": "BAD_REQUEST"
}
```

- `error.code`: stable code to check in your own code.
- `error.message`: explanation for developers. The wording can change.
- `error.requestId`: quote this when asking for help. See [Request IDs](./request-ids.md).
- `error.details`: which fields failed, when the request was invalid.
- `message` and `code`: copies kept at the top level for older clients.

## Common codes

| Status | Code | Meaning |
| :--- | :--- | :--- |
| `400` | `BAD_REQUEST` | The body is malformed, or a field is missing or invalid |
| `401` | `UNAUTHORIZED` | The API key, token or session is missing, wrong or expired |
| `403` | `FORBIDDEN` | The key lacks the scope, the user is deactivated, or the organization is suspended |
| `404` | `NOT_FOUND` | It doesn't exist in this project |
| `409` | `CONFLICT` | It already exists |
| `409` | `IDEMPOTENCY_KEY_MISMATCH` | An `Idempotency-Key` was reused with a different request |
| `413` | `PAYLOAD_TOO_LARGE` | The event payload is over 64 KB |
| `422` | `INSUFFICIENT_XP` | An adjustment would take the balance below zero |
| `429` | `TOO_MANY_REQUESTS` | Too many requests. Wait for the seconds in `Retry-After` |
| `500` | `INTERNAL_SERVER_ERROR` | Something went wrong on the server |

## Other codes

| Code | Meaning |
| :--- | :--- |
| `EMAIL_NOT_VERIFIED` | The account must verify its email first |
| `ORIGIN_NOT_ALLOWED` | The site isn't allowed to use end-user tokens for this project |
| `REGISTRATION_CLOSED` | The server doesn't allow new sign-ups |
| `PASSWORD_POLICY` | The password doesn't meet the server's rules |
| `ACCOUNT_LOCKED` | Too many failed sign-ins. Try again later |
| `ORG_CREATION_DISABLED` | Only platform admins can create organizations |
| `API_KEY_CREATION_DISABLED` | New API keys are turned off on this server |
| `WEBHOOK_CREATION_DISABLED` | New webhooks are turned off on this server |
| `WEBHOOK_LIMIT_REACHED` | The project has reached its webhook limit |

In a batch, a refused event reports its reason in its own `results` entry, such as `USER_DEACTIVATED`.
