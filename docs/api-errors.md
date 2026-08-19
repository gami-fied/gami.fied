# Standardized API Error System

Gami.Fied API provides standardized, machine-readable error responses on all non-2xx status codes.

## Error Response Format

```json
{
  "error": {
    "code": "USER_NOT_FOUND",
    "message": "No user exists with the specified external ID.",
    "requestId": "req_1724001122334_a1b2c3d4"
  },
  "message": "No user exists with the specified external ID.",
  "code": "USER_NOT_FOUND"
}
```

### Response Fields
- `error.code`: Machine-readable error code string.
- `error.message`: Clear human-readable description of the error.
- `error.requestId`: The unique request correlation ID for tracing.
- `message` & `code`: Top-level alias fields provided for backwards compatibility.

## Standard Error Codes & Status Codes

| HTTP Status | Error Code | Description |
|---|---|---|
| `400` | `BAD_REQUEST` | Malformed request body, invalid JSON, or missing required fields |
| `401` | `UNAUTHORIZED` | Missing or invalid `x-api-key` header |
| `403` | `FORBIDDEN` | Suspended organization or deactivated user |
| `404` | `NOT_FOUND` | Resource not found |
| `409` | `IDEMPOTENCY_KEY_MISMATCH` | Reused `Idempotency-Key` with a different request payload |
| `413` | `PAYLOAD_TOO_LARGE` | Event payload exceeds 64KB size limit |
| `429` | `TOO_MANY_REQUESTS` | Project rate limit exceeded |
| `500` | `INTERNAL_SERVER_ERROR` | Internal server error |
