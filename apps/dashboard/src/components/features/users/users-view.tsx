'use client';

import { useConfirm } from '@/components/ui/confirm';
import { formatDate } from '@/lib/format';
import { UserTimeline } from './user-timeline';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useUserRank } from '@/hooks/use-leaderboard';
import { useLevels } from '@/hooks/use-levels';
import { useUserChallenges } from '@/hooks/use-challenges';
import { useXp } from '@/hooks/use-xp';
import { useUsers, type UserSort } from '@/hooks/use-users';
import { usePermissions } from '@/hooks/use-permissions';
import {
  useNotificationPreferences,
  type NotificationType,
} from '@/hooks/use-notification-preferences';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TablePagination,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Users,
  Search,
  User as UserIcon,
  Coins,
  Trophy,
  Target,
  TrendingUp,
  Gift,
  Plus,
  Edit2,
  UserX,
  UserCheck,
  CheckCircle2,
  Bell,
  Mail,
  Loader2,
} from 'lucide-react';
import type { User } from '@gami/types';
import { AdminOnly } from '@/components/ui/admin-only';
import { PageHeader } from '@/components/ui/page-header';
import { Checkbox, Switch } from '@/components/ui/checkbox';
import { Dropdown } from '@/components/ui/dropdown';

const SEARCH_DELAY_MS = 250;

const USER_SORT_LABELS: Record<UserSort, string> = {
  newest: 'Newest first',
  oldest: 'Oldest first',
  name: 'Name A to Z',
};

