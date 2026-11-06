# Quick Start: cURL / REST API

Integrate Gami.Fied via cURL / REST in a few steps.

## Step 1: Obtain an API Key
In the dashboard, go to **Connect > API Keys** and generate a key. Copy it straight away, because it's only shown once. It starts `gami_live_`, and the key already identifies your project.

## Step 2: Send a Test Event
Send an activity event using cURL:

```bash
curl -X POST https://api.example.com/v1/events \
  -H "Content-Type: application/json" \
  -H "x-api-key: gami_live_REPLACE_ME" \
  -H "Idempotency-Key: test_evt_001" \
  -d '{
    "event": "purchase",
    "user_id": "user_123",
    "payload": {
      "amount": 4999
    }
  }'
```

## Step 3: Verify Response
The API responds with `202 Accepted`:
```json
{
  "id": "evt_1724001122_a1b2c3d4",
  "status": "accepted",
  "duplicate": false
}
```

## Step 4: Test Idempotency Retry
Re-run the exact same cURL command with `Idempotency-Key: test_evt_001`:
```json
{
  "id": "evt_1724001122_a1b2c3d4",
  "status": "accepted",
  "duplicate": true
}
```

## Step 5: Create a Rule in Dashboard
In Dashboard -> **Rules**, create a rule:
- **Event**: `purchase`
- **Action**: Award `100 XP`

## Step 6: Check the Result
Send another event with a new `Idempotency-Key`, then open **XP History** in the dashboard and look up `user_123` to see the 100 XP.

## Step 7: Error Handling
Test invalid API key:
```bash
curl -i -X POST https://api.example.com/v1/events \
  -H "x-api-key: invalid_key"
```
Response:
```json
{
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Invalid or revoked API key",
    "requestId": "req_1724001122..."
  }
}
```
