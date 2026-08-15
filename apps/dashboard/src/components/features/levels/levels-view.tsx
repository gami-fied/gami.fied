'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useLevels, LevelRecord } from '@/hooks/use-levels';
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
import { Dialog } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { TrendingUp, Plus, Award, Layers, Search, ArrowRight, ShieldCheck } from 'lucide-react';

export function LevelsView() {
  const { selectedProject } = useDashboard();
  const {
    levels,
    summary,
    userProgress,
    fetchLevelsData,
    fetchUserProgress,
    createLevel,
    updateLevel,
    enableLevel,
    disableLevel,
  } = useLevels(selectedProject?.id || null);

  const toast = useToast();

  const [lookupUserId, setLookupUserId] = useState('');

  // Form state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [levelNum, setLevelNum] = useState<number>(1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requiredXp, setRequiredXp] = useState<number>(1000);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Edit Form state
  const [editingLevel, setEditingLevel] = useState<LevelRecord | null>(null);
  const [editLevelNum, setEditLevelNum] = useState<number>(1);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRequiredXp, setEditRequiredXp] = useState<number>(0);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  useEffect(() => {
    if (selectedProject) {
      fetchLevelsData();
    }
  }, [selectedProject, fetchLevelsData]);

  useEffect(() => {
    if (levels.length > 0) {
      const maxLvl = Math.max(...levels.map((l) => l.level));
      setLevelNum(maxLvl + 1);
    }
  }, [levels]);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setFormError(null);

    try {
      await createLevel({
        level: levelNum,
        name,
        description: description || undefined,
        requiredXp,
        enabled: true,
      });

      setIsCreateOpen(false);
      setName('');
      setDescription('');
      toast.success('Level threshold created successfully');
    } catch (err: unknown) {
      const errorMsg = (err as Error).message;
      setFormError(errorMsg);
      toast.error('Failed to create level threshold', errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (lvl: LevelRecord) => {
    setEditingLevel(lvl);
    setEditLevelNum(lvl.level);
    setEditName(lvl.name);
    setEditDescription(lvl.description || '');
    setEditRequiredXp(lvl.requiredXp);
    setEditFormError(null);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLevel) return;
    setEditSubmitting(true);
    setEditFormError(null);

    try {
      await updateLevel(editingLevel.id, {
        level: editLevelNum,
        name: editName,
        description: editDescription || undefined,
        requiredXp: editRequiredXp,
      });

      setEditingLevel(null);
      toast.success('Level updated successfully');
    } catch (err: unknown) {
      const errorMsg = (err as Error).message;
      setEditFormError(errorMsg);
      toast.error('Failed to update level', errorMsg);
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleDisable = async (lvl: LevelRecord) => {
    try {
      await disableLevel(lvl.id);
      toast.info(`Level ${lvl.level} (${lvl.name}) disabled`);
    } catch (err: unknown) {
      toast.error('Failed to disable level', (err as Error).message);
    }
  };

  const handleEnable = async (lvl: LevelRecord) => {
    try {
      await enableLevel(lvl.id);
      toast.success(`Level ${lvl.level} (${lvl.name}) re-enabled`);
    } catch (err: unknown) {
      toast.error('Failed to enable level', (err as Error).message);
    }
  };

  const handleUserSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!lookupUserId.trim()) return;
    fetchUserProgress(lookupUserId.trim());
  };

  if (!selectedProject) {
    return (
      <div className="p-8 text-center text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-none">
        Please select a project to view level configurations.
      </div>
    );
  }

  // Sorted levels for roadmap
  const sortedLevels = [...levels].sort((a, b) => a.level - b.level);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-zinc-100 tracking-tight">Levels & Progression</h1>
          <p className="text-xs text-zinc-400 mt-1">
            Deterministic level thresholds and end-user progression status for{' '}
            <span className="text-orange-400 font-semibold">{selectedProject.name}</span>
          </p>
        </div>

        <Button variant="primary" size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus className="w-4 h-4" />
          Add Level Threshold
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-b from-zinc-900 to-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Levels Defined
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-amber-400">
              L1 → L{summary?.maxConfiguredLevel || 0}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">
              {summary?.configuredLevelCount || 0} total active levels
            </p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-zinc-900 to-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Users at Max Level
            </CardTitle>
            <Award className="w-4 h-4 text-emerald-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-emerald-400">
              {summary?.usersAtMaxLevel || 0}
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Highest level achieved</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-b from-zinc-900 to-zinc-900/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Total Project XP
            </CardTitle>
            <Layers className="w-4 h-4 text-orange-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black text-orange-400">
              {summary?.totalProjectXp?.toLocaleString() || 0} XP
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">Across all project users</p>
          </CardContent>
        </Card>
      </div>

      {/* Progression Roadmap Stepper */}
      {sortedLevels.length > 0 && (
        <Card className="bg-zinc-900/80 border-zinc-800">
          <CardHeader>
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-orange-400" />
              Level Progression Roadmap & Difficulty Curve
            </CardTitle>
            <CardDescription>
              Sequential XP milestones required to advance between level tiers.
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto pb-4">
            <div className="flex items-center gap-3 min-w-[650px] pt-1">
              {sortedLevels.map((lvl, index) => {
                const prevLevel = index > 0 ? sortedLevels[index - 1] : undefined;
                const prevXp = prevLevel ? prevLevel.requiredXp : 0;
                const deltaXp = lvl.requiredXp - prevXp;

                return (
                  <React.Fragment key={lvl.id}>
                    {index > 0 && (
                      <div className="flex flex-col items-center shrink-0">
                        <ArrowRight className="w-4 h-4 text-zinc-600" />
                        <span className="text-[10px] text-orange-400 font-mono font-bold mt-0.5">
                          +{deltaXp.toLocaleString()} XP
                        </span>
                      </div>
                    )}
                    <div
                      className={`p-3 rounded-none border flex-1 min-w-[140px] text-center space-y-1 ${
                        lvl.enabled
                          ? 'bg-zinc-950/80 border-zinc-800'
                          : 'bg-zinc-950/40 border-zinc-800/40 opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <Badge variant="amber" className="text-[10px]">
                          L{lvl.level}
                        </Badge>
                        <Badge variant={lvl.enabled ? 'emerald' : 'rose'} className="text-[9px]">
                          {lvl.enabled ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                      <div className="text-xs font-bold text-zinc-100 truncate">{lvl.name}</div>
                      <div className="text-[11px] font-mono text-orange-400 font-black">
                        {lvl.requiredXp.toLocaleString()} XP
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* User Progress Lookup Tool */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">End-User Gamification Progress Lookup</CardTitle>
          <CardDescription>
            Search end-user ID to dynamically calculate level progress
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
              Calculate Progress
            </Button>
          </form>

          {userProgress && (
            <div className="bg-zinc-950 p-5 rounded-none border border-zinc-800 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs font-bold text-amber-400 tracking-wider uppercase">
                    Level {userProgress.level.number} — {userProgress.level.name}
                  </span>
                  <p className="text-2xl font-black text-zinc-100 mt-1">
                    {userProgress.totalXp.toLocaleString()} XP Total
                  </p>
                </div>
                <div>
                  {userProgress.isMaxLevel ? (
                    <Badge variant="emerald">MAX LEVEL REACHED</Badge>
                  ) : (
                    <span className="text-xs text-zinc-400 font-medium">
                      Next: Level {userProgress.nextLevel?.number} ({userProgress.nextLevel?.name})
                      @ {userProgress.nextLevel?.requiredXp.toLocaleString()} XP
                    </span>
                  )}
                </div>
              </div>

              <Progress
                value={userProgress.progressPercent}
                label="Progress to Next Level"
                sublabel={
                  userProgress.isMaxLevel
                    ? 'Maximum level reached'
                    : `+${userProgress.xpIntoLevel} XP into level • ${userProgress.xpToNextLevel} XP needed for next level`
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Level Configuration Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold">Project Level Configurations</CardTitle>
          <CardDescription>Deterministic sequential levels and XP thresholds</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level #</TableHead>
                <TableHead>Level Name</TableHead>
                <TableHead>Required Total XP</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {levels.map((lvl) => (
                <TableRow key={lvl.id}>
                  <TableCell className="font-bold text-amber-400">L{lvl.level}</TableCell>
                  <TableCell className="font-semibold text-zinc-200">{lvl.name}</TableCell>
                  <TableCell className="font-mono text-orange-400 font-bold">
                    {lvl.requiredXp.toLocaleString()} XP
                  </TableCell>
                  <TableCell className="text-xs text-zinc-400">{lvl.description || '—'}</TableCell>
                  <TableCell>
                    <Badge variant={lvl.enabled ? 'emerald' : 'rose'}>
                      {lvl.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-3">
                    <button
                      onClick={() => handleOpenEdit(lvl)}
                      className="text-xs text-zinc-300 hover:text-white hover:underline font-semibold"
                    >
                      Edit
                    </button>
                    {lvl.enabled ? (
                      <button
                        onClick={() => handleDisable(lvl)}
                        className="text-xs text-rose-400 hover:underline font-semibold"
                      >
                        Disable
                      </button>
                    ) : (
                      <button
                        onClick={() => handleEnable(lvl)}
                        className="text-xs text-emerald-400 hover:underline font-semibold"
                      >
                        Enable
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {levels.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-zinc-500 text-xs">
                    No levels configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Level Distribution Summary */}
      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold">Level Population Breakdown</CardTitle>
            <CardDescription>Distribution of active end-users across level tiers</CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const maxCount = Math.max(...summary.distribution.map((d) => d.userCount), 1);
              return (
                <div className="space-y-3">
                  {summary.distribution.map((d) => {
                    const pct = Math.round((d.userCount / maxCount) * 100);
                    return (
                      <div key={d.level} className="flex items-center gap-4">
                        <div className="w-20 shrink-0 text-right">
                          <span className="text-xs font-bold text-amber-400">L{d.level}</span>
                          <span className="text-[11px] text-zinc-500 block truncate">{d.name}</span>
                        </div>
                        <div className="flex-1 bg-zinc-950 rounded-none h-2.5 overflow-hidden border border-zinc-800 p-0.5">
                          <div
                            className="bg-orange-500 h-full rounded-none transition-all duration-500 ease-out"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <div className="w-16 text-right shrink-0">
                          <span className="text-sm font-bold text-orange-400">{d.userCount}</span>
                          <span className="text-[10px] text-zinc-500 block">users</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Add Level Dialog */}
      <Dialog
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add Level Threshold"
        description="Append a new level to the sequential progression ladder."
      >
        <form onSubmit={handleCreateSubmit} className="space-y-4">
          {formError && <div className="text-xs text-rose-400 font-medium">{formError}</div>}

          <Input
            label="Level Number"
            type="number"
            value={levelNum}
            onChange={(e) => setLevelNum(parseInt(e.target.value) || 1)}
            required
          />

          <Input
            label="Level Name"
            placeholder="e.g. Master"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Required Total XP Threshold"
            type="number"
            placeholder="e.g. 5000"
            value={requiredXp}
            onChange={(e) => setRequiredXp(parseInt(e.target.value) || 0)}
            required
          />

          <Input
            label="Description (Optional)"
            placeholder="e.g. Achieved 5,000 XP"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={submitting} variant="primary">
              Save Level
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Edit Level Dialog */}
      <Dialog
        isOpen={!!editingLevel}
        onClose={() => setEditingLevel(null)}
        title={`Edit Level ${editingLevel?.level}`}
        description="Update level threshold parameters and display details."
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {editFormError && <div className="text-xs text-rose-400 font-medium">{editFormError}</div>}

          <Input
            label="Level Number"
            type="number"
            value={editLevelNum}
            onChange={(e) => setEditLevelNum(parseInt(e.target.value) || 1)}
            required
          />

          <Input
            label="Level Name"
            placeholder="e.g. Master"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            required
          />

          <Input
            label="Required Total XP Threshold"
            type="number"
            placeholder="e.g. 5000"
            value={editRequiredXp}
            onChange={(e) => setEditRequiredXp(parseInt(e.target.value) || 0)}
            required
          />

          <Input
            label="Description (Optional)"
            placeholder="e.g. Achieved 5,000 XP"
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
          />

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditingLevel(null)}>
              Cancel
            </Button>
            <Button type="submit" isLoading={editSubmitting} variant="primary">
              Save Changes
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
