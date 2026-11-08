'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import React, { useCallback, useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dropdown } from '@/components/ui/dropdown';
import { Input, Textarea } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning';
import { Building2, Globe2, KeyRound, ShieldCheck, Users } from 'lucide-react';

interface Policy {
  maxProjects: number | null;
  maxMembers: number | null;
  allowedEmailDomains: string[] | null;
  apiKeyMaxLifetimeDays: number | null;
  apiIpAllowlist: string[] | null;
  requireAllowedOrigins: boolean | null;
  eventsPerMinute: number | null;
  adminNotes?: string | null;
}

interface PolicyResponse {
  own: Policy;
  effective: Required<Omit<Policy, 'adminNotes'>>;
  defaults: Required<Omit<Policy, 'adminNotes'>> | null;
  updatedAt: string | null;
}

interface FormState {
  maxProjects: string;
  maxMembers: string;
  allowedEmailDomains: string;
  apiKeyMaxLifetimeDays: string;
  apiIpAllowlist: string;
  requireAllowedOrigins: string;
  eventsPerMinute: string;
  adminNotes: string;
}

const toForm = (own: Policy): FormState => ({
  maxProjects: own.maxProjects?.toString() ?? '',
  maxMembers: own.maxMembers?.toString() ?? '',
  allowedEmailDomains: (own.allowedEmailDomains ?? []).join(', '),
  apiKeyMaxLifetimeDays: own.apiKeyMaxLifetimeDays?.toString() ?? '',
  apiIpAllowlist: (own.apiIpAllowlist ?? []).join('\n'),
  requireAllowedOrigins: own.requireAllowedOrigins === null || own.requireAllowedOrigins === undefined ? '' : own.requireAllowedOrigins ? 'yes' : 'no',
  eventsPerMinute: own.eventsPerMinute?.toString() ?? '',
  adminNotes: own.adminNotes ?? '',
});

const number = (value: string) => (value.trim() === '' ? null : Number(value));
const list = (value: string) => value.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);

function Section({ icon: Icon, title, description, children, delay }: { icon: typeof Users; title: string; description: string; children: React.ReactNode; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.3 }}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-bold">
            <Icon className="h-4 w-4 text-brand-400" />
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">{children}</CardContent>
      </Card>
    </motion.div>
  );
}

/**
 * Limits and security rules. For the instance these are the defaults every organization gets;
 * for one organization, a blank field uses the default, shown as the placeholder.
 */
