'use client';

import { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Search,
  Shield,
  Trash2,
  RefreshCw,
  Sliders,
  Crown,
  Eye,
  AlertTriangle,
  ArrowRightLeft,
  Lock,
} from 'lucide-react';
import { useDashboard } from '../context/dashboard-context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';
import { InviteModal } from './invite-modal';
import { MemberDetailsDrawer } from './member-details-drawer';
import type { OrganizationMemberRecord } from '@gami.fied/sdk';

export function MembersView() {
  const { selectedOrg, session } = useDashboard();
  const [members, setMembers] = useState<OrganizationMemberRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search, Filter & Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Modal States
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [selectedDrawerMember, setSelectedDrawerMember] = useState<OrganizationMemberRecord | null>(null);

  // Change Role Dialog State
  const [roleChangeMember, setRoleChangeMember] = useState<OrganizationMemberRecord | null>(null);
  const [newRole, setNewRole] = useState<'admin' | 'member'>('member');
  const [roleSaving, setRoleSaving] = useState(false);

  // Transfer Ownership Dialog State
  const [transferMember, setTransferMember] = useState<OrganizationMemberRecord | null>(null);
  const [transferSaving, setTransferSaving] = useState(false);

  useEffect(() => {
    if (selectedOrg) {
      fetchMembers();
    }
  }, [selectedOrg, searchQuery, roleFilter, page]);

  const fetchMembers = async () => {
    if (!selectedOrg) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (roleFilter) params.append('role', roleFilter);
      params.append('page', page.toString());
      params.append('limit', '10');

      const res = await fetch(`/api/organizations/${selectedOrg.id}/members?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setMembers(data.members || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setError(null);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.message || 'Failed to load organization members');
      }
    } catch {
      setError('Network error loading members');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrg || !roleChangeMember) return;
    setRoleSaving(true);
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/members/${roleChangeMember.userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setRoleChangeMember(null);
        await fetchMembers();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Role change failed: ${err.message || 'Error updating role'}`);
      }
    } catch {
      alert('Network error updating member role');
    } finally {
      setRoleSaving(false);
    }
  };

  const handleTransferOwnershipSubmit = async () => {
    if (!selectedOrg || !transferMember) return;
    setTransferSaving(true);
    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: transferMember.userId }),
      });
      if (res.ok) {
        setTransferMember(null);
        alert(`Ownership transferred to ${transferMember.email}! You are now an Admin.`);
        window.location.reload();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Ownership transfer failed: ${err.message || 'Error transferring ownership'}`);
      }
    } catch {
      alert('Network error transferring ownership');
    } finally {
      setTransferSaving(false);
    }
  };

  const handleRemoveMember = async (mem: OrganizationMemberRecord) => {
    if (!selectedOrg) return;
    if (!confirm(`Are you sure you want to remove ${mem.name || mem.email} from the organization?`)) return;

    try {
      const res = await fetch(`/api/organizations/${selectedOrg.id}/members/${mem.userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchMembers();
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Remove failed: ${err.message || 'Error removing member'}`);
      }
    } catch {
      alert('Network error removing member');
    }
  };

  if (!selectedOrg) {
    return (
      <div className="p-8 text-center text-zinc-500 font-mono text-xs">
        Please select an organization to view team members.
      </div>
    );
  }

  const currentUserRole = selectedOrg.role || 'member';
  const isOwner = currentUserRole === 'owner';
  const isAdminOrOwner = ['owner', 'admin'].includes(currentUserRole);

  return (
    <div className="space-y-6 font-mono">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            <Users className="w-5 h-5 text-orange-400" />
            Organization Members & Roles
          </h1>
          <p className="text-xs text-zinc-400 mt-1 flex items-center gap-2">
            <span>
              Manage developer team members, access roles, and project assignments for{' '}
              <span className="text-orange-400 font-semibold">{selectedOrg.name}</span>.
            </span>
            {!isAdminOrOwner && (
              <span className="text-[10px] uppercase font-bold text-zinc-400 bg-zinc-900 border border-zinc-800 px-2 py-0.5 shrink-0 flex items-center gap-1">
                <Lock className="w-3 h-3 text-zinc-500" /> READ-ONLY MEMBER
              </span>
            )}
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          disabled={!isAdminOrOwner}
          title={!isAdminOrOwner ? 'Requires Admin or Owner role to invite members' : undefined}
          onClick={() => setIsInviteOpen(true)}
          className={`font-medium h-9 ${
            isAdminOrOwner
              ? 'bg-orange-500 hover:bg-orange-600 text-white'
              : 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500 border-zinc-700'
          }`}
        >
          <UserPlus className="w-4 h-4 mr-1" />
          Invite Member
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-zinc-950/80 p-3 border border-zinc-800">
        <div className="w-full sm:w-72">
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setPage(1);
            }}
            leftIcon={<Search className="w-4 h-4 text-zinc-500" />}
            className="h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="w-40">
            <Dropdown
              options={[
                { value: '', label: 'All Roles' },
                { value: 'owner', label: 'Owners' },
                { value: 'admin', label: 'Admins' },
                { value: 'member', label: 'Members' },
              ]}
              value={roleFilter}
              onChange={(val) => {
                setRoleFilter(val);
                setPage(1);
              }}
            />
          </div>

          <Button variant="secondary" size="sm" onClick={fetchMembers} className="h-9 border-zinc-800 text-zinc-400">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Members Table */}
      <Card className="bg-zinc-950 border-zinc-800">
        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-orange-400" />
            Loading members...
          </div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-500">
            No organization members found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 uppercase text-[10px] tracking-wider">
                  <th className="p-3">Member</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Joined Date</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60">
                {members.map((mem) => {
                  const isMemOwner = mem.role === 'owner';
                  const isSelf = mem.userId === session?.user?.id;

                  // Permission evaluations for action disabling
                  const canEditRole = isAdminOrOwner && !isMemOwner && !isSelf;
                  const canTransfer = isOwner && !isMemOwner && !isSelf;
                  const canRemove =
                    isAdminOrOwner &&
                    !isMemOwner &&
                    !isSelf &&
                    !(currentUserRole === 'admin' && mem.role === 'admin');

                  let roleDisabledReason = '';
                  if (!isAdminOrOwner) roleDisabledReason = 'Requires Admin or Owner role';
                  else if (isMemOwner) roleDisabledReason = 'Cannot modify role of Organization Owner';
                  else if (isSelf) roleDisabledReason = 'Cannot modify your own role';

                  let removeDisabledReason = '';
                  if (!isAdminOrOwner) removeDisabledReason = 'Requires Admin or Owner role';
                  else if (isMemOwner) removeDisabledReason = 'Cannot remove Organization Owner';
                  else if (isSelf) removeDisabledReason = 'Cannot remove your own account from list';
                  else if (currentUserRole === 'admin' && mem.role === 'admin')
                    removeDisabledReason = 'Admins cannot remove other Admins';

                  return (
                    <tr key={mem.id} className="hover:bg-zinc-900/40 transition">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-orange-400 shrink-0">
                            {mem.name ? mem.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-100 flex items-center gap-1.5">
                              {mem.name || 'User'}
                              {isSelf && (
                                <span className="text-[9px] px-1 py-0.2 bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-500">{mem.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 border flex items-center gap-1 w-fit ${
                            isMemOwner
                              ? 'border-amber-800 bg-amber-950/60 text-amber-400'
                              : mem.role === 'admin'
                              ? 'border-cyan-800 bg-cyan-950/60 text-cyan-400'
                              : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                          }`}
                        >
                          {isMemOwner ? <Crown className="w-3 h-3 text-amber-400" /> : <Shield className="w-3 h-3" />}
                          {mem.role}
                        </span>
                      </td>

                      <td className="p-3 text-zinc-400">
                        {new Date(mem.createdAt).toLocaleDateString()}
                      </td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedDrawerMember(mem)}
                            className="h-7 px-2 border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-[11px]"
                          >
                            <Eye className="w-3 h-3 mr-1 text-cyan-400" /> Profile
                          </Button>

                          {/* Role Change Button */}
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!canEditRole}
                            title={!canEditRole ? roleDisabledReason : 'Change member role'}
                            onClick={() => {
                              if (!canEditRole) return;
                              setRoleChangeMember(mem);
                              setNewRole(mem.role === 'admin' ? 'member' : 'admin');
                            }}
                            className={`h-7 px-2 border-zinc-800 text-[11px] ${
                              canEditRole
                                ? 'hover:bg-zinc-900 text-zinc-300'
                                : 'opacity-40 cursor-not-allowed text-zinc-600 border-zinc-900'
                            }`}
                          >
                            <Sliders className="w-3 h-3 mr-1 text-orange-400" /> Role
                          </Button>

                          {/* Transfer Ownership Button (Only for Owner) */}
                          {isOwner && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!canTransfer}
                              title={!canTransfer ? 'Cannot transfer ownership to self or owner' : 'Transfer ownership'}
                              onClick={() => {
                                if (!canTransfer) return;
                                setTransferMember(mem);
                              }}
                              className={`h-7 px-2 text-[11px] ${
                                canTransfer
                                  ? 'border-amber-900/80 hover:bg-amber-950/40 text-amber-400'
                                  : 'opacity-40 cursor-not-allowed text-zinc-600 border-zinc-900'
                              }`}
                            >
                              <ArrowRightLeft className="w-3 h-3 mr-1 text-amber-400" /> Transfer
                            </Button>
                          )}

                          {/* Remove Member Button */}
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!canRemove}
                            title={!canRemove ? removeDisabledReason : 'Remove member from organization'}
                            onClick={() => {
                              if (!canRemove) return;
                              handleRemoveMember(mem);
                            }}
                            className={`h-7 px-2 text-[11px] ${
                              canRemove
                                ? 'border-rose-950 hover:bg-rose-950/40 text-rose-400'
                                : 'opacity-40 cursor-not-allowed text-zinc-600 border-zinc-900'
                            }`}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <span>Page {page} of {totalPages}</span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="h-7 px-2 border-zinc-800 text-zinc-400"
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="h-7 px-2 border-zinc-800 text-zinc-400"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Modals & Drawers */}
      <InviteModal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        onSuccess={fetchMembers}
      />

      <MemberDetailsDrawer
        member={selectedDrawerMember}
        isOpen={Boolean(selectedDrawerMember)}
        onClose={() => setSelectedDrawerMember(null)}
        onRefresh={fetchMembers}
      />

      {/* Change Role Dialog */}
      {roleChangeMember && (
        <Dialog
          isOpen={Boolean(roleChangeMember)}
          onClose={() => setRoleChangeMember(null)}
          title={`Change Member Role — ${roleChangeMember.name || roleChangeMember.email}`}
        >
          <form onSubmit={handleRoleChangeSubmit} className="space-y-4 font-mono text-xs">
            <p className="text-zinc-400">
              Select a new access role for <span className="text-zinc-100 font-bold">{roleChangeMember.email}</span>.
            </p>

            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-zinc-300">Target Role</label>
              <Dropdown
                options={[
                  { value: 'member', label: 'Member', sublabel: 'Read project data and dashboards' },
                  { value: 'admin', label: 'Admin', sublabel: 'Manage members, invitations & projects' },
                ]}
                value={newRole}
                onChange={(val) => setNewRole(val as 'admin' | 'member')}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
              <Button type="button" variant="secondary" size="sm" onClick={() => setRoleChangeMember(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={roleSaving} className="bg-orange-500 hover:bg-orange-600 text-white">
                Save Role
              </Button>
            </div>
          </form>
        </Dialog>
      )}

      {/* Transfer Ownership Dialog */}
      {transferMember && (
        <Dialog
          isOpen={Boolean(transferMember)}
          onClose={() => setTransferMember(null)}
          title={`Transfer Organization Ownership`}
        >
          <div className="space-y-4 font-mono text-xs">
            <div className="p-3 bg-amber-950/40 border border-amber-800 text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
              <span>
                Warning: Ownership transfer is permanent. You will step down as Owner and become an Admin.
              </span>
            </div>

            <p className="text-zinc-300">
              Are you sure you want to transfer full ownership of organization{' '}
              <span className="text-amber-400 font-bold">{selectedOrg.name}</span> to{' '}
              <span className="text-zinc-100 font-bold">{transferMember.email}</span>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
              <Button type="button" variant="secondary" size="sm" onClick={() => setTransferMember(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleTransferOwnershipSubmit}
                isLoading={transferSaving}
                className="bg-amber-600 hover:bg-amber-500 text-white"
              >
                Confirm Ownership Transfer
              </Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
