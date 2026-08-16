'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useDashboard } from '../context/dashboard-context';
import { useXp } from '@/hooks/use-xp';
import { useAchievements } from '@/hooks/use-achievements';
import { useLevels } from '@/hooks/use-levels';
import { useRules } from '@/hooks/use-rules';
import { useApiKeys } from '@/hooks/use-api-keys';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle2, Circle, Code2, FolderKanban } from 'lucide-react';
import Link from 'next/link';

interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  href: string;
}

interface OnboardingData {
  totalSteps: number;
  completedCount: number;
  progressPercentage: number;
  steps: OnboardingStep[];
}

export function OverviewView() {
  const { selectedProject, selectedOrg } = useDashboard();
  const { summary: xpSummary, fetchXpSummary } = useXp(selectedProject?.id || null);
  const { summary: achSummary, fetchAchievements } = useAchievements(selectedProject?.id || null);
  const { summary: progSummary, fetchLevelsData } = useLevels(selectedProject?.id || null);
  const { rules, fetchRules } = useRules(selectedProject?.id || null);

  const [onboardingData, setOnboardingData] = useState<OnboardingData | null>(null);

  const fetchOnboarding = useCallback(async () => {
    if (!selectedProject) return;
    try {
      const res = await fetch(`/api/projects/${selectedProject.id}/onboarding`);
      if (res.ok) {
        setOnboardingData(await res.json());
      }
    } catch {
      // Ignore fallback
    }
  }, [selectedProject]);

  useEffect(() => {
    if (selectedProject) {
      fetchXpSummary();
      fetchAchievements();
      fetchLevelsData();
      fetchRules();
      fetchOnboarding();
    }
  }, [
    selectedProject,
    fetchXpSummary,
    fetchAchievements,
    fetchLevelsData,
    fetchRules,
    fetchOnboarding,
  ]);

  if (!selectedProject) {
    return (
      <div className="p-8 text-center bg-zinc-950 border border-zinc-800 space-y-4 max-w-lg mx-auto my-12 font-mono">
        <div className="w-12 h-12 bg-amber-950/40 border border-amber-800/80 text-amber-400 flex items-center justify-center mx-auto">
          <FolderKanban className="w-6 h-6" />
        </div>
        <div>
          <h3 className="text-base font-bold text-zinc-100 uppercase tracking-wide">No Projects Assigned</h3>
          <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
            You have not been assigned to any project in <span className="text-orange-400 font-bold">{selectedOrg?.name || 'this organization'}</span> yet.
            Please contact your organization Admin or Owner to request access to specific projects.
          </p>
        </div>
      </div>
    );
  }

  const activeRulesCount = rules.filter((r) => r.enabled).length;

  const isComplete = onboardingData ? onboardingData.completedCount === onboardingData.totalSteps : false;

  return (
    <div className="space-y-8 font-mono">
      {/* Page Heading */}
      <div>
        <h1 className="text-xl font-bold text-zinc-100 tracking-tight uppercase">Project Overview</h1>
        <p className="text-xs text-zinc-400 mt-1">
          Gamification metrics and progression distribution for{' '}
          <span className="text-orange-400 font-semibold">{selectedProject.name}</span>
        </p>
      </div>

      {/* Analytics Grid — Game HUD Style */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* XP Card */}
        <div className="relative overflow-hidden rounded-none border border-zinc-800/80 bg-zinc-900/60 p-5 group hover:border-orange-500/30 transition-all duration-300">
          <div className="animate-shimmer absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-orange-500 rounded-none" />
          <div className="flex items-start justify-between">
            <div className="text-3xl leading-none select-none">⚡</div>
            <span className="text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-none uppercase tracking-wider font-mono">
              XP
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white tracking-tight animate-count">
              {xpSummary?.totalXpAwarded?.toLocaleString() || '0'}
            </div>
            <div className="text-xs text-orange-400 font-semibold mt-0.5">total XP awarded</div>
            <div className="text-[11px] text-zinc-500 mt-2">
              {xpSummary?.totalUsersWithXp || 0} players active
            </div>
          </div>
        </div>

        {/* Achievements Card */}
        <div className="relative overflow-hidden rounded-none border border-zinc-800/80 bg-zinc-900/60 p-5 group hover:border-purple-500/30 transition-all duration-300">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-purple-500 rounded-none" />
          <div className="flex items-start justify-between">
            <div className="text-3xl leading-none select-none">🏆</div>
            <span className="text-[10px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-none uppercase tracking-wider font-mono">
              Badges
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white tracking-tight">
              {achSummary?.enabledAchievements || 0}
              <span className="text-xl font-medium text-zinc-500">
                {' '}
                / {achSummary?.totalAchievements || 0}
              </span>
            </div>
            <div className="text-xs text-purple-400 font-semibold mt-0.5">active achievements</div>
            <div className="text-[11px] text-zinc-500 mt-2">
              {achSummary?.totalAwards || 0} badges awarded total
            </div>
          </div>
        </div>

        {/* Levels Card */}
        <div className="relative overflow-hidden rounded-none border border-zinc-800/80 bg-zinc-900/60 p-5 group hover:border-amber-500/30 transition-all duration-300">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-amber-500 rounded-none" />
          <div className="flex items-start justify-between">
            <div className="text-3xl leading-none select-none">🎯</div>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-none uppercase tracking-wider font-mono">
              Levels
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white tracking-tight">
              L1 <span className="text-amber-400">→</span> L{progSummary?.maxConfiguredLevel || 0}
            </div>
            <div className="text-xs text-amber-400 font-semibold mt-0.5">progression ladder</div>
            <div className="text-[11px] text-zinc-500 mt-2">
              {progSummary?.configuredLevelCount || 0} levels configured
            </div>
          </div>
        </div>

        {/* Rules Card */}
        <div className="relative overflow-hidden rounded-none border border-zinc-800/80 bg-zinc-900/60 p-5 group hover:border-emerald-500/30 transition-all duration-300">
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-emerald-500 rounded-none" />
          <div className="flex items-start justify-between">
            <div className="text-3xl leading-none select-none">⚙️</div>
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-none uppercase tracking-wider font-mono">
              Rules
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white tracking-tight">
              {activeRulesCount}
              <span className="text-xl font-medium text-zinc-500"> / {rules.length}</span>
            </div>
            <div className="text-xs text-emerald-400 font-semibold mt-0.5">active rules</div>
            <div className="text-[11px] text-zinc-500 mt-2">processing your event stream</div>
          </div>
        </div>
      </div>

      {/* Backend-Driven Setup Checklist */}
      {onboardingData && !isComplete && (
        <Card className="border-orange-800/50 bg-gradient-to-b from-orange-950/20 to-zinc-900/80">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-bold text-zinc-100 flex items-center gap-2 uppercase tracking-wider">
                  Backend-Driven Setup Checklist
                  <Badge variant="orange">
                    {onboardingData.completedCount}/{onboardingData.totalSteps}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  Real-time database detection for Gami setup lifecycle steps
                </CardDescription>
              </div>
              <div className="text-xs font-semibold text-orange-400 font-mono">
                {onboardingData.progressPercentage}% complete
              </div>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-zinc-800 rounded-none h-2.5 mt-2 overflow-hidden border border-zinc-800 p-0.5">
              <div
                className="bg-orange-500 h-full rounded-none transition-all duration-500"
                style={{ width: `${onboardingData.progressPercentage}%` }}
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {onboardingData.steps.map((step) => (
                <Link
                  key={step.id}
                  href={step.href}
                  className={`flex items-center gap-3 p-3 rounded-none border transition group ${
                    step.completed
                      ? 'bg-emerald-950/20 border-emerald-800/40 cursor-default'
                      : 'bg-zinc-950/40 border-zinc-800 hover:border-orange-500/50 hover:bg-zinc-900'
                  }`}
                  onClick={step.completed ? (e) => e.preventDefault() : undefined}
                >
                  {step.completed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-zinc-600 shrink-0 group-hover:text-orange-400 transition" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-xs font-semibold ${step.completed ? 'text-emerald-400 line-through' : 'text-zinc-200 group-hover:text-orange-300 transition'}`}
                    >
                      {step.label}
                    </p>
                    <p className="text-[11px] text-zinc-500 truncate">{step.description}</p>
                  </div>
                  {!step.completed && (
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-orange-400 transition shrink-0" />
                  )}
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Actions Shortcuts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-bold text-zinc-100 uppercase tracking-wider">Quick Actions</CardTitle>
          <CardDescription>Direct navigation shortcuts to key project systems</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/dashboard/events"
            className="p-4 rounded-none bg-zinc-950/60 border border-zinc-800 hover:border-orange-500/50 transition group flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold text-zinc-200 group-hover:text-orange-400 transition">
                Inspect Events Log
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Filter incoming customer events</p>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-orange-400 transition" />
          </Link>

          <Link
            href="/dashboard/rules"
            className="p-4 rounded-none bg-zinc-950/60 border border-zinc-800 hover:border-emerald-500/50 transition group flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold text-zinc-200 group-hover:text-emerald-400 transition">
                Manage Rules Engine
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Configure event triggers &amp; actions</p>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-emerald-400 transition" />
          </Link>

          <Link
            href="/dashboard/api-keys"
            className="p-4 rounded-none bg-zinc-950/60 border border-zinc-800 hover:border-purple-500/50 transition group flex items-center justify-between"
          >
            <div>
              <p className="text-xs font-bold text-zinc-200 group-hover:text-purple-400 transition">
                Generate API Keys
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Authenticate event ingestion</p>
            </div>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-purple-400 transition" />
          </Link>
        </CardContent>
      </Card>

      {/* SDK & Developer Quickstart Card */}
      <Card className="border-orange-500/20 bg-zinc-900/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Code2 className="w-5 h-5 text-orange-400" />
              <CardTitle className="text-sm font-bold text-zinc-100 uppercase tracking-wider font-mono">
                TypeScript / JS SDK Integration (@gami/sdk)
              </CardTitle>
            </div>
            <Badge variant="orange">v0.1.0 Ready</Badge>
          </div>
          <CardDescription>
            Integrate gamification events, XP, achievements, levels &amp; leaderboards directly in your
            server-side Node.js / TypeScript apps.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Step 1: Install */}
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-none space-y-1.5">
              <span className="text-[11px] font-mono font-bold text-orange-400">
                1. Install Package
              </span>
              <pre className="p-2 bg-zinc-900 text-xs font-mono text-zinc-200 border border-zinc-800 overflow-x-auto rounded-none">
                pnpm add @gami/sdk
              </pre>
            </div>

            {/* Step 2: Initialize */}
            <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-none space-y-1.5">
              <span className="text-[11px] font-mono font-bold text-orange-400">
                2. Initialize Client
              </span>
              <pre className="p-2 bg-zinc-900 text-xs font-mono text-zinc-200 border border-zinc-800 overflow-x-auto rounded-none">
                {`import { Gami } from '@gami/sdk';\nconst gami = new Gami({ apiKey: process.env.GAMI_API_KEY! });`}
              </pre>
            </div>
          </div>

          {/* Step 3: Track Event */}
          <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-none space-y-1.5">
            <span className="text-[11px] font-mono font-bold text-orange-400">3. Track Event</span>
            <pre className="p-2.5 bg-zinc-900 text-xs font-mono text-emerald-400 border border-zinc-800 overflow-x-auto rounded-none">
              {`await gami.events.track({\n  projectId: '${selectedProject.id}',\n  userId: 'usr_player_101',\n  type: 'order_completed',\n  properties: { amount: 149.99 }\n});`}
            </pre>
          </div>
        </CardContent>
      </Card>

      {/* Level Distribution Summary */}
      {progSummary && progSummary.distribution.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-bold text-zinc-100 uppercase tracking-wider">
              End-User Level Distribution
            </CardTitle>
            <CardDescription>
              Count of distinct end-users dynamically grouped by calculated progression levels
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(() => {
              const maxCount = Math.max(...progSummary.distribution.map((d) => d.userCount), 1);
              return (
                <div className="space-y-3">
                  {progSummary.distribution.map((d) => {
                    const pct = Math.round((d.userCount / maxCount) * 100);
                    return (
                      <div key={d.level} className="flex items-center gap-4">
                        <div className="w-20 shrink-0 text-right">
                          <span className="text-xs font-bold text-amber-400">L{d.level}</span>
                          <span className="text-[11px] text-zinc-500 block truncate">{d.name}</span>
                        </div>
                        <div className="flex-1 bg-zinc-950/80 rounded-none h-2.5 overflow-hidden border border-zinc-800 p-0.5">
                          <div
                            className="bg-orange-500 h-full rounded-none transition-all duration-700 ease-out"
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
    </div>
  );
}
