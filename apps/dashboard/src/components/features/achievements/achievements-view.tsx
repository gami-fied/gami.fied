'use client';

import React, { useEffect, useState } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useAchievements, AchievementRecord } from '@/hooks/use-achievements';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { Trophy, Plus, Search, Award } from 'lucide-react';

export function AchievementsView() {
  const { selectedProject, selectedOrg } = useDashboard();
  const isAdminOrOwner = ['owner', 'admin'].includes(selectedOrg?.role || 'member');
  const toast = useToast();
  const {
    achievements,
    summary,
    userAwards,
    loading,
    error,
    fetchAchievements,
    createAchievement,
    updateAchievement,
    disableAchievement,
    fetchUserAchievements,
  } = useAchievements(selectedProject?.id || null);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [iconUrl, setIconUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // User Lookup
  const [lookupUserId, setLookupUserId] = useState('');
  const [searchedUser, setSearchedUser] = useState('');

  useEffect(() => {
    if (selectedProject) {
      fetchAchievements();
    }
  }, [selectedProject, fetchAchievements]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      await createAchievement({
        key,
        name,
        description: description || undefined,
        iconUrl: iconUrl || undefined,
        enabled: true,
      });

      setIsCreateOpen(false);
      setKey('');
      setName('');
      setDescription('');
      setIconUrl('');
    } catch (err: unknown) {
      setFormError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleDisable = async (ach: AchievementRecord) => {
    try {
      if (ach.enabled) {
        await disableAchievement(ach.id);
        toast.info(`Achievement "${ach.name}" disabled`);
      } else {
        await updateAchievement(ach.id, { enabled: true });
        toast.success(`Achievement "${ach.name}" re-enabled`);
      }
    } catch (err: unknown) {
      toast.error('Failed to update achievement status', (err as Error).message);
    }
  };

  const handleUserSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupUserId.trim()) return;
    setSearchedUser(lookupUserId.trim());
    fetchUserAchievements(lookupUserId.trim());
  };

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-none">
        Please select a project to view achievements.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Achievements & Badges</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Project-scoped achievement definitions and award tracking for{' '}
            <span className="text-orange-400 font-semibold">{selectedProject.name}</span>
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          disabled={!isAdminOrOwner}
          title={!isAdminOrOwner ? 'Requires Admin or Owner role to create achievements' : undefined}
          onClick={() => isAdminOrOwner && setIsCreateOpen(true)}
          className={!isAdminOrOwner ? 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500 border-zinc-700' : undefined}
        >
          <Plus className="w-4 h-4" />
          Create Achievement
        </Button>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-b from-zinc-900 to-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Active Achievements
            </CardTitle>
            <Trophy className="w-4 h-4 text-purple-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-purple-400">
              {summary?.enabledAchievements || 0} / {summary?.totalAchievements || 0}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Enabled definitions</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-zinc-900 to-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Total Badges Awarded
            </CardTitle>
            <Award className="w-4 h-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-orange-400">
              {summary?.totalAwards?.toLocaleString() || 0}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Granted to end-users</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-zinc-900 to-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Unique Achievers
            </CardTitle>
            <Trophy className="w-4 h-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-400">
              {summary?.uniqueUsersWithAchievements?.toLocaleString() || 0}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Distinct users holding badges</p>
          </CardContent>
        </Card>
      </div>

      {/* User Achievement Lookup Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">End-User Achievement Lookup</CardTitle>
          <CardDescription>
            Search end-user ID to inspect all badges awarded to them
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleUserSearch} className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Enter End-User ID (e.g. usr_123)"
                value={lookupUserId}
                onChange={(e) => setLookupUserId(e.target.value)}
              />
            </div>
            <Button type="submit" variant="primary">
              <Search className="w-4 h-4" />
              Lookup Badges
            </Button>
          </form>

          {searchedUser && (
            <div className="space-y-3 pt-2">
              <p className="text-xs font-semibold text-zinc-300">
                Badges Awarded to <span className="font-mono text-orange-400">{searchedUser}</span>{' '}
                ({userAwards.length}):
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {userAwards.map((a) => (
                  <div
                    key={a.id}
                    className="p-3 bg-zinc-950 rounded-none border border-zinc-800 flex items-center gap-3"
                  >
                    <div className="w-9 h-9 rounded-none bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-300 shrink-0 font-bold text-xs">
                      🏆
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-zinc-100 truncate">
                        {a.achievementName}
                      </p>
                      <p className="text-[10px] font-mono text-zinc-500 truncate">
                        {a.achievementKey}
                      </p>
                      <p className="text-[10px] text-zinc-600">
                        {new Date(a.awardedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                ))}

                {userAwards.length === 0 && (
                  <div className="col-span-full py-4 text-center text-zinc-500 text-xs">
                    No achievements awarded to this user yet.
                  </div>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Achievement Definitions Grid */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-zinc-200">Achievement Definitions</h2>

        {error && (
          <div className="p-4 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs rounded-none">
            {error}
          </div>
        )}

        {loading && achievements.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {achievements.map((a) => (
              <Card key={a.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-none bg-purple-950/80 border border-purple-800/60 flex items-center justify-center text-purple-300 font-bold text-sm shrink-0 overflow-hidden">
                        {a.iconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.iconUrl}
                            alt={a.name}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                              (e.target as HTMLImageElement).parentElement!.textContent = '🏆';
                            }}
                          />
                        ) : (
                          '🏆'
                        )}
                      </div>
                      <div>
                        <CardTitle className="text-sm font-bold">{a.name}</CardTitle>
                        <span className="font-mono text-[11px] text-zinc-500 block">{a.key}</span>
                      </div>
                    </div>
                    <Badge variant={a.enabled ? 'emerald' : 'rose'}>
                      {a.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3">
                  <p className="text-xs text-zinc-400 line-clamp-2">
                    {a.description || 'No description provided.'}
                  </p>
                </CardContent>

                <div className="p-4 border-t border-zinc-800/60 bg-zinc-950/40 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-zinc-500">{a.id}</span>
                  <button
                    disabled={!isAdminOrOwner}
                    title={!isAdminOrOwner ? 'Requires Admin or Owner role to toggle achievement' : undefined}
                    onClick={() => isAdminOrOwner && handleToggleDisable(a)}
                    className={`text-xs font-semibold px-2.5 py-1 rounded-none transition ${
                      a.enabled
                        ? 'bg-rose-950/40 text-rose-400 hover:bg-rose-900/60'
                        : 'bg-emerald-950/40 text-emerald-400 hover:bg-emerald-900/60'
                    } ${!isAdminOrOwner ? 'opacity-40 cursor-not-allowed' : ''}`}
                  >
                    {a.enabled ? 'Soft Disable' : 'Enable'}
                  </button>
                </div>
              </Card>
            ))}

            {achievements.length === 0 && (
              <div className="col-span-full p-12 text-center bg-zinc-900/40 rounded-none border border-zinc-800 space-y-3">
                <Trophy className="w-8 h-8 text-zinc-500 mx-auto" />
                <h3 className="text-base font-semibold text-zinc-200">
                  No Achievements Configured
                </h3>
                <p className="text-xs text-zinc-400 max-w-sm mx-auto">
                  Define achievements that can be granted to end-users automatically by the Rules
                  Engine.
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!isAdminOrOwner}
                  title={!isAdminOrOwner ? 'Requires Admin or Owner role to create achievements' : undefined}
                  onClick={() => isAdminOrOwner && setIsCreateOpen(true)}
                  className={!isAdminOrOwner ? 'opacity-50 cursor-not-allowed bg-zinc-800 text-zinc-500 border-zinc-700' : undefined}
                >
                  Create First Achievement
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Achievement Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Achievement Definition"
        description="Add a project-scoped badge definition."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && <div className="text-xs text-rose-400 font-medium">{formError}</div>}

          <Input
            label="Achievement Key (Alphanumeric, _ or -)"
            placeholder="e.g. first_purchase"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            required
          />

          <Input
            label="Achievement Name"
            placeholder="e.g. Early Adopter"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Textarea
            label="Description (Optional)"
            placeholder="Awarded for completing registration"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <Input
            label="Icon URL (Optional)"
            placeholder="https://example.com/badge.png"
            value={iconUrl}
            onChange={(e) => setIconUrl(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting}>
              Save Achievement
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
