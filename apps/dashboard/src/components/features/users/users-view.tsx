'use client';

import React, { useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useUserRank } from '@/hooks/use-leaderboard';
import { useLevels } from '@/hooks/use-levels';
import { useUserChallenges } from '@/hooks/use-challenges';
import { useXp } from '@/hooks/use-xp';
import { useUsers } from '@/hooks/use-users';
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
  Crown,
  Medal,
  Coins,
  Trophy,
  Target,
  TrendingUp,
  ShieldAlert,
  ChevronRight,
  Gift,
  Plus,
  Edit2,
  UserX,
  UserCheck,
  CheckCircle2,
  Calendar,
  Key,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { User } from '@gami/types';

export function UsersView() {
  const { selectedProject } = useDashboard();
  const projectId = selectedProject?.id || null;
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // User Management Hook
  const { users, total, loading, refresh, createUser, updateUser, deactivateUser } = useUsers(
    projectId,
    page,
    25,
    search
  );

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
  const [createAvatarUrl, setCreateAvatarUrl] = useState('');
  const [createMetadata, setCreateMetadata] = useState('{}');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit User Modal State
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
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

  const handleDeactivateConfirm = async () => {
    if (!deactivatingUser) return;
    setDeactivating(true);

    try {
      await deactivateUser(deactivatingUser.id);
      toast.success(
        'User Deactivated',
        `User ${deactivatingUser.externalId} has been deactivated. Historical gamification data remains intact.`
      );
      setIsDeactivateOpen(false);
    } catch (err: unknown) {
      toast.error('Deactivation Failed', (err as Error).message || 'Failed to deactivate user');
    } finally {
      setDeactivating(false);
    }
  };

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setPage(1);
  };

  if (!selectedProject) {
    return (
      <div className="p-12 text-center bg-zinc-900/40 rounded-none border border-zinc-800 space-y-3">
        <ShieldAlert className="w-8 h-8 text-zinc-500 mx-auto" />
        <h3 className="text-base font-semibold text-zinc-200">No Project Selected</h3>
        <p className="text-xs text-zinc-400">Select a project to browse end-users.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight flex items-center gap-2">
            End-Users
            {total > 0 && <Badge variant="orange">{total.toLocaleString()} users</Badge>}
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Manage end-user identities, profiles & gamification status for{' '}
            <span className="text-orange-400 font-semibold">{selectedProject.name}</span>
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={handleOpenCreateModal}>
          <Plus className="w-4 h-4" />
          Create User
        </Button>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-5 pb-5">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              className="w-full pl-9 pr-4 py-2 bg-zinc-950/80 border border-zinc-800 rounded-none text-sm text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-orange-500/60 transition font-mono"
              placeholder="Search by name or external ID..."
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card className="bg-zinc-900/80 border-zinc-800">
        <CardHeader>
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-orange-400" />
            User Management Roster
          </CardTitle>
          <CardDescription>
            All registered project end-users. Click any row to inspect profile, XP, progression,
            achievements & challenges.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <TableSkeleton rows={10} />
          ) : users.length === 0 ? (
            <div className="text-center py-16 px-4 space-y-3">
              <div className="w-12 h-12 rounded-none bg-zinc-800/80 flex items-center justify-center mx-auto">
                <Users className="w-6 h-6 text-zinc-500" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200">No Users Found</h3>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                {search
                  ? `No users match "${search}". Try a different search term.`
                  : 'No users exist in this project yet. Click "Create User" or send an event to auto-provision.'}
              </p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>External ID</TableHead>
                    <TableHead>Internal Gami ID</TableHead>
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
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-none bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-bold text-orange-400 shrink-0 font-mono overflow-hidden">
                            {user.avatarUrl ? (
                              <img
                                src={user.avatarUrl}
                                alt={user.name || user.externalId}
                                className="w-full h-full object-cover"
                              />
                            ) : user.name ? (
                              user.name.charAt(0).toUpperCase()
                            ) : (
                              <UserIcon className="w-3.5 h-3.5 text-zinc-500" />
                            )}
                          </div>
                          <span className="text-xs font-semibold text-zinc-200">
                            {user.name || 'Anonymous User'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-orange-400 font-bold">
                        {user.externalId}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-zinc-500">{user.id}</TableCell>
                      <TableCell>
                        {user.active ? (
                          <Badge variant="emerald" className="text-[10px]">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="zinc" className="text-[10px]">
                            Deactivated
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-zinc-500 font-mono">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <div
                          className="flex items-center justify-end gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            onClick={(e) => handleOpenEditModal(user, e)}
                            className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 hover:text-zinc-100 transition flex items-center gap-1"
                            title="Edit user profile"
                          >
                            <Edit2 className="w-3 h-3 text-zinc-400" />
                            Edit
                          </button>

                          {user.active ? (
                            <button
                              onClick={(e) => handleOpenDeactivateDialog(user, e)}
                              className="px-2 py-1 bg-zinc-900 hover:bg-rose-950/40 border border-zinc-800 hover:border-rose-800/60 text-xs text-rose-400 transition flex items-center gap-1"
                              title="Deactivate user account"
                            >
                              <UserX className="w-3 h-3" />
                              Deactivate
                            </button>
                          ) : (
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await updateUser(user.id, { active: true });
                                toast.success(
                                  'User Reactivated',
                                  `User ${user.externalId} is now active.`
                                );
                              }}
                              className="px-2 py-1 bg-zinc-900 hover:bg-emerald-950/40 border border-zinc-800 hover:border-emerald-800/60 text-xs text-emerald-400 transition flex items-center gap-1"
                              title="Reactivate user account"
                            >
                              <UserCheck className="w-3 h-3" />
                              Reactivate
                            </button>
                          )}

                          <button
                            onClick={(e) => handleOpenGrantModal(user.id, e)}
                            className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-orange-400 hover:text-orange-300 transition flex items-center gap-1"
                            title="Grant XP to this user"
                          >
                            <Gift className="w-3 h-3" />
                            Grant XP
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <TablePagination
                page={page}
                limit={25}
                hasMore={page * 25 < total}
                onPageChange={setPage}
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
        description="Manually provision a project end-user identity record."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {createError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none">
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
            label="Avatar Image URL"
            placeholder="e.g. https://example.com/avatar.png"
            value={createAvatarUrl}
            onChange={(e) => setCreateAvatarUrl(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-mono font-medium text-zinc-400">
              Metadata (JSON format)
            </label>
            <textarea
              rows={3}
              className="w-full p-2.5 bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 outline-none focus:border-orange-500/60 transition"
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
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none">
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
            label="Avatar Image URL"
            placeholder="e.g. https://example.com/avatar.png"
            value={editAvatarUrl}
            onChange={(e) => setEditAvatarUrl(e.target.value)}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-mono font-medium text-zinc-400">
              Metadata (JSON format)
            </label>
            <textarea
              rows={3}
              className="w-full p-2.5 bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 outline-none focus:border-orange-500/60 transition"
              value={editMetadata}
              onChange={(e) => setEditMetadata(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="editActiveCheckbox"
              checked={editActive}
              onChange={(e) => setEditActive(e.target.checked)}
              className="accent-orange-500"
            />
            <label htmlFor="editActiveCheckbox" className="text-xs text-zinc-300 font-mono">
              Account Active Status (uncheck to deactivate)
            </label>
          </div>

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
          <div className="p-3 bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs space-y-1">
            <span className="font-bold block text-amber-400">
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
              <UserX className="w-3.5 h-3.5 text-rose-400" />
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
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none">
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
            <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            Loading profile...
          </div>
        ) : profileError ? (
          <div className="p-4 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none">
            {profileError}
          </div>
        ) : userRank?.entry ? (
          <div className="space-y-6">
            {/* Quick Action Banner */}
            <div className="flex justify-end gap-2">
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
                  <Coins className="w-4 h-4 text-orange-400" />
                </div>
                <div className="text-xl font-black text-orange-400">
                  {userRank.entry.xp.toLocaleString()}
                </div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5 font-mono">
                  XP Total
                </div>
              </div>
              <div className="bg-zinc-950/80 p-4 rounded-none border border-zinc-800 text-center">
                <div className="flex items-center justify-center mb-1">
                  <TrendingUp className="w-4 h-4 text-amber-400" />
                </div>
                <div className="text-xl font-black text-amber-400 font-mono">#{userRank.rank}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">
                  of {userRank.totalUsers} users
                </div>
              </div>
              <div className="bg-zinc-950/80 p-4 rounded-none border border-zinc-800 text-center">
                <div className="flex items-center justify-center mb-1">
                  <Trophy className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-xl font-black text-purple-400">
                  {userRank.entry.levelName ? (
                    <span className="text-sm">{userRank.entry.levelName}</span>
                  ) : (
                    'L1'
                  )}
                </div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wide mt-0.5">
                  Level
                </div>
              </div>
            </div>

            {/* Level Progress */}
            {userProgress && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                  Progression Status
                </h4>
                <div className="bg-zinc-950/80 p-4 rounded-none border border-zinc-800 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-amber-400">
                      Level {userProgress.level.number} — {userProgress.level.name}
                    </span>
                    {userProgress.isMaxLevel ? (
                      <Badge variant="emerald">MAX LEVEL</Badge>
                    ) : (
                      <span className="text-zinc-500">
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
                  <Target className="w-3.5 h-3.5 text-orange-400" />
                  Challenge Progress ({userChallenges.challenges.length})
                </h4>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {userChallenges.challenges.map((ch) => (
                    <motion.div
                      key={ch.challengeId}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="bg-zinc-950/80 p-3 rounded-none border border-zinc-800 space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-xs font-semibold text-zinc-200">{ch.name}</div>
                          <div className="text-[10px] text-zinc-500 font-mono">{ch.key}</div>
                        </div>
                        <Badge
                          variant={ch.completed ? 'emerald' : 'orange'}
                          className="text-[10px]"
                        >
                          {ch.completed ? '✓ Done' : 'In Progress'}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-zinc-500 font-mono">
                          {ch.progress}/{ch.target}
                        </span>
                        <div className="flex-1 bg-zinc-800 rounded-none h-2 overflow-hidden border border-zinc-800 p-0.5">
                          <div
                            className="bg-orange-500 h-full rounded-none"
                            style={{ width: `${ch.percent}%` }}
                          />
                        </div>
                        <span className="text-orange-400 font-semibold">{ch.percent}%</span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
