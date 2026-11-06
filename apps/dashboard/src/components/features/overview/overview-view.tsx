'use client';

import { apiJson } from '@/lib/api-client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Circle,
  Coins,
  Users,
  X,
} from 'lucide-react';
import { QuickStart } from './quick-start';
import { useDashboard } from '../context/dashboard-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { CardSkeleton } from '@/components/ui/skeleton';
import { useCachedState } from '@/hooks/use-cached-state';
import { formatRelativeTime } from '@/hooks/use-relative-time';
import { usePermissions } from '@/hooks/use-permissions';

interface SetupStep {
  id: string;
  label: string;
  description: string;
  completed: boolean;
  href: string;
}

interface OverviewData {
  stats: {
    eventsToday: number;
    activeUsers: number;
    totalUsers: number;
    xpThisWeek: number;
    failuresToday: number;
    ruleCount: number;
  };
  recentEvents: {
    id: string;
    type: string;
    occurredAt: string;
    externalId: string | null;
    name: string | null;
  }[];
  topUsers: { id: string; externalId: string; name: string | null; totalXp: number }[];
  setup: {
    totalSteps: number;
    completedCount: number;
    progressPercentage: number;
    steps: SetupStep[];
  };
}

interface StatCardProps {
  label: string;
  value: number;
  detail: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'danger';
}

function StatCard({ label, value, detail, href, icon: Icon, tone }: StatCardProps) {
  return (
    <Link
      href={href}
      className="group border border-zinc-800/80 bg-zinc-900/60 p-4 hover:border-zinc-700 transition-colors"
    >
      <div className="flex items-center justify-between text-xs font-semibold text-zinc-400">
        {label}
        <Icon className={`w-4 h-4 ${tone === 'danger' ? 'text-danger-400' : 'text-zinc-400'}`} />
      </div>
      <div
        className={`mt-2 text-2xl font-bold tracking-tight ${
          tone === 'danger' ? 'text-danger-400' : 'text-zinc-100'
        }`}
      >
        {value.toLocaleString()}
      </div>
      <div className="mt-1 text-xs text-zinc-400">{detail}</div>
    </Link>
  );
}

