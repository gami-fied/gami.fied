# XP & Points API Guide (`gami.xp`)

The XP API allows querying user balances, auditing transaction ledgers, fetching project metrics, and executing manual XP adjustments with idempotency safety.

---

## 1. Get User XP Balance (`gami.xp.getBalance`)

```typescript
const balance = await gami.xp.getBalance({
  projectId: 'prj_123',
  userId: 'usr_101',
});

console.log(`User Total XP: ${balance.totalXp}`);
```

---

## 2. Get Transaction Ledger (`gami.xp.getLedger`)

```typescript
const ledger = await gami.xp.getLedger({
  projectId: 'prj_123',
  userId: 'usr_101',
  page: 1,
  limit: 20,
});

console.log(`Total transactions: ${ledger.total}`);
ledger.entries.forEach((tx) => {
  console.log(`+${tx.amount} XP for ${tx.reason} at ${tx.createdAt}`);
});
```

---

## 3. Manual XP Adjustment (`gami.xp.adjust`)

Executes an administrative XP adjustment for a user.

```typescript
const adjustment = await gami.xp.adjust({
  projectId: 'prj_123',
  userId: 'usr_101',
  amount: 250,
  reason: 'Customer Support Bonus',
  idempotencyKey: 'cust_supp_grant_001', // Optional: auto-generated if omitted
});

console.log('Adjustment Recorded ID:', adjustment.id);
```

> [!NOTE]
> If `idempotencyKey` is omitted, `@gami/sdk` automatically generates a single idempotency key and reuses it across retry attempts for exact-once delivery.
