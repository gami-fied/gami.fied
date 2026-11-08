'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { usePermissions } from '@/hooks/use-permissions';
import Link from 'next/link';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { AdminOnly } from '@/components/ui/admin-only';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/checkbox';
import { useConfirm } from '@/components/ui/confirm';
import { Dialog } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { EmptyState } from '@/components/ui/empty-state';
import { Input, Textarea } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { Coins, Edit2, KeyRound, Package, Plus, ShoppingBag, Trash2 } from 'lucide-react';

type Tab = 'rewards' | 'purchases' | 'currencies';

interface Currency {
  id: string;
  key: string;
  name: string;
  symbol: string | null;
  expiresAfterDays: number | null;
  enabled: boolean;
}

interface Reward {
  id: string;
  key: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  currency: string;
  currencyName: string;
  currencySymbol: string | null;
  cost: number;
  stock: number | null;
  perUserLimit: number | null;
  kind: 'fulfilled_by_you' | 'code' | 'generated';
  codePrefix?: string | null;
  enabled: boolean;
  codesTotal: number;
  codesLeft: number;
  redeemed: number;
}

interface Purchase {
  id: string;
  userId: string;
  externalId: string;
  name: string | null;
  rewardName: string;
  cost: number;
  status: 'pending' | 'fulfilled' | 'cancelled';
  code: string | null;
  note: string | null;
  createdAt: string;
}

const KIND_OPTIONS = [
  { value: 'fulfilled_by_you', label: 'You deliver it', sublabel: 'A purchase waits for you. A webhook tells your systems.' },
  { value: 'code', label: 'Hands out a code from a list', sublabel: 'Gift cards you paste in. Delivered the moment it is bought.' },
  { value: 'generated', label: 'Makes a unique coupon code', sublabel: 'For coupons your shop accepts. Never runs out.' },
];

const STATUS_FILTERS = [
  { value: 'pending', label: 'Waiting for you' },
  { value: 'fulfilled', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: '', label: 'All purchases' },
];

const STATUS_BADGE = { pending: 'orange', fulfilled: 'emerald', cancelled: 'zinc' } as const;

const errorOf = async (res: Response, fallback: string) => ((await res.json().catch(() => null)) as { message?: string } | null)?.message ?? fallback;

