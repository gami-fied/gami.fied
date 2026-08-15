# Rate Limiting & Response Headers

Gami features project-scoped sliding window rate limiting backed by Redis.

## Headers Included on All Rate-Limited Endpoints

Every API request evaluated by the rate limiter returns standard HTTP rate limit headers:

- `X-RateLimit-Limit`: Maximum allowed requests per time window (e.g. `100`).
- `X-RateLimit-Remaining`: Number of remaining allowed requests in the current window.
- `X-RateLimit-Reset`: Unix timestamp (in seconds) when the rate limit window resets.

## Rate Limit Exceeded (HTTP 429)

When a project exceeds its request quota within the window, the API returns `HTTP 429 Too Many Requests` with a `Retry-After` header indicating wait duration in seconds:

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 60
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1786656000

{
  "error": "Too Many Requests",
  "message": "Rate limit of 100 requests per 60s exceeded"
}
```

## Fail-Open Resilience

If Redis is temporarily offline or unreachable in non-production environments, the rate limiter fails open, allowing events to be accepted into the PostgreSQL outbox without breaking customer event ingestion pipelines.
