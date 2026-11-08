'use client';

import { apiFetch } from '@/lib/api-client';
import { formatDateTime } from '@/lib/format';
import Link from 'next/link';
import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { Dropdown } from '@/components/ui/dropdown';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { ArrowLeft, Ban, Boxes, KeyRound, LogOut, PlayCircle, Trash2, Users } from 'lucide-react';
import { FeatureBoard } from './feature-board';
import { PolicyForm } from './policy-form';

type Tab = 'overview' | 'features' | 'rules' | 'people';

const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'features', label: 'Features' },
  { id: 'rules', label: 'Limits & security' },
  { id: 'people', label: 'People & access' },
];

interface OrgDetail {
  organization: { id: string; name: string; slug: string; status: 'active' | 'suspended'; createdAt: string };
  projectCount: number;
  memberCount: number;
  projects: { id: string; name: string; slug: string; environment?: string; createdAt: string }[];
}

interface Member {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  emailVerified: boolean;
  activeSessions: number;
}

interface People {
  members: Member[];
  invitations: { id: string; email: string; role: string; expiresAt: string }[];
  activeApiKeys: number;
}

interface Effective {
  maxProjects: number | null;
  maxMembers: number | null;
  apiKeyMaxLifetimeDays: number | null;
  allowedEmailDomains: string[];
  apiIpAllowlist: string[];
  requireAllowedOrigins: boolean;
  eventsPerMinute: number | null;
}

