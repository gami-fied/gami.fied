import { useState, useCallback } from 'react';

export interface XpSummary {
  totalXpAwarded: number;
  totalTransactions: number;
  totalUsersWithXp: number;
  topUsers: Array<{
    userId: string;
    externalId: string;
    totalXp: number;
  }>;
}

export interface LedgerEntry {
  id: string;
  projectId: string;
  userId: string;
  eventId: string | null;
  ruleId: string | null;
  ruleExecutionId: string | null;
  amount: number;
  reason: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export function useXp(projectId: string | null) {
  const [summary, setSummary] = useState<XpSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);

  const fetchXpSummary = useCallback(async () => {
    if (!projectId) return;
    setLoadingSummary(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/xp/summary`);
      if (res.ok) {
        setSummary(await res.json());
      }
    } catch {
      // Ignore
    } finally {
      setLoadingSummary(false);
    }
  }, [projectId]);

  const fetchUserLedger = useCallback(
    async (userId: string, page = 1) => {
      if (!projectId || !userId.trim()) return;
      setLoadingLedger(true);
      try {
        const [balRes, ledgerRes] = await Promise.all([
          fetch(`/api/projects/${projectId}/users/${userId.trim()}/xp`),
          fetch(
            `/api/projects/${projectId}/users/${userId.trim()}/xp/ledger?page=${page}&limit=20`
          ),
        ]);

        if (balRes.ok) {
          const balData = await balRes.json();
          setUserBalance(balData.totalXp);
        }

        if (ledgerRes.ok) {
          const ledgerData = await ledgerRes.json();
          setLedger(ledgerData.data || []);
        }
      } catch {
        setLedger([]);
        setUserBalance(null);
      } finally {
        setLoadingLedger(false);
      }
    },
    [projectId]
  );

  const adjustXp = async (
    userId: string,
    amount: number,
    reason: string,
    idempotencyKey?: string
  ) => {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}/users/${userId}/xp/adjust`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({
        amount,
        reason,
        idempotencyKey,
      }),
    });

    if (res.ok) {
      await fetchXpSummary();
      await fetchUserLedger(userId);
      return await res.json();
    } else {
      const err = await res.json();
      throw new Error(err.message || 'Failed to adjust XP');
    }
  };

  return {
    summary,
    loadingSummary,
    ledger,
    userBalance,
    loadingLedger,
    fetchXpSummary,
    fetchUserLedger,
    adjustXp,
  };
}
