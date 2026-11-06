# Quick Start: React Client

Your React app calls your own backend, and your backend sends the event to Gami.Fied.

> [!IMPORTANT]
> Always send events from your backend API route or Server Action to keep your secret `gami_live_...` API key secure.

```tsx
// src/components/PurchaseButton.tsx
import React, { useState } from 'react';

export function PurchaseButton({ userId, amount }: { userId: string; amount: number }) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handlePurchase = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount }),
      });
      const data = await res.json();
      setStatus(`Success! Event ID: ${data.id}`);
    } catch {
      setStatus('Purchase failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button onClick={handlePurchase} disabled={loading}>
        {loading ? 'Processing...' : `Purchase $${amount / 100}`}
      </button>
      {status && <p>{status}</p>}
    </div>
  );
}
```

This assumes your backend has a `/api/purchase` route that sends the event. See the [Node.js](./node.md) or [Next.js](./nextjs.md) quick start.

To show a user their own XP or achievements directly from the browser, use an end-user token. See [Using the SDK in a browser](../sdk.md#using-the-sdk-in-a-browser).