function Stat({ icon: Icon, label, value, limit }: { icon: typeof Users; label: string; value: number; limit?: number | null }) {
  const fraction = limit ? Math.min(1, value / limit) : null;
  return (
    <div className="border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="flex items-center gap-2 text-xs text-zinc-400">
        <Icon className="h-3.5 w-3.5 text-brand-400" />
        {label}
      </div>
      <div className="mt-1 text-2xl font-black text-zinc-100">
        {value.toLocaleString()}
        {limit ? <span className="text-sm font-semibold text-zinc-500"> / {limit.toLocaleString()}</span> : null}
      </div>
      {fraction !== null && (
        <div className="mt-2 h-1.5 w-full bg-zinc-800">
          <motion.div
            className={`h-full ${fraction >= 1 ? 'bg-danger-500' : fraction > 0.8 ? 'bg-warning-500' : 'bg-brand-500'}`}
            initial={{ width: 0 }}
            animate={{ width: `${fraction * 100}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 20 }}
          />
        </div>
      )}
    </div>
  );
}

export function OrganizationDetail({ organizationId }: { organizationId: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [tab, setTab] = useState<Tab>('overview');
  const [detail, setDetail] = useState<OrgDetail | null>(null);
  const [people, setPeople] = useState<People | null>(null);
  const [policy, setPolicy] = useState<Effective | null>(null);
  const [disabledCount, setDisabledCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [d, p, pol, f] = await Promise.all([
        apiFetch(`/api/admin/organizations/${organizationId}`),
        apiFetch(`/api/admin/organizations/${organizationId}/members`),
        apiFetch(`/api/admin/organizations/${organizationId}/policy`),
        apiFetch(`/api/admin/organizations/${organizationId}/features`),
      ]);
      if (!d.ok) throw new Error(d.status === 404 ? 'This organization does not exist.' : 'The organization could not load.');
      setDetail(await d.json());
      if (p.ok) setPeople(await p.json());
      if (pol.ok) setPolicy((await pol.json()).effective);
      if (f.ok) setDisabledCount(((await f.json()).data as { enabled: boolean; base: boolean }[]).filter((item) => !item.enabled && !item.base).length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The organization could not load.');
    }
  }, [organizationId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (status: 'active' | 'suspended') => {
    if (!detail) return;
    const ok = await confirm({
      title: status === 'suspended' ? `Suspend ${detail.organization.name}?` : `Reactivate ${detail.organization.name}?`,
      message:
        status === 'suspended'
          ? 'Members are locked out, API keys stop working and events are refused, until you reactivate it. Nothing is deleted.'
          : 'Members, keys and events work again straight away.',
      confirmText: status === 'suspended' ? 'Suspend' : 'Reactivate',
      isDanger: status === 'suspended',
    });
    if (!ok) return;
    const res = await apiFetch(`/api/admin/organizations/${organizationId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (!res.ok) return toast.error('The status could not be changed.');
    toast.success(status === 'suspended' ? 'Suspended.' : 'Reactivated.');
    await load();
  };

  const action = async (path: 'revoke-api-keys' | 'sign-out') => {
    const ok = await confirm({
      title: path === 'revoke-api-keys' ? 'Revoke every API key?' : 'Sign everyone out?',
      message:
        path === 'revoke-api-keys'
          ? `All ${people?.activeApiKeys ?? ''} active keys in this organization stop working at once. Their apps need new keys. Use this after a suspected leak.`
          : 'Every member is signed out on every device. They can sign in again unless the organization is suspended. You stay signed in.',
      confirmText: path === 'revoke-api-keys' ? 'Revoke all keys' : 'Sign everyone out',
      isDanger: true,
    });
    if (!ok) return;
    const res = await apiFetch(`/api/admin/organizations/${organizationId}/${path}`, { method: 'POST', body: JSON.stringify({}) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return toast.error(body?.message ?? 'That did not work.');
    toast.success(path === 'revoke-api-keys' ? `${body.revoked} keys revoked.` : `${body.sessionsEnded} sessions ended.`);
    await load();
  };

  const changeRole = async (person: Member, role: string) => {
    if (role === person.role) return;
    const res = await apiFetch(`/api/admin/organizations/${organizationId}/members/${person.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    const body = await res.json().catch(() => null);
    if (!res.ok) return toast.error(body?.message ?? 'The role could not be changed.');
    toast.success(`${person.name || person.email} is now ${role === 'admin' ? 'an admin' : `a ${role}`}.`);
    await load();
  };

  const remove = async (person: Member) => {
    const ok = await confirm({ title: `Remove ${person.name || person.email}?`, message: 'They lose access to this organization. Their account stays.', confirmText: 'Remove', isDanger: true });
    if (!ok) return;
    const res = await apiFetch(`/api/admin/organizations/${organizationId}/members/${person.id}`, { method: 'DELETE' });
    const body = await res.json().catch(() => null);
    if (!res.ok) return toast.error(body?.message ?? 'They could not be removed.');
    toast.success('Removed.');
    await load();
  };

  if (error) {
    return (
      <div className="space-y-4">
        <Link href="/admin/organizations" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
          <ArrowLeft className="h-3.5 w-3.5" /> All organizations
        </Link>
        <p className="text-sm text-danger-300">{error}</p>
      </div>
    );
  }
  if (!detail) return <Skeleton className="h-96 w-full" />;

  const org = detail.organization;
  const suspended = org.status === 'suspended';

  return (
    <div className="space-y-6">
      <Link href="/admin/organizations" className="inline-flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200">
        <ArrowLeft className="h-3.5 w-3.5" /> All organizations
      </Link>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 border-b border-zinc-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black text-zinc-100">{org.name}</h1>
            <Badge variant={suspended ? 'rose' : 'emerald'}>{suspended ? 'Suspended' : 'Active'}</Badge>
            {disabledCount ? <Badge variant="amber">{disabledCount} features off</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-zinc-400">
            <span className="font-mono">{org.slug}</span> · created {formatDateTime(org.createdAt)}
          </p>
        </div>
        <Button variant={suspended ? 'primary' : 'danger'} size="sm" onClick={() => void setStatus(suspended ? 'active' : 'suspended')}>
          {suspended ? <PlayCircle className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
          {suspended ? 'Reactivate' : 'Suspend'}
        </Button>
      </motion.div>

      <LayoutGroup>
        <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-zinc-800">
          {TABS.map((item) => (
            <button
              key={item.id}
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`relative whitespace-nowrap px-3 py-2 text-sm transition-colors ${tab === item.id ? 'text-zinc-100' : 'text-zinc-400 hover:text-zinc-200'}`}
            >
              {item.label}
              {tab === item.id && <motion.span layoutId="org-tab" className="absolute inset-x-0 -bottom-px h-0.5 bg-brand-500" transition={{ type: 'spring', stiffness: 500, damping: 40 }} />}
            </button>
          ))}
        </div>
      </LayoutGroup>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
          {tab === 'overview' && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat icon={Boxes} label="Projects" value={detail.projectCount} limit={policy?.maxProjects} />
                <Stat icon={Users} label="Members" value={detail.memberCount + (people?.invitations.length ?? 0)} limit={policy?.maxMembers} />
                <Stat icon={KeyRound} label="Active API keys" value={people?.activeApiKeys ?? 0} />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Projects</CardTitle>
                  <CardDescription>Staging and development projects use test keys.</CardDescription>
                </CardHeader>
                <CardContent>
                  {detail.projects.length === 0 ? (
                    <p className="text-sm text-zinc-400">No projects yet.</p>
                  ) : (
                    <ul className="divide-y divide-zinc-800">
                      {detail.projects.map((project) => (
                        <li key={project.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                          <span className="text-zinc-200">
                            {project.name} <span className="font-mono text-xs text-zinc-500">{project.slug}</span>
                          </span>
                          <Badge variant={(project.environment ?? 'production') === 'production' ? 'orange' : 'zinc'}>{project.environment ?? 'production'}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
              {policy && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-bold">Rules in force</CardTitle>
                    <CardDescription>Its own settings where set, the instance defaults otherwise.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <dl className="grid gap-3 text-sm sm:grid-cols-2">
                      {[
                        ['Email domains', policy.allowedEmailDomains.length ? policy.allowedEmailDomains.join(', ') : 'Any'],
                        ['API key lifetime', policy.apiKeyMaxLifetimeDays ? `Up to ${policy.apiKeyMaxLifetimeDays} days` : 'No limit'],
                        ['API addresses', policy.apiIpAllowlist.length ? `${policy.apiIpAllowlist.length} allowed` : 'Any'],
                        ['Event requests', policy.eventsPerMinute ? `${policy.eventsPerMinute.toLocaleString()} a minute per project` : 'Instance limit only'],
                        ['Player token sites', policy.requireAllowedOrigins ? 'Must be listed' : 'Optional'],
                      ].map(([label, value]) => (
                        <div key={label} className="border border-zinc-800 bg-zinc-950/60 px-3 py-2">
                          <dt className="text-xs text-zinc-500">{label}</dt>
                          <dd className="text-zinc-200">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <button className="mt-3 text-xs text-brand-400 hover:underline" onClick={() => setTab('rules')}>
                      Change them
                    </button>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {tab === 'features' && <FeatureBoard organizationId={organizationId} onChange={() => void load()} />}

          {tab === 'rules' && <PolicyForm organizationId={organizationId} />}

          {tab === 'people' && (
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Members</CardTitle>
                  <CardDescription>Change roles or remove people. Every organization keeps at least one owner.</CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  {!people ? (
                    <Skeleton className="m-4 h-24" />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Person</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Signed in on</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {people.members.map((person) => (
                          <TableRow key={person.id}>
                            <TableCell>
                              <div className="text-sm text-zinc-100">{person.name || person.email}</div>
                              <div className="text-xs text-zinc-500">
                                {person.email}
                                {!person.emailVerified && <Badge variant="amber" className="ml-2">Unverified</Badge>}
                              </div>
                            </TableCell>
                            <TableCell className="w-40">
                              <Dropdown
                                options={[
                                  { value: 'owner', label: 'Owner' },
                                  { value: 'admin', label: 'Admin' },
                                  { value: 'member', label: 'Member' },
                                ]}
                                value={person.role}
                                onChange={(role) => void changeRole(person, role)}
                              />
                            </TableCell>
                            <TableCell className="text-xs text-zinc-400">{person.activeSessions} {person.activeSessions === 1 ? 'device' : 'devices'}</TableCell>
                            <TableCell className="text-xs text-zinc-400">{formatDateTime(person.joinedAt)}</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="sm" onClick={() => void remove(person)} aria-label={`Remove ${person.email}`}>
                                <Trash2 className="h-3.5 w-3.5 text-danger-400" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {people && people.invitations.length > 0 && (
                    <div className="border-t border-zinc-800 p-4">
                      <p className="mb-2 text-xs font-semibold text-zinc-300">Waiting invitations</p>
                      <ul className="space-y-1 text-xs text-zinc-400">
                        {people.invitations.map((item) => (
                          <li key={item.id}>
                            {item.email} as {item.role}, until {formatDateTime(item.expiresAt)}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-danger-900/60">
                <CardHeader>
                  <CardTitle className="text-sm font-bold">Emergency access controls</CardTitle>
                  <CardDescription>For a suspected leak or a compromised account. Both are recorded in the audit log.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-3">
                  <Button variant="danger" size="sm" onClick={() => void action('revoke-api-keys')} disabled={!people?.activeApiKeys}>
                    <KeyRound className="h-4 w-4" />
                    Revoke all {people?.activeApiKeys ?? ''} API keys
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void action('sign-out')}>
                    <LogOut className="h-4 w-4" />
                    Sign everyone out
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
