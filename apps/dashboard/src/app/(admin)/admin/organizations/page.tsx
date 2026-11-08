'use client';

import { apiFetch } from '@/lib/api-client';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dropdown, DropdownOption } from '@/components/ui/dropdown';
import { PageHeader } from '@/components/ui/page-header';

interface AdminOrg {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  createdAt: string;
  projectCount: number;
  memberCount: number;
}

export default function AdminOrganizationsPage() {
  const toast = useToast();
  const confirmAction = useConfirm();
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/admin/organizations');
      if (res.ok) {
        const data = await res.json();
        setOrgs(data.organizations || []);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to fetch platform organizations');
      }
    } catch {
      setError('Network error fetching organizations');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (org: AdminOrg) => {
    const nextStatus = org.status === 'active' ? 'suspended' : 'active';
    const actionName = nextStatus === 'suspended' ? 'suspend' : 'reactivate';

    if (
      !await confirmAction({ message: `Are you sure you want to ${actionName} organization "${org.name}"?\n\n${
          nextStatus === 'suspended'
            ? 'All API requests and events for this organization will be blocked straight away.'
            : 'Normal API access for this organization will be restored immediately.'
        }` })
    ) {
      return;
    }

    setUpdatingId(org.id);
    try {
      const res = await apiFetch(`/api/admin/organizations/${org.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        await fetchOrgs();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || `Failed to ${actionName} organization`);
      }
    } catch {
      toast.error(`Network error trying to ${actionName} organization`);
    } finally {
      setUpdatingId(null);
    }
  };

  const statusOptions: DropdownOption[] = [
    { value: 'all', label: 'All Statuses' },
    { value: 'active', label: 'Active Only' },
    { value: 'suspended', label: 'Suspended Only' },
  ];

  const filteredOrgs = orgs.filter((o) => {
    const matchesSearch =
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6 text-zinc-100">
      <PageHeader
        title="Organizations"
        description="Every organization on this server, with the option to suspend one."
        actions={
          <>
<div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="w-full sm:w-48">
            <Dropdown
              theme="rose"
              options={statusOptions}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>
          </>
        }
      />

      {error && (
        <div className="p-4 bg-danger-950/40 border border-danger-800 text-danger-300 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-zinc-400 text-xs">
          <div className="w-4 h-4 border-2 border-danger-500 border-t-transparent rounded-full animate-spin" />
          Loading organization directory...
        </div>
      ) : (
        <div className="border border-zinc-800 bg-zinc-950 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400">
              <tr>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">Projects</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {filteredOrgs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-400">
                    No organizations found.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-zinc-900/40 transition">
                    <td className="px-4 py-3 font-bold text-white">
                      <Link href={`/admin/organizations/${org.id}`} className="hover:text-brand-300 hover:underline">
                        {org.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-zinc-400">{org.slug}</td>
                    <td className="px-4 py-3 text-zinc-300">{org.projectCount}</td>
                    <td className="px-4 py-3 text-zinc-300">{org.memberCount}</td>
                    <td className="px-4 py-3">
                      {org.status === 'suspended' ? (
                        <Badge variant="rose">
                          <AlertOctagon className="w-3 h-3 mr-1" />
                          Suspended
                        </Badge>
                      ) : (
                        <Badge variant="emerald">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        onClick={() => handleToggleStatus(org)}
                        disabled={updatingId === org.id}
                        variant={org.status === 'active' ? 'rose' : 'emerald'}
                        size="sm"
                      >
                        {updatingId === org.id
                          ? 'Updating...'
                          : org.status === 'active'
                          ? 'Suspend Org'
                          : 'Reactivate Org'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
