# Quick Start: React Client

Best practice guide for integrating Gami.Fied with React applications.

> [!IMPORTANT]
> Always send events from your backend API route or Server Action to keep your secret `gami_pk_live_...` API key secure.

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
