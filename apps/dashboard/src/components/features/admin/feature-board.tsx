'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import gsap from 'gsap';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/checkbox';
import { Dialog } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  ArrowDownRight,
  ArrowUpRight,
  Blocks,
  Coins,
  Cpu,
  Lock,
  MessageSquare,
  RotateCcw,
  Search,
  Sparkles,
  Swords,
  TrendingUp,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface FeatureState {
  key: string;
  name: string;
  description: string;
  category: string;
  base: boolean;
  requires: string[];
  requiredBy: string[];
  instanceEnabled: boolean;
  enabled: boolean;
  override: boolean | null;
  orgOverrides: number;
}

interface Pending {
  feature: FeatureState;
  enabled: boolean;
  alsoOff: string[];
  alsoOn: string[];
}

const CATEGORY_ICON: Record<string, LucideIcon> = {
  Core: Cpu,
  Progression: TrendingUp,
  Competition: Swords,
  Economy: Coins,
  Community: Users,
  Messaging: MessageSquare,
  Integrations: Blocks,
  Platform: Sparkles,
};

const CATEGORY_ORDER = ['Core', 'Progression', 'Competition', 'Economy', 'Community', 'Messaging', 'Integrations', 'Platform'];

/** Counts up to a number with GSAP, so a change in totals is noticed. */
function AnimatedNumber({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  useEffect(() => {
    const state = { n: shown.current };
    const tween = gsap.to(state, {
      n: value,
      duration: 0.6,
      ease: 'power2.out',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = String(Math.round(state.n));
      },
    });
    shown.current = value;
    return () => {
      tween.kill();
    };
  }, [value]);
  return <span ref={ref}>{value}</span>;
}

/** A ring that fills to the share of features that are on. */
function CoverageRing({ on, total }: { on: number; total: number }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const fraction = total ? on / total : 0;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="shrink-0 -rotate-90">
      <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="6" className="text-zinc-800" />
      <motion.circle
        cx="32"
        cy="32"
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinecap="butt"
        className="text-brand-500"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - fraction) }}
        transition={{ type: 'spring', stiffness: 80, damping: 18 }}
      />
    </svg>
  );
}

/**
 * Every feature, grouped, with a switch each. Hovering a feature lights up what it needs and what
 * needs it. A change that drags other features along asks first, and shows exactly which.
 *
 * `organizationId` switches to one organization's view, where a feature can only be narrowed.
 */
