# Quick Start: Python

Integrate Gami.Fied Community Engine via Python `requests`.

```python
import requests
import uuid

API_KEY = "gami_pk_live_REPLACE_ME"
API_URL = "https://gamiapi.fied.cc/v1/events"

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
    "Idempotency-Key": str(uuid.uuid4())
}

payload = {
    "event": "purchase",
    "user_id": "user_123",
    "payload": {
        "amount": 4999,
        "currency": "USD"
    }
}

response = requests.post(API_URL, json=payload, headers=headers)

if response.status_code == 202:
    data = response.json()
    print(f"Event Accepted! Event ID: {data['id']}, Duplicate: {data['duplicate']}")
else:
    print(f"Error {response.status_code}: {response.json()}")
```
