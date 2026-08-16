'use client';

import { useEffect, useState } from 'react';
import { Building2, Search, AlertOctagon, CheckCircle2, ShieldAlert } from 'lucide-react';

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
  const [orgs, setOrgs] = useState<AdminOrg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    fetchOrgs();
  }, []);

  const fetchOrgs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/organizations');
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
      !confirm(
        `Are you sure you want to ${actionName} organization "${org.name}"?\n\n${
          nextStatus === 'suspended'
            ? 'All project API requests and event ingestions for this organization will be BLOCKED immediately.'
            : 'Normal API access for this organization will be restored immediately.'
        }`
      )
    ) {
      return;
    }

    setUpdatingId(org.id);
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });

      if (res.ok) {
        await fetchOrgs();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.message || `Failed to ${actionName} organization`);
      }
    } catch {
      alert(`Network error trying to ${actionName} organization`);
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredOrgs = orgs.filter(
    (o) =>
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.slug.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 font-mono">
      <div className="border-b border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold uppercase text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-rose-400" />
            Platform Organizations
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Global organization directory, tenant status management, and emergency suspension.
          </p>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-zinc-500" />
          <input
            type="text"
            placeholder="Search organizations..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-800 px-3 py-1.5 pl-9 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-rose-500"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {loading ? (
        <div className="py-12 flex items-center justify-center gap-3 text-zinc-400 text-xs">
          <div className="w-4 h-4 border-2 border-rose-500 border-t-transparent rounded-full animate-spin" />
          Loading organization directory...
        </div>
      ) : (
        <div className="border border-zinc-800 bg-zinc-950 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 border-b border-zinc-800 text-zinc-400 uppercase">
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
                  <td colSpan={6} className="px-4 py-8 text-center text-zinc-500">
                    No organizations found.
                  </td>
                </tr>
              ) : (
                filteredOrgs.map((org) => (
                  <tr key={org.id} className="hover:bg-zinc-900/40 transition">
                    <td className="px-4 py-3 font-bold text-white">{org.name}</td>
                    <td className="px-4 py-3 text-zinc-400">{org.slug}</td>
                    <td className="px-4 py-3 text-zinc-300">{org.projectCount}</td>
                    <td className="px-4 py-3 text-zinc-300">{org.memberCount}</td>
                    <td className="px-4 py-3">
                      {org.status === 'suspended' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase font-bold bg-rose-950/80 border border-rose-800 text-rose-400">
                          <AlertOctagon className="w-3 h-3" />
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] uppercase font-bold bg-emerald-950/80 border border-emerald-800 text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" />
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggleStatus(org)}
                        disabled={updatingId === org.id}
                        className={`px-3 py-1 text-xs uppercase font-semibold transition border ${
                          org.status === 'active'
                            ? 'bg-rose-950/60 hover:bg-rose-900 border-rose-800 text-rose-300'
                            : 'bg-emerald-950/60 hover:bg-emerald-900 border-emerald-800 text-emerald-300'
                        }`}
                      >
                        {updatingId === org.id
                          ? 'Updating...'
                          : org.status === 'active'
                          ? 'Suspend Org'
                          : 'Reactivate Org'}
                      </button>
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