export function FeatureBoard({ organizationId, onChange }: { organizationId?: string; onChange?: () => void }) {
  const toast = useToast();
  const base = organizationId ? `/api/admin/organizations/${organizationId}/features` : '/api/admin/features';
  const [features, setFeatures] = useState<FeatureState[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [hovered, setHovered] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [flash, setFlash] = useState<Set<string>>(new Set());
  const gridRef = useRef<HTMLDivElement>(null);
  const entered = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch(base);
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'Features could not load');
      setFeatures((await res.json()).data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Features could not load');
    }
  }, [base]);

  useEffect(() => {
    void load();
  }, [load]);

  // The first time the cards appear, they rise in, in order. Skipped for people who prefer less motion.
  useLayoutEffect(() => {
    if (!features || entered.current || !gridRef.current) return;
    entered.current = true;
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(gridRef.current!.querySelectorAll('[data-feature-card]'), { y: 14, opacity: 0, duration: 0.45, ease: 'power3.out', stagger: 0.025 });
    });
    return () => media.revert();
  }, [features]);

  const byKey = useMemo(() => new Map((features ?? []).map((feature) => [feature.key, feature])), [features]);

  // Everything a feature needs, and everything that needs it, following the chain.
  const related = useMemo(() => {
    if (!hovered || !features) return { needs: new Set<string>(), neededBy: new Set<string>() };
    const walk = (start: string, next: (feature: FeatureState) => string[]) => {
      const found = new Set<string>();
      const stack = [...(byKey.get(start) ? next(byKey.get(start)!) : [])];
      while (stack.length) {
        const key = stack.pop()!;
        if (found.has(key)) continue;
        found.add(key);
        const feature = byKey.get(key);
        if (feature) stack.push(...next(feature));
      }
      return found;
    };
    return { needs: walk(hovered, (feature) => feature.requires), neededBy: walk(hovered, (feature) => feature.requiredBy) };
  }, [hovered, features, byKey]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (features ?? []).filter((feature) => {
      if (term && !`${feature.name} ${feature.description} ${feature.key}`.toLowerCase().includes(term)) return false;
      if (filter === 'on') return feature.enabled;
      if (filter === 'off') return !feature.enabled;
      if (filter === 'changed') return organizationId ? feature.override !== null : feature.orgOverrides > 0 || !feature.instanceEnabled;
      return true;
    });
  }, [features, search, filter, organizationId]);

  const send = async (feature: FeatureState, enabled: boolean, confirmCascade: boolean) => {
    setBusy(feature.key);
    try {
      const res = await apiFetch(`${base}/${feature.key}`, { method: 'PUT', body: JSON.stringify({ enabled, confirmCascade }) });
      const body = await res.json().catch(() => null);
      if (res.status === 409 && body?.code === 'CONFIRM_CASCADE') {
        setPending({ feature, enabled, alsoOff: body.alsoOff ?? [], alsoOn: body.alsoOn ?? [] });
        return;
      }
      if (!res.ok) throw new Error(body?.message ?? 'The change could not be saved.');
      const changed = new Set<string>((body.changes as { feature: string }[]).map((change) => change.feature));
      setFeatures(body.data);
      setFlash(changed);
      setTimeout(() => setFlash(new Set()), 1400);
      toast.success(changed.size > 1 ? `${changed.size} features ${enabled ? 'turned on' : 'turned off'}.` : `${feature.name} ${enabled ? 'turned on' : 'turned off'}.`);
      onChange?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The change could not be saved.');
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    if (!organizationId) return;
    const res = await apiFetch(base, { method: 'DELETE' });
    if (!res.ok) return toast.error('The organization could not be reset.');
    setFeatures((await res.json()).data);
    toast.success('Back on the instance settings.');
    onChange?.();
  };

  if (error) {
    return (
      <div className="border border-danger-800/60 bg-danger-950/40 p-4 text-sm text-danger-300">
        {error} <button className="underline" onClick={() => void load()}>Try again</button>
      </div>
    );
  }
  if (!features) return <Skeleton className="h-96 w-full" />;

  const optional = features.filter((feature) => !feature.base);
  const onCount = optional.filter((feature) => feature.enabled).length;
  const overrides = organizationId ? features.filter((feature) => feature.override !== null).length : features.reduce((sum, feature) => sum + feature.orgOverrides, 0);
  const nameOf = (key: string) => byKey.get(key)?.name ?? key;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 border border-zinc-800 bg-zinc-950/70 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <CoverageRing on={onCount} total={optional.length} />
            <div>
              <div className="text-2xl font-black text-zinc-100">
                <AnimatedNumber value={onCount} /> <span className="text-base font-semibold text-zinc-500">of {optional.length} optional features on</span>
              </div>
              <p className="text-xs text-zinc-400">
                {features.length - optional.length} base features are always on.{' '}
                {organizationId
                  ? overrides > 0
                    ? `${overrides} turned off for this organization only.`
                    : 'This organization follows the instance settings.'
                  : overrides > 0
                    ? `${overrides} organization overrides in place.`
                    : 'No organization has its own overrides.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-56">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
              <Input aria-label="Search features" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search features" className="pl-8" />
            </div>
            <div className="w-40">
              <Dropdown
                options={[
                  { value: 'all', label: 'All features' },
                  { value: 'on', label: 'On' },
                  { value: 'off', label: 'Off' },
                  { value: 'changed', label: organizationId ? 'Overridden here' : 'Changed' },
                ]}
                value={filter}
                onChange={setFilter}
              />
            </div>
            {organizationId && overrides > 0 && (
              <Button variant="secondary" size="sm" onClick={() => void reset()}>
                <RotateCcw className="h-3.5 w-3.5" />
                Follow instance
              </Button>
            )}
          </div>
        </div>

        <p className="text-xs text-zinc-500">
          Hover a feature to see what it needs <span className="text-brand-300">(orange)</span> and what needs it <span className="text-info-300">(blue)</span>. Turning a feature off turns off what depends on it, and you will be asked first.
        </p>

        <div ref={gridRef} className="space-y-8">
          {CATEGORY_ORDER.filter((category) => visible.some((feature) => feature.category === category)).map((category) => {
            const Icon = CATEGORY_ICON[category] ?? Sparkles;
            return (
              <section key={category} aria-labelledby={`cat-${category}`}>
                <h2 id={`cat-${category}`} className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-zinc-400">
                  <Icon className="h-3.5 w-3.5 text-brand-400" />
                  {category}
                </h2>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {visible
                    .filter((feature) => feature.category === category)
                    .map((feature) => {
                      const isNeed = related.needs.has(feature.key);
                      const isDependent = related.neededBy.has(feature.key);
                      const dim = hovered !== null && hovered !== feature.key && !isNeed && !isDependent;
                      const lockedByInstance = Boolean(organizationId) && !feature.instanceEnabled && !feature.base;
                      return (
                        <motion.div
                          key={feature.key}
                          data-feature-card
                          layout
                          onMouseEnter={() => setHovered(feature.key)}
                          onMouseLeave={() => setHovered(null)}
                          onFocus={() => setHovered(feature.key)}
                          onBlur={() => setHovered(null)}
                          animate={{
                            opacity: dim ? 0.38 : 1,
                            scale: hovered === feature.key ? 1.01 : 1,
                            boxShadow: flash.has(feature.key) ? '0 0 0 2px rgba(249,115,22,0.85)' : '0 0 0 0px rgba(0,0,0,0)',
                          }}
                          transition={{ duration: 0.2 }}
                          className={`relative flex flex-col gap-3 border bg-zinc-950/80 p-4 transition-colors ${
                            isNeed ? 'border-brand-500/70' : isDependent ? 'border-info-500/70' : feature.enabled ? 'border-zinc-800' : 'border-zinc-800/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <h3 className={`text-sm font-semibold ${feature.enabled ? 'text-zinc-100' : 'text-zinc-400'}`}>{feature.name}</h3>
                                {feature.base && (
                                  <Badge variant="zinc" className="gap-1">
                                    <Lock className="h-3 w-3" /> Base
                                  </Badge>
                                )}
                                {organizationId && feature.override === false && <Badge variant="rose">Off here</Badge>}
                                {lockedByInstance && <Badge variant="zinc">Off for instance</Badge>}
                                {!organizationId && feature.orgOverrides > 0 && <Badge variant="amber">{feature.orgOverrides} org{feature.orgOverrides === 1 ? '' : 's'} off</Badge>}
                              </div>
                              <p className="mt-1 text-xs leading-relaxed text-zinc-400">{feature.description}</p>
                            </div>
                            <div className="pt-0.5">
                              {busy === feature.key ? (
                                <motion.span className="block h-5 w-5 border-2 border-brand-500 border-t-transparent" animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }} />
                              ) : (
                                <Switch
                                  checked={feature.enabled}
                                  disabled={feature.base || lockedByInstance || busy !== null}
                                  onChange={(e) => void send(feature, e.target.checked, false)}
                                  aria-label={`${feature.name} is on`}
                                  title={feature.base ? 'Base features are always on' : lockedByInstance ? 'Turn it on for the instance first' : undefined}
                                />
                              )}
                            </div>
                          </div>
                          {(feature.requires.length > 0 || feature.requiredBy.length > 0) && (
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
                              {feature.requires.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <ArrowDownRight className="h-3 w-3 text-brand-400" /> Needs {feature.requires.map(nameOf).join(', ')}
                                </span>
                              )}
                              {feature.requiredBy.length > 0 && (
                                <span className="inline-flex items-center gap-1">
                                  <ArrowUpRight className="h-3 w-3 text-info-400" /> Needed by {feature.requiredBy.map(nameOf).join(', ')}
                                </span>
                              )}
                            </div>
                          )}
                        </motion.div>
                      );
                    })}
                </div>
              </section>
            );
          })}
          {visible.length === 0 && <p className="py-10 text-center text-sm text-zinc-400">No features match.</p>}
        </div>

        <Dialog
          isOpen={pending !== null}
          onClose={() => setPending(null)}
          title={pending ? `${pending.enabled ? 'Turn on' : 'Turn off'} ${pending.feature.name}?` : ''}
          description={
            pending
              ? pending.enabled
                ? `${pending.feature.name} needs these, so they will be turned on too.`
                : `These need ${pending.feature.name}, so they will be turned off too${organizationId ? ' for this organization' : ' everywhere'}.`
              : undefined
          }
        >
          {pending && (
            <div className="space-y-4">
              <ul className="space-y-2">
                <AnimatePresence>
                  {[pending.feature.key, ...(pending.enabled ? pending.alsoOn : pending.alsoOff)].map((key, index) => (
                    <motion.li
                      key={key}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.06 }}
                      className={`flex items-center justify-between gap-3 border px-3 py-2 text-sm ${
                        pending.enabled ? 'border-success-800/60 bg-success-950/30' : 'border-danger-800/60 bg-danger-950/30'
                      }`}
                    >
                      <span className="text-zinc-100">
                        {nameOf(key)}
                        {index === 0 && <span className="ml-2 text-xs text-zinc-500">(chosen)</span>}
                      </span>
                      <Badge variant={pending.enabled ? 'emerald' : 'rose'}>{pending.enabled ? 'On' : 'Off'}</Badge>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {!pending.enabled && (
                <p className="text-xs text-zinc-400">
                  Players stop seeing these straight away, and their API routes answer with <code>FEATURE_DISABLED</code>. Nothing is deleted: turning them back on restores everything.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Cancel</Button>
                <Button
                  variant={pending.enabled ? 'primary' : 'danger'}
                  size="sm"
                  onClick={() => {
                    const next = pending;
                    setPending(null);
                    void send(next.feature, next.enabled, true);
                  }}
                >
                  {pending.enabled ? `Turn on ${1 + pending.alsoOn.length}` : `Turn off ${1 + pending.alsoOff.length}`}
                </Button>
              </div>
            </div>
          )}
        </Dialog>
      </div>
    </MotionConfig>
  );
}
