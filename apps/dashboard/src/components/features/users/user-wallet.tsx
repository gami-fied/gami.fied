'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { usePermissions } from '@/hooks/use-permissions';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Gift, Wallet } from 'lucide-react';

interface WalletBalance {
  currency: string;
  name: string;
  symbol: string | null;
  balance: number;
  expiringSoon: number;
}

interface WalletEntry {
  id: string;
  amount: number;
  kind: string;
  reason: string;
  createdAt: string;
}

interface Purchase {
  id: string;
  rewardName: string;
  cost: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  code: string | null;
  createdAt: string;
}

const KIND_LABEL: Record<string, string> = { earn: 'Earned', spend: 'Spent', refund: 'Refund', expire: 'Expired', adjust: 'Adjusted by hand' };
const STATUS_BADGE = { pending: 'orange', fulfilled: 'emerald', cancelled: 'zinc' } as const;
const STATUS_LABEL = { pending: 'Waiting', fulfilled: 'Delivered', cancelled: 'Cancelled' } as const;

/** A person's balances in each currency, what they have bought, and a way to adjust by hand. */
export function UserWallet({ base }: { base: string }) {
  const toast = useToast();
  const { isAdminOrOwner } = usePermissions();

  const [wallets, setWallets] = useState<WalletBalance[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [entries, setEntries] = useState<WalletEntry[] | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [failed, setFailed] = useState(false);

  const [adjustOpen, setAdjustOpen] = useState(false);
  const [currency, setCurrency] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [w, p] = await Promise.all([apiFetch(`${base}/wallets`), apiFetch(`${base}/redemptions`)]);
      if (!w.ok || !p.ok) throw new Error('failed');
      const list = (await w.json()).data as WalletBalance[];
      setWallets(list);
      setPurchases((await p.json()).data);
      setSelected((current) => current ?? list[0]?.currency ?? null);
    } catch {
      setFailed(true);
    }
  }, [base]);

  const loadEntries = useCallback(async () => {
    if (!selected) return;
    const res = await apiFetch(`${base}/wallets/${encodeURIComponent(selected)}/ledger?limit=50`);
    if (res.ok) setEntries((await res.json()).data);
  }, [base, selected]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setEntries(null);
    void loadEntries();
  }, [loadEntries]);

  const openAdjust = () => {
    setCurrency(selected ?? wallets?.[0]?.currency ?? '');
    setAmount('');
    setReason('');
    setAdjustOpen(true);
  };

  const adjust = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = Number.parseInt(amount, 10);
    if (!Number.isInteger(parsed) || parsed === 0) {
      toast.error('Enter a whole number other than 0. Use a negative number to remove points.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`${base}/wallets/${encodeURIComponent(currency)}/adjust`, {
        method: 'POST',
        body: JSON.stringify({ amount: parsed, reason: reason.trim() || 'Manual adjustment', idempotencyKey: `adj_${crypto.randomUUID()}` }),
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? 'The adjustment failed.');
      toast.success(parsed > 0 ? `Gave ${parsed.toLocaleString()} points.` : `Removed ${Math.abs(parsed).toLocaleString()} points.`);
      setAdjustOpen(false);
      setSelected(currency);
      await Promise.all([load(), loadEntries()]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The adjustment failed.');
    } finally {
      setSaving(false);
    }
  };

  if (failed) return <p className="text-sm text-danger-300">The wallet couldn&apos;t load.</p>;
  if (!wallets) return <Skeleton className="h-28 w-full" />;

  if (wallets.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="No currencies yet"
        description="Create a currency on the Store page and people can start saving it."
        action={undefined}
      />
    );
  }

  const options = wallets.map((item) => ({ value: item.currency, label: `${item.symbol ? `${item.symbol} ` : ''}${item.name}`, sublabel: item.currency }));
  const current = wallets.find((item) => item.currency === selected) ?? wallets[0]!;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {wallets.map((item) => (
          <button
            key={item.currency}
            type="button"
            onClick={() => setSelected(item.currency)}
            className={`border p-4 text-left transition-colors ${current.currency === item.currency ? 'border-brand-500/70 bg-brand-950/20' : 'border-zinc-800 bg-zinc-950/80 hover:border-zinc-700'}`}
          >
            <div className="text-xs text-zinc-400">{item.symbol ? `${item.symbol} ` : ''}{item.name}</div>
            <div className="text-xl font-black text-zinc-100">{item.balance.toLocaleString()}</div>
            {item.expiringSoon > 0 && <div className="mt-0.5 text-xs text-orange-300">{item.expiringSoon.toLocaleString()} expire in the next 7 days</div>}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-bold">{current.name} history</CardTitle>
              <CardDescription>Every change, newest first.</CardDescription>
            </div>
            {isAdminOrOwner && (
              <Button variant="primary" size="sm" onClick={openAdjust}>
                <Gift className="h-3.5 w-3.5" />
                Give or remove
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {!entries ? (
              <Skeleton className="h-24 w-full" />
            ) : entries.length === 0 ? (
              <p className="text-sm text-zinc-400">Nothing yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Change</TableHead>
                    <TableHead>What</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className={`text-xs font-semibold ${entry.amount > 0 ? 'text-success-300' : 'text-danger-300'}`}>{entry.amount > 0 ? '+' : ''}{entry.amount.toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-zinc-300">
                        {entry.reason}
                        <span className="block text-zinc-500">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400" title={formatDateTime(entry.createdAt)}>{formatRelativeTime(entry.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Purchases</CardTitle>
            <CardDescription>
              What they have bought. Manage deliveries on the <Link href="/dashboard/store" className="text-brand-400 hover:underline">Store page</Link>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!purchases ? (
              <Skeleton className="h-24 w-full" />
            ) : purchases.length === 0 ? (
              <p className="text-sm text-zinc-400">They haven&apos;t bought anything.</p>
            ) : (
              <ul className="divide-y divide-zinc-800">
                {purchases.map((purchase) => (
                  <li key={purchase.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <div className="truncate text-sm text-zinc-200">{purchase.rewardName}</div>
                      <div className="text-xs text-zinc-500" title={formatDateTime(purchase.createdAt)}>
                        {purchase.cost.toLocaleString()} points · {formatRelativeTime(purchase.createdAt)}
                        {purchase.code && <span className="ml-2 font-mono">{purchase.code}</span>}
                      </div>
                    </div>
                    <Badge variant={STATUS_BADGE[purchase.status]}>{STATUS_LABEL[purchase.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} title="Give or remove points" description="Recorded in their history with your reason. Points given this way follow the currency's expiry.">
        <form onSubmit={adjust} className="space-y-4">
          <div>
            <span className="mb-1 block text-xs font-semibold text-zinc-300">Currency</span>
            <Dropdown options={options} value={currency} onChange={setCurrency} />
          </div>
          <Input label="Amount *" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} helperText="Use a negative number to remove points." required />
          <Input label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Support goodwill" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>Save</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