export function UsersView() {
  const { isAdminOrOwner } = usePermissions();
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id || null;
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<UserSort>('newest');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const confirmAction = useConfirm();

  // User Management Hook
  const { users, total, loading, refresh, createUser, updateUser, deactivateUser } = useUsers(
    projectId,
    page,
    25,
    appliedSearch,
    sort
  );

  // Restores the list from the address, so a link or refresh shows the same thing.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedSearch = params.get('search') ?? '';
    const linkedSort = params.get('sort') as UserSort | null;
    setSearch(linkedSearch);
    setAppliedSearch(linkedSearch);
    setPage(Math.max(1, Number(params.get('page')) || 1));
    if (linkedSort && linkedSort in USER_SORT_LABELS) setSort(linkedSort);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setAppliedSearch(search), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const set = (key: string, value: string, fallback: string) =>
      value === fallback ? url.searchParams.delete(key) : url.searchParams.set(key, value);
    set('search', appliedSearch, '');
    set('sort', sort, 'newest');
    set('page', String(page), '1');
    window.history.replaceState(window.history.state, '', url);
  }, [appliedSearch, sort, page]);

  // Grant XP Dialog State
  const [isGrantOpen, setIsGrantOpen] = useState(false);
  const [grantUserId, setGrantUserId] = useState('');
  const [grantAmount, setGrantAmount] = useState('100');
  const [grantReason, setGrantReason] = useState('Admin Manual Grant');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);

  // Create User Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createExternalId, setCreateExternalId] = useState('');
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createAvatarUrl, setCreateAvatarUrl] = useState('');
  const [createMetadata, setCreateMetadata] = useState('{}');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit User Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editMetadata, setEditMetadata] = useState('{}');
  const [editActive, setEditActive] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Deactivate User Dialog State
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [deactivatingUser, setDeactivatingUser] = useState<User | null>(null);
  const [deactivating, setDeactivating] = useState(false);

  // Gamification Detail Hooks
  const {
    userRank,
    loading: profileLoading,
    error: profileError,
  } = useUserRank(projectId, selectedUserId, 'all_time');

  const { userProgress, fetchUserProgress } = useLevels(projectId);
  const { userChallenges } = useUserChallenges(projectId, selectedUserId);
  const { adjustXp } = useXp(projectId);

  // Notification Preferences Hook
  const {
    preferences: userPrefs,
    loading: prefLoading,
    saving: prefSaving,
    error: prefError,
    successMsg: prefSuccess,
    updatePreference,
  } = useNotificationPreferences(projectId, selectedUserId);

  // Search links here with ?user=<id>
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('user');
    if (requested) setSelectedUserId(requested);
  }, []);

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const hasEmail = Boolean(selectedUser?.email && selectedUser.email.includes('@'));

  const handleOpenProfile = (user: User) => {
    setSelectedUserId(user.id);
    fetchUserProgress(user.id);
  };

  const handleOpenGrantModal = (userId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setGrantUserId(userId);
    setGrantAmount('100');
    setGrantReason('Admin Manual Grant');
    setGrantError(null);
    setIsGrantOpen(true);
  };

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGrantError(null);
    const amountNum = Number(grantAmount);
    if (isNaN(amountNum) || amountNum === 0) {
      setGrantError('Enter a valid non-zero XP amount');
      return;
    }

    setGranting(true);
    try {
      await adjustXp(grantUserId, amountNum, grantReason);
      toast.success(
        'XP Granted Successfully',
        `Awarded ${amountNum > 0 ? '+' : ''}${amountNum} XP to user ${grantUserId}`
      );
      setIsGrantOpen(false);
      refresh();
      if (selectedUserId === grantUserId) {
        fetchUserProgress(grantUserId);
      }
    } catch (err: unknown) {
      setGrantError((err as Error).message || 'Failed to grant XP');
    } finally {
      setGranting(false);
    }
  };

  const handleOpenCreateModal = () => {
    setCreateExternalId('');
    setCreateName('');
    setCreateEmail('');
    setCreateAvatarUrl('');
    setCreateMetadata('{}');
    setCreateError(null);
    setIsCreateOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);

    if (!createExternalId.trim()) {
      setCreateError('External ID is required');
      return;
    }

    let parsedMeta = {};
    if (createMetadata.trim()) {
      try {
        parsedMeta = JSON.parse(createMetadata);
      } catch {
        setCreateError('Metadata must be valid JSON');
        return;
      }
    }

    setCreating(true);
    try {
      const newUser = await createUser({
        externalId: createExternalId.trim(),
        name: createName.trim() || undefined,
        email: createEmail.trim() || undefined,
        avatarUrl: createAvatarUrl.trim() || undefined,
        metadata: parsedMeta,
      });

      toast.success(
        'User Created Successfully',
        `Created end-user ${newUser.name || newUser.externalId}`
      );
      setIsCreateOpen(false);
    } catch (err: unknown) {
      setCreateError((err as Error).message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditModal = (user: User, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingUser(user);
    setEditName(user.name || '');
    setEditEmail(user.email || '');
    setEditAvatarUrl(user.avatarUrl || '');
    setEditMetadata(user.metadata ? JSON.stringify(user.metadata, null, 2) : '{}');
    setEditActive(user.active);
    setEditError(null);
    setIsEditOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setEditError(null);

    let parsedMeta = {};
    if (editMetadata.trim()) {
      try {
        parsedMeta = JSON.parse(editMetadata);
      } catch {
        setEditError('Metadata must be valid JSON');
        return;
      }
    }

    setUpdating(true);
    try {
      await updateUser(editingUser.id, {
        name: editName.trim() || undefined,
        email: editEmail.trim() || undefined,
        avatarUrl: editAvatarUrl.trim() || undefined,
        metadata: parsedMeta,
        active: editActive,
      });

      toast.success('User Profile Updated', `Updated user ${editingUser.externalId}`);
      setIsEditOpen(false);
    } catch (err: unknown) {
      setEditError((err as Error).message || 'Failed to update user profile');
    } finally {
      setUpdating(false);
    }
  };

  const handleOpenDeactivateDialog = (user: User, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeactivatingUser(user);
    setIsDeactivateOpen(true);
  };

  const handleBulkDeactivate = async () => {
    const confirmed = await confirmAction({
      title: 'Deactivate users?',
      message: `Deactivate ${selectedIds.length} selected users? Their history is kept.`,
      confirmText: 'Deactivate',
    });
    if (!confirmed) return;

    const results = await Promise.allSettled(selectedIds.map((id) => deactivateUser(id)));
    const failed = results.filter((result) => result.status === 'rejected').length;
    if (failed > 0) {
      toast.error(`${failed} of ${results.length} users could not be deactivated`);
    } else {
      toast.success(`${results.length} users deactivated`);
    }
    setSelectedIds([]);
  };

  const handleDeactivateConfirm = async () => {
    if (!deactivatingUser) return;
    setDeactivating(true);
    try {
      await deactivateUser(deactivatingUser.id);
      toast.success('User Deactivated', `Deactivated account for ${deactivatingUser.externalId}`);
      setIsDeactivateOpen(false);
    } catch (err: unknown) {
      toast.error('Deactivation Failed', (err as Error).message || 'Failed to deactivate user');
    } finally {
      setDeactivating(false);
    }
  };

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Users"
        description="See each user's XP, progress and activity."
        actions={
          <>
            <AdminOnly>
              <Button variant="primary" size="sm" onClick={() => handleOpenCreateModal()}>
                <Plus className="w-4 h-4" />
                Create User
              </Button>
            </AdminOnly>
          </>
        }
      />

      {/* Search */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-52 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                className="w-full pl-9 pr-4 py-2 bg-zinc-950/80 border border-zinc-800 rounded-none text-sm text-zinc-200 placeholder:text-zinc-400 outline-none focus:border-brand-500 transition"
                placeholder="Search by name or external ID..."
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
              />
            </div>
            <Dropdown
              className="w-40"
              value={sort}
              options={Object.entries(USER_SORT_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(value) => {
                setSort(value as UserSort);
                setPage(1);
              }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-brand-400" />
            All users
          </CardTitle>
          <CardDescription>Click a user to see their XP, progress and activity.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={10} />
          ) : users.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="w-12 h-12 rounded-none bg-zinc-800/80 flex items-center justify-center mx-auto">
                <Users className="w-6 h-6 text-zinc-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200">No users yet</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                {search
                  ? `No users match "${search}". Try a different search term.`
                  : 'Users appear when your app sends their first event, or add one by hand.'}
              </p>
            </div>
          ) : (
            <>
              {selectedIds.length > 0 && (
                <div className="flex items-center justify-between gap-3 border border-zinc-800 p-3 text-sm text-zinc-200">
                  <span>{selectedIds.length} selected</span>
                  <Button variant="danger" size="sm" onClick={handleBulkDeactivate}>
                    Deactivate selected
                  </Button>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <Checkbox
                        aria-label="Select all users on this page"
                        checked={users.length > 0 && selectedIds.length === users.length}
                        indeterminate={selectedIds.length > 0 && selectedIds.length < users.length}
                        onChange={(e) =>
                          setSelectedIds(e.target.checked ? users.map((u) => u.id) : [])
                        }
                      />
                    </TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((user) => (
                    <TableRow
                      key={user.id}
                      className="cursor-pointer hover:bg-zinc-800/40 transition"
                      onClick={() => handleOpenProfile(user)}
                    >
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${user.name || user.externalId}`}
                          checked={selectedIds.includes(user.id)}
                          onChange={(e) =>
                            setSelectedIds(
                              e.target.checked
                                ? [...selectedIds, user.id]
                                : selectedIds.filter((id) => id !== user.id)
                            )
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-none bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0 overflow-hidden">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={user.name || user.externalId}
                                className="w-full h-full object-cover"
                              />
                            ) : user.name ? (
                              user.name.charAt(0).toUpperCase()
                            ) : (
                              <UserIcon className="w-3.5 h-3.5 text-zinc-400" />
                            )}
                          </div>
                          <span className="text-xs font-semibold text-zinc-200">
                            {user.name || 'Anonymous User'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-brand-400 font-bold">
                        {user.externalId}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {user.email || (
                          <span className="text-zinc-400 italic">
                            {isAdminOrOwner ? 'No email' : 'Hidden'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {user.active ? (
                          <Badge variant="emerald" className="text-xs">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="zinc" className="text-xs">
                            Deactivated
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-400">
                        {formatDate(user.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link
                            href={`/dashboard/users/${user.id}?tab=ledger`}
                            className="px-2 py-1 bg-zinc-900 border border-zinc-800 text-xs transition flex items-center gap-1 hover:bg-zinc-800 text-zinc-300"
                            title="See this user's XP ledger"
                          >
                            <Coins className="w-3 h-3 text-zinc-400" />
                            Ledger
                          </Link>

                          <AdminOnly>
                            <button
                              onClick={(e) => handleOpenEditModal(user, e)}
                              className={`px-2 py-1 bg-zinc-900 border border-zinc-800 text-xs transition flex items-center gap-1 ${'hover:bg-zinc-800 text-zinc-300 hover:text-zinc-100'}`}
                              title="Edit user profile"
                            >
                              <Edit2 className="w-3 h-3 text-zinc-400" />
                              Edit
                            </button>
                          </AdminOnly>

                          {user.active ? (
                            <AdminOnly>
                              <button
                                onClick={(e) => handleOpenDeactivateDialog(user, e)}
                                className={`px-2 py-1 bg-zinc-900 border border-zinc-800 text-xs transition flex items-center gap-1 ${'hover:bg-danger-950/40 hover:border-danger-800/60 text-danger-400'}`}
                                title="Deactivate user account"
                              >
                                <UserX className="w-3 h-3" />
                                Deactivate
                              </button>
                            </AdminOnly>
                          ) : (
                            <AdminOnly>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  await updateUser(user.id, { active: true });
                                  toast.success(
                                    'User Reactivated',
                                    `User ${user.externalId} is now active.`
                                  );
                                }}
                                className={`px-2 py-1 bg-zinc-900 border border-zinc-800 text-xs transition flex items-center gap-1 ${'hover:bg-success-950/40 hover:border-success-800/60 text-success-400'}`}
                                title="Reactivate user account"
                              >
                                <UserCheck className="w-3 h-3" />
                                Reactivate
                              </button>
                            </AdminOnly>
                          )}

                          <AdminOnly>
                            <button
                              onClick={(e) => handleOpenGrantModal(user.id, e)}
                              className={`px-2 py-1 bg-zinc-900 border border-zinc-800 text-xs transition flex items-center gap-1 ${'hover:bg-zinc-800 text-brand-400 hover:text-brand-300'}`}
                              title="Grant XP to this user"
                            >
                              <Gift className="w-3 h-3" />
                              Grant XP
                            </button>
                          </AdminOnly>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={page}
                limit={25}
                hasMore={total > page * 25}
                onPageChange={handlePageChange}
              />
            </>
          )}
        </CardContent>
      </Card>

      {/* Create User Modal */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create End-User"
        description="Add a user by hand. Users are also created automatically by their first event."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs rounded-none">
              {createError}
            </div>
          )}

          <Input
            label="External ID *"
            placeholder="e.g. customer_9948, usr_uuid_123"
            value={createExternalId}
            onChange={(e) => setCreateExternalId(e.target.value)}
            required
          />

          <Input
            label="Display Name"
            placeholder="e.g. Jane Doe"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. jane.doe@example.com"
            value={createEmail}
            onChange={(e) => setCreateEmail(e.target.value)}
          />

          <Input
            label="Avatar Image URL"
            placeholder="e.g. https://example.com/avatar.png"
            value={createAvatarUrl}
            onChange={(e) => setCreateAvatarUrl(e.target.value)}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="users-view-metadata-json-format"
              className="text-xs font-medium text-zinc-400"
            >
              Metadata (JSON format)
            </label>
            <textarea
              id="users-view-metadata-json-format"
              rows={3}
              className="w-full p-2.5 bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-brand-500 transition"
              value={createMetadata}
              onChange={(e) => setCreateMetadata(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={creating}>
              <Plus className="w-3.5 h-3.5" />
              Create User
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit User Modal */}
      <Dialog
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit User Profile"
        description={editingUser ? `External ID: ${editingUser.externalId}` : 'Update profile data'}
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editError && (
            <div className="p-3 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs rounded-none">
              {editError}
            </div>
          )}

          <Input
            label="Display Name"
            placeholder="e.g. Jane Doe"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
          />

          <Input
            label="Email Address"
            type="email"
            placeholder="e.g. jane.doe@example.com"
            value={editEmail}
            onChange={(e) => setEditEmail(e.target.value)}
          />

          <Input
            label="Avatar Image URL"
            placeholder="e.g. https://example.com/avatar.png"
            value={editAvatarUrl}
            onChange={(e) => setEditAvatarUrl(e.target.value)}
          />

          <div className="space-y-1.5">
            <label
              htmlFor="users-view-metadata-json-format"
              className="text-xs font-medium text-zinc-400"
            >
              Metadata (JSON format)
            </label>
            <textarea
              id="users-view-metadata-json-format"
              rows={3}
              className="w-full p-2.5 bg-zinc-950 border border-zinc-800 text-xs text-zinc-200 outline-none focus:border-brand-500 transition"
              value={editMetadata}
              onChange={(e) => setEditMetadata(e.target.value)}
            />
          </div>

          <Checkbox
            className="pt-1"
            label="Active. Untick to deactivate this user."
            checked={editActive}
            onChange={(e) => setEditActive(e.target.checked)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={updating}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Deactivate User Confirmation Dialog */}
      <Dialog
        isOpen={isDeactivateOpen}
        onClose={() => setIsDeactivateOpen(false)}
        title="Deactivate User Account"
        description={
          deactivatingUser
            ? `Confirm deactivation for ${deactivatingUser.externalId}`
            : 'Deactivate User'
        }
      >
        <div className="space-y-4">
          <div className="p-3 bg-warning-950/40 border border-warning-800/60 text-warning-200 text-xs space-y-1">
            <span className="font-bold block text-warning-400">
              Historical Data Preservation Notice
            </span>
            <p>
              Deactivating this user will prevent further event ingestion for this account. All
              historical gamification data (XP balance, achievements, events, notifications, and
              challenge progress) will remain 100% intact and preserved.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setIsDeactivateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={deactivating}
              onClick={handleDeactivateConfirm}
            >
              <UserX className="w-3.5 h-3.5 text-danger-400" />
              Confirm Deactivation
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Grant XP Quick Modal */}
      <Dialog
        isOpen={isGrantOpen}
        onClose={() => setIsGrantOpen(false)}
        title="Grant XP to User"
        description={`Target User ID: ${grantUserId}`}
      >
        <form onSubmit={handleGrantSubmit} className="space-y-4">
          {grantError && (
            <div className="p-3 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs rounded-none">
              {grantError}
            </div>
          )}

          <Input
            label="XP Amount to Award *"
            type="number"
            placeholder="e.g. 100 or -50"
            value={grantAmount}
            onChange={(e) => setGrantAmount(e.target.value)}
            required
          />

          <Input
            label="Reason / Description *"
            placeholder="e.g. Admin Manual Reward, Community Challenge Winner"
            value={grantReason}
            onChange={(e) => setGrantReason(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-800">
            <Button type="button" variant="ghost" size="sm" onClick={() => setIsGrantOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={granting}>
              <Coins className="w-3.5 h-3.5" />
              Award XP
            </Button>
          </div>
        </form>
      </Dialog>

      {/* User Profile Detail Drawer Modal */}
      <Dialog
        isOpen={!!selectedUserId}
        onClose={() => setSelectedUserId(null)}
        title={
          userRank?.entry?.name
            ? `${userRank.entry.name}'s Profile`
            : selectedUserId
              ? `User: ${userRank?.entry?.externalId || selectedUserId}`
              : 'User Profile'
        }
        description={
          userRank?.entry?.externalId
            ? `External ID: ${userRank.entry.externalId} • Internal ID: ${selectedUserId}`
            : 'Loading user profile data...'
        }
      >
        {profileLoading ? (
          <div className="py-12 flex items-center justify-center gap-3 text-zinc-400 text-sm">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            Loading profile...
          </div>
        ) : profileError ? (
          <div className="p-4 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs">
            {profileError}
          </div>
        ) : userRank?.entry ? (
          <div className="space-y-6">
            {/* Quick Action Banner */}
            <div className="flex flex-wrap justify-end gap-2">
              <Link href={`/dashboard/users/${selectedUserId}?tab=ledger`}>
                <Button variant="outline" size="sm">
                  <Coins className="w-3.5 h-3.5" />
                  XP ledger
                </Button>
              </Link>
              <Link href={`/dashboard/users/${selectedUserId}`}>
                <Button variant="outline" size="sm">
                  <UserIcon className="w-3.5 h-3.5" />
                  Full profile
                </Button>
              </Link>
              <Button
                variant="primary"
                size="sm"
                onClick={() => selectedUserId && handleOpenGrantModal(selectedUserId)}
              >
                <Gift className="w-3.5 h-3.5" />
                Grant XP
              </Button>
            </div>

            {/* Gamification Stats Row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-950/80 p-4 rounded-none border border-zinc-800 text-center">
                <div className="flex items-center justify-center mb-1">
                  <Coins className="w-4 h-4 text-brand-400" />
                </div>
                <div className="text-xl font-black text-brand-400">
                  {userRank.entry.xp.toLocaleString()}
                </div>
                <div className="text-xs text-zinc-400 tracking-wide mt-0.5">XP Total</div>
              </div>
              <div className="bg-zinc-950/80 p-4 rounded-none border border-zinc-800 text-center">
                <div className="flex items-center justify-center mb-1">
                  <TrendingUp className="w-4 h-4 text-warning-400" />
                </div>
                <div className="text-xl font-black text-warning-400">#{userRank.rank}</div>
                <div className="text-xs text-zinc-400 tracking-wide mt-0.5">
                  of {userRank.totalUsers} users
                </div>
              </div>
              <div className="bg-zinc-950/80 p-4 rounded-none border border-zinc-800 text-center">
                <div className="flex items-center justify-center mb-1">
                  <Trophy className="w-4 h-4 text-info-400" />
                </div>
                <div className="text-xl font-black text-info-400">
                  {userRank.entry.levelName ? (
                    <span className="text-sm">{userRank.entry.levelName}</span>
                  ) : (
                    'L1'
                  )}
                </div>
                <div className="text-xs text-zinc-400 tracking-wide mt-0.5">Level</div>
              </div>
            </div>

            {/* Notification Preferences Channel Matrix */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-success-400" />
                  Notification Preferences
                </h4>
                {prefSaving && (
                  <span className="text-xs text-success-400 flex items-center gap-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin" /> Saving...
                  </span>
                )}
                {prefSuccess && <span className="text-xs text-success-400">✓ Saved</span>}
              </div>

              {prefError && (
                <div className="p-2.5 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs">
                  {prefError}
                </div>
              )}

              <div className="bg-zinc-950/80 p-4 rounded-none border border-zinc-800 space-y-3">
                {prefLoading ? (
                  <div className="py-4 flex items-center justify-center gap-2 text-zinc-400 text-xs">
                    <div className="w-4 h-4 border-2 border-success-500 border-t-transparent rounded-full animate-spin" />
                    Loading preferences...
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-zinc-800 text-xs text-zinc-400">
                            <th className="py-2 pr-4 font-bold">Notification Type</th>
                            <th className="py-2 px-4 text-center font-bold">In-App</th>
                            <th className="py-2 pl-4 text-center font-bold">Email</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/60">
                          {[
                            { type: 'xp_awarded', label: 'XP Awarded' },
                            { type: 'achievement_unlocked', label: 'Achievement Unlocked' },
                            { type: 'level_up', label: 'Level Up' },
                            { type: 'challenge_completed', label: 'Challenge Completed' },
                          ].map(({ type, label }) => {
                            const inAppItem = userPrefs.find(
                              (p) => p.channel === 'in_app' && p.notificationType === type
                            );
                            const emailItem = userPrefs.find(
                              (p) => p.channel === 'email' && p.notificationType === type
                            );

                            const inAppEnabled = inAppItem ? inAppItem.enabled : true;
                            const emailEnabled = emailItem ? emailItem.enabled : false;

                            return (
                              <tr key={type} className="hover:bg-zinc-900/40">
                                <td className="py-2.5 pr-4 text-zinc-200 font-medium">{label}</td>

                                {/* In-App Toggle */}
                                <td className="py-2.5 px-4 text-center">
                                  <Switch
                                    aria-label={`${label} in the app`}
                                    className="align-middle"
                                    checked={inAppEnabled}
                                    onChange={(e) =>
                                      updatePreference(
                                        'in_app',
                                        type as NotificationType,
                                        e.target.checked
                                      )
                                    }
                                  />
                                </td>

                                {/* Email Toggle */}
                                <td className="py-2.5 pl-4 text-center">
                                  <Switch
                                    aria-label={`${label} by email`}
                                    className="align-middle"
                                    disabled={!hasEmail}
                                    checked={hasEmail && emailEnabled}
                                    onChange={(e) =>
                                      updatePreference(
                                        'email',
                                        type as NotificationType,
                                        e.target.checked
                                      )
                                    }
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {!hasEmail && (
                      <div className="p-2.5 bg-warning-950/30 border border-warning-800/50 text-warning-300 text-[11px] flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-warning-400 shrink-0" />
                        <span>
                          Add an email address to this user to enable email notifications.
                        </span>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Level Progress */}
            {userProgress && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-warning-400" />
                  Progression Status
                </h4>
                <div className="bg-zinc-950/80 p-4 rounded-none border border-zinc-800 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-warning-400">
                      Level {userProgress.level.number} — {userProgress.level.name}
                    </span>
                    {userProgress.isMaxLevel ? (
                      <Badge variant="emerald">MAX LEVEL</Badge>
                    ) : (
                      <span className="text-zinc-400">
                        Next: {userProgress.nextLevel?.name} @{' '}
                        {userProgress.nextLevel?.requiredXp?.toLocaleString()} XP
                      </span>
                    )}
                  </div>
                  <Progress
                    value={userProgress.progressPercent}
                    sublabel={
                      userProgress.isMaxLevel
                        ? 'Maximum level reached'
                        : `${userProgress.xpToNextLevel?.toLocaleString()} XP to next level`
                    }
                  />
                </div>
              </div>
            )}

            {/* Challenge Progress */}
            {userChallenges && userChallenges.challenges.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-brand-400" />
                  Challenge Progress ({userChallenges.challenges.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {userChallenges.challenges.map((ch) => (
                    <div
                      key={ch.challengeId}
                      className="animate-rise bg-zinc-950/80 p-3 rounded-none border border-zinc-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-zinc-200">{ch.name}</div>
                          <div className="text-xs text-zinc-400 font-mono">{ch.key}</div>
                        </div>
                        <Badge variant={ch.completed ? 'emerald' : 'orange'} className="text-xs">
                          {ch.completed ? '✓ Done' : 'In Progress'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-zinc-400">
                          {ch.progress}/{ch.target}
                        </span>
                        <div className="flex-1 bg-zinc-800 rounded-none h-2 overflow-hidden border border-zinc-800 p-0.5">
                          <div
                            className="bg-brand-500 h-full rounded-none"
                            style={{ width: `${ch.percent}%` }}
                          />
                        </div>
                        <span className="text-brand-400 font-semibold">{ch.percent}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {projectId && selectedUserId && (
              <UserTimeline projectId={projectId} userId={selectedUserId} />
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