export function PolicyForm({ organizationId }: { organizationId?: string }) {
  const toast = useToast();
  const url = organizationId ? `/api/admin/organizations/${organizationId}/policy` : '/api/admin/policies';
  const [data, setData] = useState<PolicyResponse | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [saved, setSaved] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch(url);
    if (!res.ok) {
      setError('The settings could not load.');
      return;
    }
    const body = (await res.json()) as PolicyResponse;
    setData(body);
    setForm(toForm(body.own));
    setSaved(toForm(body.own));
  }, [url]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved));
  useUnsavedWarning(dirty);

  if (error) return <p className="text-sm text-danger-300">{error}</p>;
  if (!form || !data) return <Skeleton className="h-96 w-full" />;

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const fallback = data.defaults;
  const hint = (value: number | null | undefined, unit: string) => (organizationId ? `Blank uses the default: ${value ? `${value.toLocaleString()} ${unit}` : 'no limit'}.` : 'Blank means no limit.');
  const listHint = (value: string[] | null | undefined, what: string) =>
    organizationId ? `Blank uses the default: ${value && value.length ? value.join(', ') : `any ${what}`}.` : `Blank allows any ${what}.`;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const body: Policy = {
        maxProjects: number(form.maxProjects),
        maxMembers: number(form.maxMembers),
        allowedEmailDomains: list(form.allowedEmailDomains),
        apiKeyMaxLifetimeDays: number(form.apiKeyMaxLifetimeDays),
        apiIpAllowlist: list(form.apiIpAllowlist),
        requireAllowedOrigins: form.requireAllowedOrigins === '' ? null : form.requireAllowedOrigins === 'yes',
        eventsPerMinute: number(form.eventsPerMinute),
        ...(organizationId ? { adminNotes: form.adminNotes.trim() || null } : {}),
      };
      const res = await apiFetch(url, { method: 'PUT', body: JSON.stringify(body) });
      const next = await res.json();
      if (!res.ok) throw new Error(next.message ?? 'The settings could not be saved.');
      setData(next);
      setForm(toForm(next.own));
      setSaved(toForm(next.own));
      toast.success(organizationId ? 'Organization rules saved.' : 'Defaults saved for every organization.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'The settings could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Section icon={Building2} title="Size" description="How big an organization can grow." delay={0}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Most projects" type="number" min={1} value={form.maxProjects} onChange={(e) => set({ maxProjects: e.target.value })} placeholder={fallback?.maxProjects?.toString() ?? 'No limit'} helperText={hint(fallback?.maxProjects, 'projects')} />
            <Input label="Most members" type="number" min={1} value={form.maxMembers} onChange={(e) => set({ maxMembers: e.target.value })} placeholder={fallback?.maxMembers?.toString() ?? 'No limit'} helperText={`${hint(fallback?.maxMembers, 'members')} Pending invitations count.`} />
          </div>
          <Input label="Event requests per minute, per project" type="number" min={1} value={form.eventsPerMinute} onChange={(e) => set({ eventsPerMinute: e.target.value })} placeholder={fallback?.eventsPerMinute?.toString() ?? 'No limit'} helperText={`${hint(fallback?.eventsPerMinute, 'a minute')} The instance-wide limit still applies on top.`} />
        </Section>

        <Section icon={Users} title="Who can join" description="Checked when someone is invited." delay={0.05}>
          <Textarea label="Allowed email domains" rows={2} value={form.allowedEmailDomains} onChange={(e) => set({ allowedEmailDomains: e.target.value })} placeholder="example.com, example.org" helperText={`${listHint(fallback?.allowedEmailDomains, 'domain')} Subdomains are included.`} />
        </Section>

        <Section icon={KeyRound} title="API keys" description="How keys may be made and used." delay={0.1}>
          <Input label="Keys must expire within (days)" type="number" min={1} value={form.apiKeyMaxLifetimeDays} onChange={(e) => set({ apiKeyMaxLifetimeDays: e.target.value })} placeholder={fallback?.apiKeyMaxLifetimeDays?.toString() ?? 'Never'} helperText={organizationId ? `Blank uses the default: ${fallback?.apiKeyMaxLifetimeDays ? `${fallback.apiKeyMaxLifetimeDays} days` : 'keys may never expire'}.` : 'Blank lets keys live forever. A key made without an expiry gets the longest allowed.'} />
          <Textarea label="Allowed addresses" rows={3} className="font-mono text-xs" value={form.apiIpAllowlist} onChange={(e) => set({ apiIpAllowlist: e.target.value })} placeholder={'203.0.113.7\n198.51.100.0/24'} helperText={`${listHint(fallback?.apiIpAllowlist, 'address')} One address or range per line. Checked for every API key request, including events.`} />
        </Section>

        <Section icon={Globe2} title="Player tokens" description="End-user tokens used from browsers and apps." delay={0.15}>
          <div>
            <span className="mb-1 block text-xs font-semibold text-zinc-300">Projects must list their allowed sites</span>
            <Dropdown
              options={[
                ...(organizationId ? [{ value: '', label: `Use the default (${fallback?.requireAllowedOrigins ? 'required' : 'not required'})` }] : [{ value: '', label: 'Not required' }]),
                { value: 'yes', label: 'Required', sublabel: 'Tokens stop working until a project lists its sites' },
                ...(organizationId ? [{ value: 'no', label: 'Not required' }] : []),
              ]}
              value={form.requireAllowedOrigins}
              onChange={(value) => set({ requireAllowedOrigins: value })}
            />
          </div>
        </Section>
      </div>

      {organizationId && (
        <Section icon={ShieldCheck} title="Notes" description="Only platform administrators see these." delay={0.2}>
          <Textarea aria-label="Notes" rows={3} value={form.adminNotes} onChange={(e) => set({ adminNotes: e.target.value })} placeholder="Contract, contacts, why limits were changed…" />
        </Section>
      )}

      <motion.div
        className="sticky bottom-4 z-10 flex items-center justify-between gap-3 border border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur"
        animate={{ y: dirty ? 0 : 6, opacity: dirty ? 1 : 0.75 }}
      >
        <span className="text-xs text-zinc-400">{dirty ? 'You have unsaved changes.' : data.updatedAt ? `Saved ${formatDateTime(data.updatedAt)}.` : 'Nothing set yet.'}</span>
        <div className="flex gap-2">
          {dirty && <Button type="button" variant="ghost" size="sm" onClick={() => setForm(saved)}>Discard</Button>}
          <Button type="submit" variant="primary" size="sm" isLoading={saving} disabled={!dirty}>Save</Button>
        </div>
      </motion.div>
    </form>
  );
}
