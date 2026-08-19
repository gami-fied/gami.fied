# Quick Start: cURL / REST API

Integrate Gami.Fied Community Engine via cURL / REST in 8 simple steps.

## Step 1: Obtain an API Key
In Gami.Fied Dashboard -> **Developer** -> **API Keys**, click **Create API Key**. Copy your server-side API key (`gami_pk_live_...`).

## Step 2: Identify your Project ID
Find your Project ID in the Dashboard header or URL (e.g. `prj_123456789`).

## Step 3: Send a Test Event
Send an activity event using cURL:

```bash
curl -X POST https://gamiapi.fied.cc/v1/events \
  -H "Content-Type: application/json" \
  -H "x-api-key: gami_pk_live_REPLACE_ME" \
  -H "Idempotency-Key: test_evt_001" \
  -d '{
    "event": "purchase",
    "user_id": "user_123",
    "payload": {
      "amount": 4999
    }
  }'
```

## Step 4: Verify Response
The API responds with `202 Accepted`:
```json
{
  "id": "evt_1724001122_a1b2c3d4",
  "status": "accepted",
  "duplicate": false
}
```

## Step 5: Test Idempotency Retry
Re-run the exact same cURL command with `Idempotency-Key: test_evt_001`:
```json
{
  "id": "evt_1724001122_a1b2c3d4",
  "status": "accepted",
  "duplicate": true
}
```

## Step 6: Create a Rule in Dashboard
In Dashboard -> **Rules**, create a rule:
- **Event**: `purchase`
- **Action**: Award `100 XP`

## Step 7: Verify User Gamification Results
Check **XP & Progression** tab for user `user_123` to verify 100 XP awarded.

## Step 8: Error Handling
Test invalid API key:
```bash
curl -i -X POST https://gamiapi.fied.cc/v1/events \
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
