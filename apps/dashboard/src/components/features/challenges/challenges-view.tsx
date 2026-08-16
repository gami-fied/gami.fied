'use client';

import React, { useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useChallenges, useChallengeSummary, useUserChallenges } from '@/hooks/use-challenges';
import { ChallengeDefinition, ChallengeReward } from '@gami/challenges';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import { Dialog } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Target,
  Plus,
  Search,
  CheckCircle2,
  AlertCircle,
  Zap,
  Award,
  Coins,
  Calendar,
  Sparkles,
  UserCheck,
  Power,
  Edit2,
} from 'lucide-react';
import { motion } from 'motion/react';

export function ChallengesView() {
  const { selectedProject, selectedOrg } = useDashboard();
  const isAdminOrOwner = ['owner', 'admin'].includes(selectedOrg?.role || 'member');
  const projectId = selectedProject?.id || null;

  const { challenges, loading, error, refresh } = useChallenges(projectId);
  const {
    summary,
    loading: summaryLoading,
    refresh: refreshSummary,
  } = useChallengeSummary(projectId);

  const [activeTab, setActiveTab] = useState<'management' | 'user_lookup'>('management');

  // User Lookup state
  const [lookupInput, setLookupInput] = useState('');
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
  const {
    userChallenges,
    loading: lookupLoading,
    error: lookupError,
  } = useUserChallenges(projectId, targetUserId);

  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingChallenge, setEditingChallenge] = useState<ChallengeDefinition | null>(null);
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [formData, setFormData] = useState<{
    key: string;
    name: string;
    description: string;
    trigger: string;
    target: number;
    startAt: string;
    endAt: string;
    xpRewardAmount: number;
    achievementKey: string;
  }>({
    key: '',
    name: '',
    description: '',
    trigger: '',
    target: 1,
    startAt: '',
    endAt: '',
    xpRewardAmount: 0,
    achievementKey: '',
  });

  const openCreateModal = () => {
    setEditingChallenge(null);
    setFormData({
      key: '',
      name: '',
      description: '',
      trigger: '',
      target: 1,
      startAt: '',
      endAt: '',
      xpRewardAmount: 0,
      achievementKey: '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (ch: ChallengeDefinition) => {
    setEditingChallenge(ch);
    const xpRew = (ch.rewards || []).find((r) => r.type === 'xp') as { amount: number } | undefined;
    const achRew = (ch.rewards || []).find((r) => r.type === 'achievement') as
      { achievementKey: string } | undefined;

    setFormData({
      key: ch.key,
      name: ch.name,
      description: ch.description || '',
      trigger: ch.trigger,
      target: ch.target,
      startAt: ch.startAt ? new Date(ch.startAt).toISOString().slice(0, 16) : '',
      endAt: ch.endAt ? new Date(ch.endAt).toISOString().slice(0, 16) : '',
      xpRewardAmount: xpRew ? xpRew.amount : 0,
      achievementKey: achRew ? achRew.achievementKey : '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectId) return;

    setFormLoading(true);
    setFormError(null);

    const rewards: ChallengeReward[] = [];
    if (formData.xpRewardAmount > 0) {
      rewards.push({ type: 'xp', amount: Number(formData.xpRewardAmount) });
    }
    if (formData.achievementKey.trim()) {
      rewards.push({ type: 'achievement', achievementKey: formData.achievementKey.trim() });
    }

    try {
      const isEdit = Boolean(editingChallenge);
      const url = isEdit
        ? `/api/projects/${projectId}/challenges/${editingChallenge!.id}`
        : `/api/projects/${projectId}/challenges`;

      const method = isEdit ? 'PATCH' : 'POST';

      const payload = isEdit
        ? {
            name: formData.name,
            description: formData.description || null,
            trigger: formData.trigger,
            target: Number(formData.target),
            startAt: formData.startAt ? new Date(formData.startAt).toISOString() : null,
            endAt: formData.endAt ? new Date(formData.endAt).toISOString() : null,
            rewards,
          }
        : {
            key: formData.key,
            name: formData.name,
            description: formData.description || null,
            trigger: formData.trigger,
            target: Number(formData.target),
            startAt: formData.startAt ? new Date(formData.startAt).toISOString() : null,
            endAt: formData.endAt ? new Date(formData.endAt).toISOString() : null,
            rewards,
          };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsModalOpen(false);
        refresh();
        refreshSummary();
      } else {
        const err = await res.json();
        setFormError(err.message || 'Failed to save challenge');
      }
    } catch {
      setFormError('An error occurred while saving challenge');
    } finally {
      setFormLoading(false);
    }
  };

  const toggleDisable = async (ch: ChallengeDefinition) => {
    if (!projectId) return;
    try {
      if (ch.enabled) {
        await fetch(`/api/projects/${projectId}/challenges/${ch.id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
      } else {
        await fetch(`/api/projects/${projectId}/challenges/${ch.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ enabled: true }),
        });
      }
      refresh();
      refreshSummary();
    } catch {
      // Ignore
    }
  };

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lookupInput.trim()) {
      setTargetUserId(lookupInput.trim());
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-100 flex items-center gap-2">
            Challenges & Quests
            <Badge variant="orange">Milestone 12</Badge>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Event-driven counter challenges with transactional database-enforced idempotency and
            rewards.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="bg-zinc-900 border border-zinc-800 p-1 rounded-none flex gap-1">
            <button
              onClick={() => setActiveTab('management')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition ${
                activeTab === 'management'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Challenge Management
            </button>
            <button
              onClick={() => setActiveTab('user_lookup')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-none transition ${
                activeTab === 'user_lookup'
                  ? 'bg-orange-500 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              User Progress Lookup
            </button>
          </div>

          {activeTab === 'management' && (
            <Button
              size="sm"
              disabled={!isAdminOrOwner}
              title={!isAdminOrOwner ? 'Requires Admin or Owner role to create challenges' : undefined}
              onClick={() => isAdminOrOwner && openCreateModal()}
              className={!isAdminOrOwner ? 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500 border-zinc-700' : undefined}
            >
              <Plus className="w-4 h-4" />
              Create Challenge
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Overview Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-zinc-900/80 border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Total Challenges</span>
            <Target className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {summaryLoading ? '-' : summary?.totalChallenges || 0}
          </div>
        </Card>

        <Card className="bg-zinc-900/80 border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Active Challenges</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {summaryLoading ? '-' : summary?.activeChallenges || 0}
          </div>
        </Card>

        <Card className="bg-zinc-900/80 border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Completed Instances</span>
            <CheckCircle2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {summaryLoading ? '-' : summary?.totalCompletedInstances || 0}
          </div>
        </Card>

        <Card className="bg-zinc-900/80 border-zinc-800 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-zinc-400">
            <span>Completion Rate</span>
            <Sparkles className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-zinc-100">
            {summaryLoading ? '-' : `${summary?.completionRate || 0}%`}
          </div>
        </Card>
      </div>

      {/* Main Tab Views */}
      {activeTab === 'management' ? (
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-orange-400" />
              Project Challenges
            </CardTitle>
            <CardDescription>
              Manage event-driven counter challenges and reward rules for your project.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-0">
            {loading ? (
              <TableSkeleton rows={5} />
            ) : challenges.length === 0 ? (
              <div className="text-center py-12 px-4 space-y-3">
                <div className="w-12 h-12 rounded-none bg-zinc-800/80 flex items-center justify-center mx-auto text-zinc-400">
                  <Target className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-200">No Challenges Defined</h3>
                <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                  Create your first counter challenge (e.g. &quot;Play 10 Games&quot;) to reward
                  your users automatically.
                </p>
                <Button size="sm" onClick={openCreateModal}>
                  <Plus className="w-4 h-4" /> Create Challenge
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Challenge Key / Name</TableHead>
                    <TableHead>Trigger Event</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Configured Rewards</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {challenges.map((ch) => {
                    const now = new Date();
                    const isExpired = ch.endAt && now >= new Date(ch.endAt);
                    const isFuture = ch.startAt && now < new Date(ch.startAt);

                    let statusVariant: 'emerald' | 'amber' | 'zinc' | 'rose' = 'emerald';
                    let statusLabel = 'Active';

                    if (!ch.enabled) {
                      statusVariant = 'zinc';
                      statusLabel = 'Disabled';
                    } else if (isExpired) {
                      statusVariant = 'rose';
                      statusLabel = 'Expired';
                    } else if (isFuture) {
                      statusVariant = 'amber';
                      statusLabel = 'Scheduled';
                    }

                    return (
                      <TableRow key={ch.id}>
                        <TableCell>
                          <div>
                            <div className="font-semibold text-xs text-zinc-100">{ch.name}</div>
                            <div className="text-[11px] text-zinc-500 font-mono">{ch.key}</div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-orange-400">
                          {ch.trigger}
                        </TableCell>
                        <TableCell className="font-bold text-xs text-zinc-200">
                          {ch.target}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {(ch.rewards || []).map((r, i) => (
                              <Badge
                                key={i}
                                variant={r.type === 'xp' ? 'orange' : 'amber'}
                                className="text-[10px]"
                              >
                                {r.type === 'xp' ? (
                                  <span className="flex items-center gap-1">
                                    <Coins className="w-3 h-3" /> +{r.amount} XP
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <Award className="w-3 h-3" /> {r.achievementKey}
                                  </span>
                                )}
                              </Badge>
                            ))}
                            {(ch.rewards || []).length === 0 && (
                              <span className="text-zinc-600 text-xs">No rewards</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusVariant} className="text-[10px]">
                            {statusLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right space-x-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!isAdminOrOwner}
                            onClick={() => isAdminOrOwner && openEditModal(ch)}
                            title={!isAdminOrOwner ? 'Requires Admin or Owner role to edit challenge' : 'Edit Challenge'}
                            className={!isAdminOrOwner ? 'opacity-30 cursor-not-allowed text-zinc-600' : undefined}
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={!isAdminOrOwner}
                            onClick={() => isAdminOrOwner && toggleDisable(ch)}
                            title={!isAdminOrOwner ? 'Requires Admin or Owner role to toggle challenge' : (ch.enabled ? 'Disable' : 'Enable')}
                            className={
                              !isAdminOrOwner
                                ? 'opacity-30 cursor-not-allowed text-zinc-600'
                                : ch.enabled
                                ? 'text-rose-400 hover:text-rose-300'
                                : 'text-emerald-400 hover:text-emerald-300'
                            }
                          >
                            <Power className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        /* User Progress Lookup Tab */
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-orange-400" />
              End-User Challenge Progress
            </CardTitle>
            <CardDescription>
              Lookup real-time counter challenge progress and completion state for an end-user.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <form onSubmit={handleLookupSubmit} className="flex gap-3 max-w-md">
              <Input
                placeholder="Enter End-User ID or External ID..."
                value={lookupInput}
                onChange={(e) => setLookupInput(e.target.value)}
                required
              />
              <Button type="submit" isLoading={lookupLoading}>
                <Search className="w-4 h-4" /> Lookup
              </Button>
            </form>

            {lookupError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{lookupError}</span>
              </div>
            )}

            {userChallenges && (
              <div className="space-y-4 pt-2">
                <div className="p-4 bg-zinc-950 rounded-none border border-zinc-800 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-zinc-100">
                      {userChallenges.name || 'Anonymous End-User'}
                    </div>
                    <div className="text-xs text-zinc-500 font-mono">
                      {userChallenges.externalId} ({userChallenges.userId})
                    </div>
                  </div>
                  <Badge variant="orange">{userChallenges.challenges.length} Challenges</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {userChallenges.challenges.map((item) => (
                    <motion.div
                      key={item.challengeId}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <Card className="bg-zinc-950 border-zinc-800 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-semibold text-xs text-zinc-100">{item.name}</div>
                            <div className="text-[11px] text-zinc-500 font-mono">{item.key}</div>
                          </div>
                          {item.completed ? (
                            <Badge
                              variant="emerald"
                              className="text-[10px] flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" /> Completed
                            </Badge>
                          ) : (
                            <Badge variant="orange" className="text-[10px]">
                              In Progress
                            </Badge>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs font-semibold">
                            <span className="text-zinc-400">Progress</span>
                            <span className="text-orange-400">
                              {item.progress} / {item.target} ({item.percent}%)
                            </span>
                          </div>
                          <Progress value={item.percent} />
                        </div>

                        {item.completedAt && (
                          <div className="text-[10px] text-zinc-500 flex items-center gap-1 pt-1 border-t border-zinc-800/80">
                            <Calendar className="w-3 h-3 text-zinc-600" /> Completed on{' '}
                            {new Date(item.completedAt).toLocaleString()}
                          </div>
                        )}
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Create / Edit Challenge Dialog */}
      <Dialog
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingChallenge ? 'Edit Challenge' : 'Create Counter Challenge'}
        description="Configure a new event-driven counter challenge for your project."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none font-medium">
              {formError}
            </div>
          )}

          {!editingChallenge && (
            <Input
              label="Challenge Key"
              placeholder="e.g. play_10_games"
              value={formData.key}
              onChange={(e) => setFormData({ ...formData, key: e.target.value })}
              required
            />
          )}

          <Input
            label="Name"
            placeholder="e.g. Play 10 Games"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required
          />

          <Input
            label="Description (Optional)"
            placeholder="e.g. Complete 10 matches to earn bonus XP"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Trigger Event Name"
              placeholder="e.g. game.completed"
              value={formData.trigger}
              onChange={(e) => setFormData({ ...formData, trigger: e.target.value })}
              required
            />

            <Input
              label="Target Counter Threshold"
              type="number"
              min="1"
              value={formData.target}
              onChange={(e) => setFormData({ ...formData, target: Number(e.target.value) })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Start At (Optional)"
              type="datetime-local"
              value={formData.startAt}
              onChange={(e) => setFormData({ ...formData, startAt: e.target.value })}
            />

            <Input
              label="End At (Optional)"
              type="datetime-local"
              value={formData.endAt}
              onChange={(e) => setFormData({ ...formData, endAt: e.target.value })}
            />
          </div>

          <div className="pt-2 border-t border-zinc-800 space-y-3">
            <label className="text-xs font-semibold text-zinc-300">Completion Rewards</label>
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="Bonus XP Amount"
                type="number"
                min="0"
                placeholder="e.g. 500"
                value={formData.xpRewardAmount}
                onChange={(e) =>
                  setFormData({ ...formData, xpRewardAmount: Number(e.target.value) })
                }
              />

              <Input
                label="Achievement Key (Optional)"
                placeholder="e.g. challenge_master"
                value={formData.achievementKey}
                onChange={(e) => setFormData({ ...formData, achievementKey: e.target.value })}
              />
            </div>
          </div>

          <Button type="submit" isLoading={formLoading} className="w-full">
            {editingChallenge ? 'Update Challenge' : 'Create Challenge'}
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