function SetupCard({ projectId, setup }: { projectId: string; setup: OverviewData['setup'] }) {
  const dismissKey = `gami.setupDismissed.${projectId}`;
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(localStorage.getItem(dismissKey) === 'true');
  }, [dismissKey]);

  if (dismissed || setup.completedCount === setup.totalSteps) return null;

  const next = setup.steps.find((step) => !step.completed);

  return (
    <Card>
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex flex-1 min-w-0 items-center gap-3 text-left"
        >
          <ChevronDown
            className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
          />
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-zinc-100">
              Finish setting up: {setup.completedCount} of {setup.totalSteps} done
            </span>
            {next && (
              <span className="block text-xs text-zinc-400 truncate">Next: {next.label}</span>
            )}
          </span>
        </button>
        <div className="hidden sm:block w-32 h-1.5 bg-zinc-800 overflow-hidden">
          <div
            className="h-full w-full origin-left bg-brand-500 transition-transform duration-500 ease-out"
            style={{ transform: `scaleX(${setup.progressPercentage / 100})` }}
          />
        </div>
        <button
          onClick={() => {
            localStorage.setItem(dismissKey, 'true');
            setDismissed(true);
          }}
          aria-label="Hide setup steps"
          className="p-1 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 px-4 pb-4">
          {setup.steps.map((step) => (
            <Link
              key={step.id}
              href={step.href}
              className="group flex items-center gap-3 p-2 border border-zinc-800 hover:border-zinc-700 transition-colors"
            >
              {step.completed ? (
                <CheckCircle2 className="w-4 h-4 text-success-400 shrink-0" />
              ) : (
                <Circle className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-zinc-200">{step.label}</span>
                <span className="block text-xs text-zinc-400 truncate">{step.description}</span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

export function OverviewView() {
  const { selectedProject } = useDashboard();
  const { isAdminOrOwner } = usePermissions();
  const projectId = selectedProject?.id ?? null;
  const [data, setData] = useCachedState<OverviewData | null>(`overview:${projectId}`, null);
  const [failed, setFailed] = useState(false);
  const [quickStartDone, setQuickStartDone] = useState(false);

  const load = React.useCallback(async () => {
    if (!projectId) return;
    try {
      setData(await apiJson<OverviewData>(`/api/projects/${projectId}/overview`));
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [projectId, setData]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!selectedProject) return null;

  const showQuickStart = isAdminOrOwner && data?.stats.ruleCount === 0 && !quickStartDone;

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description={`What's happening in ${selectedProject.name}.`} />

      {failed && !data && (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load this project"
          description="The API didn't respond. Your data is safe, so try again in a moment."
          action={{ label: 'Try again', onClick: () => void load() }}
        />
      )}

      {!data && !failed && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {data && (
        <>
          {showQuickStart && (
            <QuickStart
              projectId={selectedProject.id}
              onDone={() => {
                setQuickStartDone(true);
                void load();
              }}
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Events today"
              value={data.stats.eventsToday}
              detail="In the last 24 hours"
              href="/dashboard/events"
              icon={Activity}
            />
            <StatCard
              label="Active users"
              value={data.stats.activeUsers}
              detail={`Last 7 days, of ${data.stats.totalUsers.toLocaleString()} total`}
              href="/dashboard/users"
              icon={Users}
            />
            <StatCard
              label="XP awarded"
              value={data.stats.xpThisWeek}
              detail="In the last 7 days"
              href="/dashboard/xp"
              icon={Coins}
            />
            <StatCard
              label="Problems"
              value={data.stats.failuresToday}
              detail={
                data.stats.failuresToday > 0 ? 'Failed in the last 24 hours' : 'All clear today'
              }
              href="/dashboard/events"
              icon={data.stats.failuresToday > 0 ? AlertTriangle : CheckCircle2}
              tone={data.stats.failuresToday > 0 ? 'danger' : undefined}
            />
          </div>

          {isAdminOrOwner && <SetupCard projectId={selectedProject.id} setup={data.setup} />}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Recent activity</CardTitle>
                  <Link
                    href="/dashboard/events"
                    className="flex items-center gap-1 text-xs text-brand-400 hover:underline"
                  >
                    All events <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {data.recentEvents.length === 0 ? (
                  <EmptyState
                    icon={Activity}
                    title="No events yet"
                    description="Events appear here as soon as your app sends them. You can try one from the Events page."
                    action={{ label: 'Send a test event', href: '/dashboard/events' }}
                  />
                ) : (
                  <ul className="divide-y divide-zinc-800/80">
                    {data.recentEvents.map((event) => (
                      <li key={event.id} className="flex items-center gap-3 py-2 text-xs">
                        <span className="font-mono text-zinc-200 truncate">{event.type}</span>
                        <span className="text-zinc-400 truncate">
                          {event.name || event.externalId}
                        </span>
                        <span className="ml-auto shrink-0 text-zinc-400">
                          {formatRelativeTime(event.occurredAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">Top users</CardTitle>
                  <Link
                    href="/dashboard/leaderboard"
                    className="flex items-center gap-1 text-xs text-brand-400 hover:underline"
                  >
                    Leaderboard <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {data.topUsers.length === 0 ? (
                  <CardDescription className="py-6 text-center">
                    Users appear here once they earn XP.
                  </CardDescription>
                ) : (
                  <ol className="divide-y divide-zinc-800/80">
                    {data.topUsers.map((user, index) => (
                      <li key={user.id} className="flex items-center gap-3 py-2 text-xs">
                        <span className="w-4 text-zinc-400">{index + 1}</span>
                        <Link
                          href={`/dashboard/users?user=${encodeURIComponent(user.id)}`}
                          className="text-zinc-200 truncate hover:text-brand-400 transition-colors"
                        >
                          {user.name || user.externalId}
                        </Link>
                        <span className="ml-auto shrink-0 font-semibold text-zinc-200">
                          {user.totalXp.toLocaleString()} XP
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
