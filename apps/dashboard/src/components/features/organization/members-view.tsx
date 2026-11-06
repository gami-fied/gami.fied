'use client';

import { formatDate } from '@/lib/format';
import { apiFetch } from '@/lib/api-client';
import { useConfirm } from '@/components/ui/confirm';
import { useToast } from '@/components/ui/toast';
import { useEffect, useState } from 'react';
import {
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
import { usePermissions } from '@/hooks/use-permissions';
import { AdminOnly } from '@/components/ui/admin-only';
import { PageHeader } from '@/components/ui/page-header';

export function MembersView() {
  const { isAdminOrOwner } = usePermissions();
  const toast = useToast();
  const confirmAction = useConfirm();
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
  const [selectedDrawerMember, setSelectedDrawerMember] = useState<OrganizationMemberRecord | null>(
    null
  );

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

      const res = await apiFetch(
        `/api/organizations/${selectedOrg.id}/members?${params.toString()}`
      );
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
      const res = await apiFetch(
        `/api/organizations/${selectedOrg.id}/members/${roleChangeMember.userId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: newRole }),
        }
      );
      if (res.ok) {
        setRoleChangeMember(null);
        await fetchMembers();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`Role change failed: ${err.message || 'Error updating role'}`);
      }
    } catch {
      toast.error('Network error updating member role');
    } finally {
      setRoleSaving(false);
    }
  };

  const handleTransferOwnershipSubmit = async () => {
    if (!selectedOrg || !transferMember) return;
    setTransferSaving(true);
    try {
      const res = await apiFetch(`/api/organizations/${selectedOrg.id}/transfer-ownership`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: transferMember.userId }),
      });
      if (res.ok) {
        setTransferMember(null);
        toast.success(`Ownership transferred to ${transferMember.email}! You are now an Admin.`);
        window.location.reload();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`Ownership transfer failed: ${err.message || 'Error transferring ownership'}`);
      }
    } catch {
      toast.error('Network error transferring ownership');
    } finally {
      setTransferSaving(false);
    }
  };

  const handleRemoveMember = async (mem: OrganizationMemberRecord) => {
    if (!selectedOrg) return;
    if (
      !(await confirmAction({
        message: `Are you sure you want to remove ${mem.name || mem.email} from the organization?`,
      }))
    )
      return;

    try {
      const res = await apiFetch(`/api/organizations/${selectedOrg.id}/members/${mem.userId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchMembers();
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(`Remove failed: ${err.message || 'Error removing member'}`);
      }
    } catch {
      toast.error('Network error removing member');
    }
  };

  if (!selectedOrg) {
    return (
      <div className="p-8 text-center text-zinc-400 text-xs">
        Please select an organization to view team members.
      </div>
    );
  }

  const currentUserRole = selectedOrg.role || 'member';
  const isOwner = currentUserRole === 'owner';

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Team members"
        description={
          <>
            <span>
              {' '}
              Manage developer team members, access roles, and project assignments for{' '}
              <span className="text-zinc-200">{selectedOrg.name}</span>.{' '}
            </span>
          </>
        }
        actions={
          <>
            <AdminOnly>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsInviteOpen(true)}
                className={`font-medium h-9 ${'bg-brand-500 hover:bg-brand-600 text-on-accent'}`}
              >
                <UserPlus className="w-4 h-4 mr-1" />
                Invite Member
              </Button>
            </AdminOnly>
          </>
        }
      />

      {error && (
        <div className="p-4 bg-danger-950/40 border border-danger-800 text-danger-300 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-danger-400 shrink-0" />
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
            leftIcon={<Search className="w-4 h-4 text-zinc-400" />}
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

          <Button
            variant="secondary"
            size="sm"
            onClick={fetchMembers}
            className="h-9 border-zinc-800 text-zinc-400"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Members Table */}
      <Card className="bg-zinc-950 border-zinc-800">
        {loading ? (
          <div className="py-12 text-center text-xs text-zinc-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-brand-400" />
            Loading members...
          </div>
        ) : members.length === 0 ? (
          <div className="py-12 text-center text-xs text-zinc-400">
            No organization members found matching your search.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/60 text-zinc-400 text-xs">
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
                  if (!isAdminOrOwner) roleDisabledReason = 'Needs an owner or admin';
                  else if (isMemOwner)
                    roleDisabledReason = 'Cannot modify role of Organization Owner';
                  else if (isSelf) roleDisabledReason = 'Cannot modify your own role';

                  let removeDisabledReason = '';
                  if (!isAdminOrOwner) removeDisabledReason = 'Needs an owner or admin';
                  else if (isMemOwner) removeDisabledReason = 'Cannot remove Organization Owner';
                  else if (isSelf)
                    removeDisabledReason = 'Cannot remove your own account from list';
                  else if (currentUserRole === 'admin' && mem.role === 'admin')
                    removeDisabledReason = 'Admins cannot remove other Admins';

                  return (
                    <tr key={mem.id} className="hover:bg-zinc-900/40 transition">
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0">
                            {mem.name ? mem.name.charAt(0).toUpperCase() : 'U'}
                          </div>
                          <div>
                            <div className="font-bold text-zinc-100 flex items-center gap-1.5">
                              {mem.name || 'User'}
                              {isSelf && (
                                <span className="text-xs px-1 py-0.2 bg-zinc-800 text-zinc-400 border border-zinc-700">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-zinc-400">{mem.email}</div>
                          </div>
                        </div>
                      </td>

                      <td className="p-3">
                        <span
                          className={`text-xs font-bold px-2 py-0.5 border flex items-center gap-1 w-fit ${
                            isMemOwner
                              ? 'border-warning-800 bg-warning-950/60 text-warning-400'
                              : mem.role === 'admin'
                                ? 'border-info-800 bg-info-950/60 text-info-400'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                          }`}
                        >
                          {isMemOwner ? (
                            <Crown className="w-3 h-3 text-warning-400" />
                          ) : (
                            <Shield className="w-3 h-3" />
                          )}
                          {mem.role}
                        </span>
                      </td>

                      <td className="p-3 text-zinc-400">{formatDate(mem.createdAt)}</td>

                      <td className="p-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setSelectedDrawerMember(mem)}
                            className="h-7 px-2 border-zinc-800 hover:bg-zinc-900 text-zinc-300 text-[11px]"
                          >
                            <Eye className="w-3 h-3 mr-1 text-info-400" /> Profile
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
                                : 'opacity-40 cursor-not-allowed text-zinc-400 border-zinc-900'
                            }`}
                          >
                            <Sliders className="w-3 h-3 mr-1 text-brand-400" /> Role
                          </Button>

                          {/* Transfer Ownership Button (Only for Owner) */}
                          {isOwner && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!canTransfer}
                              title={
                                !canTransfer
                                  ? 'Cannot transfer ownership to self or owner'
                                  : 'Transfer ownership'
                              }
                              onClick={() => {
                                if (!canTransfer) return;
                                setTransferMember(mem);
                              }}
                              className={`h-7 px-2 text-[11px] ${
                                canTransfer
                                  ? 'border-warning-900/80 hover:bg-warning-950/40 text-warning-400'
                                  : 'opacity-40 cursor-not-allowed text-zinc-400 border-zinc-900'
                              }`}
                            >
                              <ArrowRightLeft className="w-3 h-3 mr-1 text-warning-400" /> Transfer
                            </Button>
                          )}

                          {/* Remove Member Button */}
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={!canRemove}
                            title={
                              !canRemove ? removeDisabledReason : 'Remove member from organization'
                            }
                            onClick={() => {
                              if (!canRemove) return;
                              handleRemoveMember(mem);
                            }}
                            className={`h-7 px-2 text-[11px] ${
                              canRemove
                                ? 'border-danger-950 hover:bg-danger-950/40 text-danger-400'
                                : 'opacity-40 cursor-not-allowed text-zinc-400 border-zinc-900'
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
            <span>
              Page {page} of {totalPages}
            </span>
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
          <form onSubmit={handleRoleChangeSubmit} className="space-y-4 text-xs">
            <p className="text-zinc-400">
              Select a new access role for{' '}
              <span className="text-zinc-100 font-bold">{roleChangeMember.email}</span>.
            </p>

            <div className="space-y-1.5">
              <label className="block text-[13px] font-medium text-zinc-300">Target Role</label>
              <Dropdown
                options={[
                  {
                    value: 'member',
                    label: 'Member',
                    sublabel: 'Read project data and dashboards',
                  },
                  {
                    value: 'admin',
                    label: 'Admin',
                    sublabel: 'Manage members, invitations & projects',
                  },
                ]}
                value={newRole}
                onChange={(val) => setNewRole(val as 'admin' | 'member')}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setRoleChangeMember(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={roleSaving}
                className="bg-brand-500 hover:bg-brand-600 text-on-accent"
              >
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
          <div className="space-y-4 text-xs">
            <div className="p-3 bg-warning-950/40 border border-warning-800 text-warning-300 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-warning-400 shrink-0" />
              <span>
                Warning: Ownership transfer is permanent. You will step down as Owner and become an
                Admin.
              </span>
            </div>

            <p className="text-zinc-300">
              Are you sure you want to transfer full ownership of organization{' '}
              <span className="text-warning-400 font-bold">{selectedOrg.name}</span> to{' '}
              <span className="text-zinc-100 font-bold">{transferMember.email}</span>?
            </p>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-zinc-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setTransferMember(null)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleTransferOwnershipSubmit}
                isLoading={transferSaving}
                className="bg-warning-600 hover:bg-warning-500 text-on-accent"
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
