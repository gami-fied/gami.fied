# Health & Readiness Probes

Gami exposes distinct health check endpoints designed for Kubernetes, Docker Compose, load balancers, and monitoring systems.

## 1. Process Liveness Health Check (`GET /health`)

- **Purpose**: Confirms that the HTTP server process is running and responding.
- **Dependencies**: None (no database, Redis, or external I/O checks).
- **Authentication**: Unauthenticated.
- **HTTP Status Codes**:
  - `200 OK`: Server is alive.

```json
{
  "status": "ok",
  "timestamp": "2026-08-15T23:20:00.000Z"
}
```

## 2. Dependency Readiness Probe (`GET /ready`)

- **Purpose**: Verifies that required core infrastructure dependencies are ready to accept traffic.
- **Dependencies Checked**:
  - **PostgreSQL**: Queries database health (`SELECT 1`).
  - **Redis**: Sends a PING command to Redis.
- **Note**: Does **NOT** depend on worker heartbeat so API readiness is decoupled from worker polling.
- **Authentication**: Unauthenticated.
- **HTTP Status Codes**:
  - `200 OK`: Both PostgreSQL and Redis are connected.
  - `503 Service Unavailable`: PostgreSQL or Redis is disconnected.

```json
{
  "status": "ready",
  "postgres": "connected",
  "redis": "connected",
  "timestamp": "2026-08-15T23:20:00.000Z"
}
```