export function StoreView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id ?? null;
  const toast = useToast();
  const confirm = useConfirm();
  const { isAdminOrOwner } = usePermissions();

  const [tab, setTab] = useState<Tab>('rewards');
  const [currencies, setCurrencies] = useState<Currency[] | null>(null);
  const [rewards, setRewards] = useState<Reward[] | null>(null);
  const [purchases, setPurchases] = useState<Purchase[] | null>(null);
  const [status, setStatus] = useState('pending');
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Currency form
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [cKey, setCKey] = useState('');
  const [cName, setCName] = useState('');
  const [cSymbol, setCSymbol] = useState('');
  const [cExpiry, setCExpiry] = useState('');

  // Reward form
  const [rewardOpen, setRewardOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [rKey, setRKey] = useState('');
  const [rName, setRName] = useState('');
  const [rDescription, setRDescription] = useState('');
  const [rImage, setRImage] = useState('');
  const [rCurrency, setRCurrency] = useState('');
  const [rCost, setRCost] = useState('100');
  const [rStock, setRStock] = useState('');
  const [rLimit, setRLimit] = useState('');
  const [rKind, setRKind] = useState<Reward['kind']>('fulfilled_by_you');
  const [rPrefix, setRPrefix] = useState('');

  // Codes form
  const [codesFor, setCodesFor] = useState<Reward | null>(null);
  const [codesText, setCodesText] = useState('');

  const loadCatalog = useCallback(async () => {
    if (!projectId) return;
    setError(false);
    try {
      const [c, r] = await Promise.all([apiFetch(`/api/projects/${projectId}/currencies`), apiFetch(`/api/projects/${projectId}/rewards`)]);
      if (!c.ok || !r.ok) throw new Error('failed');
      setCurrencies((await c.json()).data);
      setRewards((await r.json()).data);
    } catch {
      setError(true);
    }
  }, [projectId]);

  const loadPurchases = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await apiFetch(`/api/projects/${projectId}/redemptions?limit=100${status ? `&status=${status}` : ''}`);
      if (!res.ok) throw new Error('failed');
      setPurchases((await res.json()).data);
    } catch {
      setError(true);
    }
  }, [projectId, status]);

  useEffect(() => {
    setCurrencies(null);
    setRewards(null);
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    setPurchases(null);
    void loadPurchases();
  }, [loadPurchases]);

  const currencyOptions = useMemo(() => (currencies ?? []).filter((item) => item.enabled).map((item) => ({ value: item.key, label: `${item.symbol ? `${item.symbol} ` : ''}${item.name}`, sublabel: item.key })), [currencies]);
  const pendingCount = purchases && status === 'pending' ? purchases.length : null;

  // ---------- Currencies ----------
  const openCurrency = (currency: Currency | null) => {
    setEditingCurrency(currency);
    setCKey(currency?.key ?? '');
    setCName(currency?.name ?? '');
    setCSymbol(currency?.symbol ?? '');
    setCExpiry(currency?.expiresAfterDays ? String(currency.expiresAfterDays) : '');
    setFormError(null);
    setCurrencyOpen(true);
  };

  const saveCurrency = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);
    try {
      const body = { ...(editingCurrency ? {} : { key: cKey.trim() }), name: cName.trim(), symbol: cSymbol.trim() || null, expiresAfterDays: cExpiry ? Number(cExpiry) : null };
      const res = await apiFetch(editingCurrency ? `/api/projects/${projectId}/currencies/${editingCurrency.id}` : `/api/projects/${projectId}/currencies`, {
        method: editingCurrency ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await errorOf(res, 'The currency could not be saved.'));
      toast.success(editingCurrency ? 'Currency saved.' : 'Currency created.');
      setCurrencyOpen(false);
      await loadCatalog();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The currency could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggleCurrency = async (currency: Currency, enabled: boolean) => {
    if (!projectId) return;
    const res = await apiFetch(`/api/projects/${projectId}/currencies/${currency.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    if (!res.ok) toast.error('The change could not be saved.');
    await loadCatalog();
  };

  // ---------- Rewards ----------
  const openReward = (reward: Reward | null) => {
    setEditingReward(reward);
    setRKey(reward?.key ?? '');
    setRName(reward?.name ?? '');
    setRDescription(reward?.description ?? '');
    setRImage(reward?.imageUrl ?? '');
    setRCurrency(reward?.currency ?? currencyOptions[0]?.value ?? '');
    setRCost(String(reward?.cost ?? 100));
    setRStock(reward?.stock != null ? String(reward.stock) : '');
    setRLimit(reward?.perUserLimit != null ? String(reward.perUserLimit) : '');
    setRKind(reward?.kind ?? 'fulfilled_by_you');
    setRPrefix(reward?.codePrefix ?? '');
    setFormError(null);
    setRewardOpen(true);
  };

  const saveReward = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId) return;
    setSaving(true);
    setFormError(null);
    try {
      const shared = {
        name: rName.trim(),
        description: rDescription.trim() || null,
        imageUrl: rImage.trim() || null,
        cost: Number(rCost),
        stock: rStock === '' ? null : Number(rStock),
        perUserLimit: rLimit === '' ? null : Number(rLimit),
      };
      const body = editingReward ? shared : { ...shared, key: rKey.trim(), currency: rCurrency, kind: rKind, ...(rKind === 'generated' ? { codePrefix: rPrefix.trim() || null } : {}) };
      const res = await apiFetch(editingReward ? `/api/projects/${projectId}/rewards/${editingReward.id}` : `/api/projects/${projectId}/rewards`, {
        method: editingReward ? 'PATCH' : 'POST',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await errorOf(res, 'The reward could not be saved.'));
      toast.success(editingReward ? 'Reward saved.' : 'Reward created.');
      setRewardOpen(false);
      await loadCatalog();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The reward could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const toggleReward = async (reward: Reward, enabled: boolean) => {
    if (!projectId) return;
    const res = await apiFetch(`/api/projects/${projectId}/rewards/${reward.id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) });
    if (!res.ok) toast.error('The change could not be saved.');
    await loadCatalog();
  };

  const removeReward = async (reward: Reward) => {
    if (!projectId) return;
    const ok = await confirm({ title: `Delete “${reward.name}”?`, message: 'It disappears from the store. A reward that has been bought cannot be deleted, only switched off.', confirmText: 'Delete', isDanger: true });
    if (!ok) return;
    const res = await apiFetch(`/api/projects/${projectId}/rewards/${reward.id}`, { method: 'DELETE' });
    if (res.ok) toast.success('Deleted.');
    else toast.error(await errorOf(res, 'It could not be deleted.'));
    await loadCatalog();
  };

  const saveCodes = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!projectId || !codesFor) return;
    const codes = codesText.split(/[\s,]+/).map((code) => code.trim()).filter(Boolean);
    if (codes.length === 0) {
      setFormError('Paste at least one code.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch(`/api/projects/${projectId}/rewards/${codesFor.id}/codes`, { method: 'POST', body: JSON.stringify({ codes }) });
      if (!res.ok) throw new Error(await errorOf(res, 'The codes could not be added.'));
      const { added, skipped } = (await res.json()) as { added: number; skipped: number };
      toast.success(`${added} code${added === 1 ? '' : 's'} added${skipped > 0 ? `, ${skipped} already there` : ''}.`);
      setCodesFor(null);
      await loadCatalog();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'The codes could not be added.');
    } finally {
      setSaving(false);
    }
  };

  // ---------- Purchases ----------
  const settle = async (purchase: Purchase, action: 'fulfill' | 'cancel') => {
    if (!projectId) return;
    if (action === 'cancel') {
      const ok = await confirm({
        title: 'Cancel this purchase?',
        message: `${purchase.name || purchase.externalId} gets their ${purchase.cost.toLocaleString()} points back, and the stock is put back.`,
        confirmText: 'Cancel purchase',
        isDanger: true,
      });
      if (!ok) return;
    }
    const res = await apiFetch(`/api/projects/${projectId}/redemptions/${purchase.id}/${action}`, { method: 'POST', body: JSON.stringify({}) });
    if (res.ok) toast.success(action === 'fulfill' ? 'Marked as delivered.' : 'Cancelled and refunded.');
    else toast.error(await errorOf(res, 'The change could not be saved.'));
    await Promise.all([loadPurchases(), loadCatalog()]);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Store"
        description="Let people spend the points they earn on rewards you offer."
        actions={
          <AdminOnly>
            {tab === 'currencies' ? (
              <Button variant="primary" size="sm" onClick={() => openCurrency(null)}>
                <Plus className="h-4 w-4" />
                New currency
              </Button>
            ) : tab === 'rewards' ? (
              <Button variant="primary" size="sm" onClick={() => openReward(null)} disabled={currencyOptions.length === 0} title={currencyOptions.length === 0 ? 'Create a currency first' : undefined}>
                <Plus className="h-4 w-4" />
                New reward
              </Button>
            ) : null}
          </AdminOnly>
        }
        toolbar={
          <div role="tablist" className="flex gap-1 overflow-x-auto">
            {([['rewards', 'Rewards'], ['purchases', 'Purchases'], ['currencies', 'Currencies']] as [Tab, string][]).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`whitespace-nowrap border-b-2 px-3 py-1.5 text-sm transition-colors ${tab === id ? 'border-brand-500 text-zinc-100' : 'border-transparent text-zinc-400 hover:text-zinc-200'}`}
              >
                {label}
                {id === 'purchases' && pendingCount ? <Badge variant="orange" className="ml-2">{pendingCount}</Badge> : null}
              </button>
            ))}
          </div>
        }
      />

      {error && (
        <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
          This couldn&apos;t load. <button className="underline" onClick={() => { void loadCatalog(); void loadPurchases(); }}>Try again</button>
        </div>
      )}
      {!currencies && !error && <CardSkeleton />}

      {tab === 'currencies' && currencies && (
        <>
          <p className="text-xs text-zinc-400">
            A currency is a kind of point people can save and spend, separate from XP. Give it out with the “Give currency” rule action, or by hand from a user&apos;s page. If it expires, points are spent soonest-to-expire first. Changing the expiry affects points earned from now on.
          </p>
          {currencies.length === 0 && (
            <EmptyState icon={Coins} title="No currencies yet" description="Create one, such as Coins or Gems, then price your rewards in it." action={isAdminOrOwner ? { label: 'Create a currency', onClick: () => openCurrency(null) } : undefined} />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {currencies.map((currency) => (
              <Card key={currency.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-zinc-100">{currency.symbol ? `${currency.symbol} ` : ''}{currency.name}</h2>
                        <Badge variant={currency.enabled ? 'emerald' : 'zinc'}>{currency.enabled ? 'On' : 'Off'}</Badge>
                      </div>
                      <p className="mt-1 font-mono text-xs text-zinc-500">{currency.key}</p>
                      <p className="mt-1 text-xs text-zinc-400">{currency.expiresAfterDays ? `Points expire ${currency.expiresAfterDays} days after they are earned` : 'Points never expire'}</p>
                    </div>
                    <AdminOnly>
                      <Switch checked={currency.enabled} onChange={(e) => void toggleCurrency(currency, e.target.checked)} aria-label={`${currency.name} is on`} />
                    </AdminOnly>
                  </div>
                  <AdminOnly>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openCurrency(currency)} aria-label={`Edit ${currency.name}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </AdminOnly>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'rewards' && rewards && (
        <>
          <p className="text-xs text-zinc-400">
            Buying takes the points, the stock and any code in one step, so two people cannot take the last one. A reward you deliver waits under Purchases and sends a <code>reward.redeemed</code> webhook.
          </p>
          {rewards.length === 0 && (
            <EmptyState
              icon={ShoppingBag}
              title="No rewards yet"
              description={currencyOptions.length === 0 ? 'Create a currency first, then add things people can buy with it.' : 'Add a gift card, a discount code, or anything you can deliver.'}
              action={isAdminOrOwner ? (currencyOptions.length === 0 ? { label: 'Create a currency', onClick: () => openCurrency(null) } : { label: 'Add a reward', onClick: () => openReward(null) }) : undefined}
            />
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {rewards.map((reward) => (
              <Card key={reward.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate font-semibold text-zinc-100">{reward.name}</h2>
                        <Badge variant="orange">{reward.currencySymbol ? `${reward.currencySymbol} ` : ''}{reward.cost.toLocaleString()} {reward.currencyName}</Badge>
                        <Badge variant={reward.enabled ? 'emerald' : 'zinc'}>{reward.enabled ? 'On sale' : 'Off'}</Badge>
                      </div>
                      {reward.description && <p className="mt-1 text-xs text-zinc-400">{reward.description}</p>}
                      <p className="mt-1 text-xs text-zinc-500">
                        {reward.redeemed} bought · {reward.stock === null ? 'unlimited stock' : reward.stock === 0 ? 'sold out' : `${reward.stock} left`}
                        {reward.perUserLimit !== null ? ` · ${reward.perUserLimit} per person` : ''}
                      </p>
                      {reward.kind === 'code' && (
                        <p className={`mt-1 text-xs ${reward.codesLeft === 0 ? 'text-danger-300' : reward.codesLeft < 10 ? 'text-orange-300' : 'text-zinc-500'}`}>
                          <KeyRound className="mr-1 inline h-3 w-3" />
                          {reward.codesLeft} of {reward.codesTotal} codes left{reward.codesLeft === 0 ? ': it cannot be bought' : ''}
                        </p>
                      )}
                    </div>
                    <AdminOnly>
                      <Switch checked={reward.enabled} onChange={(e) => void toggleReward(reward, e.target.checked)} aria-label={`${reward.name} is on sale`} />
                    </AdminOnly>
                  </div>
                  <AdminOnly>
                    <div className="flex justify-end gap-1">
                      {reward.kind === 'code' && (
                        <Button variant="ghost" size="sm" onClick={() => { setCodesFor(reward); setCodesText(''); setFormError(null); }}>
                          <KeyRound className="h-3.5 w-3.5" />
                          Add codes
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => openReward(reward)} aria-label={`Edit ${reward.name}`}><Edit2 className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => void removeReward(reward)} aria-label={`Delete ${reward.name}`}><Trash2 className="h-3.5 w-3.5 text-danger-400" /></Button>
                    </div>
                  </AdminOnly>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === 'purchases' && (
        <>
          <div className="max-w-xs">
            <Dropdown options={STATUS_FILTERS} value={status} onChange={setStatus} />
          </div>
          {!purchases && !error && <CardSkeleton />}
          {purchases && purchases.length === 0 && (
            <EmptyState icon={Package} title={status === 'pending' ? 'Nothing waiting for you' : 'No purchases'} description={status === 'pending' ? 'When someone buys a reward you deliver, it shows up here.' : 'Nothing matches this filter.'} />
          )}
          {purchases && purchases.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Reward</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {purchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell><Link href={`/dashboard/users/${purchase.userId}`} className="hover:underline">{purchase.name || purchase.externalId}</Link></TableCell>
                    <TableCell className="text-xs text-zinc-300">
                      {purchase.rewardName}
                      {purchase.code && <span className="ml-2 font-mono text-zinc-500">{purchase.code}</span>}
                      {purchase.note && <span className="block text-zinc-500">{purchase.note}</span>}
                    </TableCell>
                    <TableCell className="text-xs">{purchase.cost.toLocaleString()}</TableCell>
                    <TableCell><Badge variant={STATUS_BADGE[purchase.status]}>{purchase.status === 'pending' ? 'Waiting' : purchase.status === 'fulfilled' ? 'Delivered' : 'Cancelled'}</Badge></TableCell>
                    <TableCell className="text-xs text-zinc-400" title={formatDateTime(purchase.createdAt)}>{formatRelativeTime(purchase.createdAt)}</TableCell>
                    <TableCell>
                      {purchase.status === 'pending' && (
                        <AdminOnly>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => void settle(purchase, 'fulfill')}>Mark delivered</Button>
                            <Button variant="ghost" size="sm" onClick={() => void settle(purchase, 'cancel')}>Cancel &amp; refund</Button>
                          </div>
                        </AdminOnly>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </>
      )}

      <Dialog isOpen={currencyOpen} onClose={() => setCurrencyOpen(false)} title={editingCurrency ? `Edit ${editingCurrency.name}` : 'New currency'} description="A kind of point people can save and spend.">
        <form onSubmit={saveCurrency} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name *" value={cName} onChange={(e) => setCName(e.target.value)} placeholder="Coins" required />
            <Input label="Symbol (optional)" value={cSymbol} onChange={(e) => setCSymbol(e.target.value)} placeholder="🪙" maxLength={8} />
          </div>
          {!editingCurrency && <Input label="Key *" value={cKey} onChange={(e) => setCKey(e.target.value)} placeholder="coins" helperText="Used by rules and the API. Letters, numbers, dashes and underscores. It cannot change later." required />}
          <Input label="Expire after (days, optional)" type="number" min={1} value={cExpiry} onChange={(e) => setCExpiry(e.target.value)} helperText="Blank means points never expire. Only affects points earned from now on." />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCurrencyOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>{editingCurrency ? 'Save changes' : 'Create currency'}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog isOpen={rewardOpen} onClose={() => setRewardOpen(false)} title={editingReward ? `Edit ${editingReward.name}` : 'New reward'} description="Something people can buy with their points.">
        <form onSubmit={saveReward} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Name *" value={rName} onChange={(e) => setRName(e.target.value)} placeholder="Free coffee" required />
            {!editingReward && <Input label="Key *" value={rKey} onChange={(e) => setRKey(e.target.value)} placeholder="free_coffee" helperText="Used by the API. It cannot change later." required />}
          </div>
          <Textarea label="Description (optional)" value={rDescription} onChange={(e) => setRDescription(e.target.value)} rows={2} />
          <Input label="Picture link (optional)" type="url" value={rImage} onChange={(e) => setRImage(e.target.value)} placeholder="https://" />
          <div className="grid gap-3 sm:grid-cols-2">
            {!editingReward ? (
              <div>
                <span className="mb-1 block text-xs font-semibold text-zinc-300">Paid in *</span>
                <Dropdown options={currencyOptions} value={rCurrency} onChange={setRCurrency} />
              </div>
            ) : (
              <div>
                <span className="mb-1 block text-xs font-semibold text-zinc-300">Paid in</span>
                <p className="text-sm text-zinc-300">{editingReward.currencyName}</p>
              </div>
            )}
            <Input label="Price *" type="number" min={1} value={rCost} onChange={(e) => setRCost(e.target.value)} required />
          </div>
          {!editingReward && (
            <div>
              <span className="mb-1 block text-xs font-semibold text-zinc-300">How it is delivered</span>
              <Dropdown options={KIND_OPTIONS} value={rKind} onChange={(value) => setRKind(value as Reward['kind'])} />
            </div>
          )}
          {!editingReward && rKind === 'generated' && (
            <Input label="Code prefix (optional)" value={rPrefix} onChange={(e) => setRPrefix(e.target.value)} placeholder="COFFEE-" helperText="Each code is this followed by 10 random letters and digits." />
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Stock (optional)" type="number" min={0} value={rStock} onChange={(e) => setRStock(e.target.value)} helperText="Blank means unlimited." />
            <Input label="Most per person (optional)" type="number" min={1} value={rLimit} onChange={(e) => setRLimit(e.target.value)} helperText="Cancelled purchases do not count." />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setRewardOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>{editingReward ? 'Save changes' : 'Create reward'}</Button>
          </div>
        </form>
      </Dialog>

      <Dialog isOpen={codesFor !== null} onClose={() => setCodesFor(null)} title={`Add codes to ${codesFor?.name ?? ''}`} description="One code is given out per purchase. Codes already added are skipped.">
        <form onSubmit={saveCodes} className="space-y-4">
          {formError && <div className="border border-danger-800/60 bg-danger-950/40 p-3 text-xs text-danger-300">{formError}</div>}
          <Textarea label="Codes *" value={codesText} onChange={(e) => setCodesText(e.target.value)} rows={8} placeholder={'COFFEE-7H2K\nCOFFEE-9QWX'} helperText="Paste them one per line, or separated by commas. Up to 5,000 at a time." />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setCodesFor(null)}>Cancel</Button>
            <Button type="submit" variant="primary" size="sm" isLoading={saving}>Add codes</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
