# Request Tracing & Correlation IDs (`X-Request-Id`)

Gami.Fied API implements end-to-end request tracing using correlation IDs.

## How `X-Request-Id` Works

1. **Client Header**: Clients may supply a custom `X-Request-Id` header (max 64 characters, alphanumeric/dashes).
2. **Auto Generation**: If absent or invalid, the API server generates a unique request ID in the format `req_<timestamp>_<random>`.
3. **Response Header**: Every API response includes the `X-Request-Id` header.
4. **Error Payloads**: All API error responses include `requestId` in the `error` object.
5. **Server Logs**: Server-side logs record `requestId` on every log line.

## Request ID Header Example

```http
HTTP/1.1 202 Accepted
x-request-id: req_1724001122334_a1b2c3d4
Content-Type: application/json
```
