'use client';

import { apiFetch } from '@/lib/api-client';
import { TableSkeleton } from '@/components/ui/skeleton';
import React, { useEffect, useState } from 'react';
import { useDashboard } from '@/components/features/context/dashboard-context';
import { Dropdown } from '@/components/ui/dropdown';
import {
  type LucideIcon,
  Download,
  Users,
  Activity,
  Coins,
  Trophy,
  Target,
  RefreshCw,
  TrendingUp,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';

interface OverviewMetrics {
  totalUsers?: number;
  activeUsers?: number;
  eventsProcessed?: number;
  xpAwarded?: number;
  achievementsUnlocked?: number;
  challengesCompleted?: number;
}

interface UserMetrics {
  totalUsers?: number;
  newUsers?: number;
  activeUsers?: number;
  userGrowthOverTime?: { date: string; count: number }[];
}

interface EventMetrics {
  topEventTypes?: { type: string; count: number }[];
}

interface GamificationMetrics {
  totalXpAwarded?: number;
  avgXpPerUser?: number;
  challenges?: { completionRatePercent?: number };
  topAchievements?: { name: string; unlockedCount: number }[];
  topTriggeredRules?: { name: string; trigger: string; executionCount: number }[];
}

interface NotificationMetrics {
  inAppNotificationsGenerated?: number;
  outbox?: { completed?: number; failed?: number };
}

interface IntegrationMetrics {
  webhooks?: { delivered?: number; failed?: number };
  integrations?: { delivered?: number; failed?: number };
}

type AnalyticsTab = 'overview' | 'users' | 'events' | 'gamification' | 'delivery';

/** Each tab loads only what it shows, so opening the page doesn't run every report. */
const TAB_SECTIONS = {
  overview: ['overview', 'users', 'gamification'],
  users: ['users'],
  events: ['events'],
  gamification: ['gamification'],
  delivery: ['notifications', 'integrations'],
} as const;

export default function AnalyticsPage() {
  const { selectedProject } = useDashboard();
  const [range, setRange] = useState<'24h' | '7d' | '30d' | '90d' | 'custom'>('7d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<AnalyticsTab>('overview');

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<OverviewMetrics | null>(null);
  const [userMetrics, setUserMetrics] = useState<UserMetrics | null>(null);
  const [eventMetrics, setEventMetrics] = useState<EventMetrics | null>(null);
  const [gamificationMetrics, setGamificationMetrics] = useState<GamificationMetrics | null>(
    null
  );
  const [notificationMetrics, setNotificationMetrics] = useState<NotificationMetrics | null>(
    null
  );
  const [integrationMetrics, setIntegrationMetrics] = useState<IntegrationMetrics | null>(
    null
  );

  const fetchAnalytics = async () => {
    if (!selectedProject?.id) return;
    setLoading(true);

    const queryParams = new URLSearchParams();
    queryParams.append('range', range);
    if (range === 'custom') {
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);
    }
    const q = queryParams.toString() ? `?${queryParams.toString()}` : '';

    const load = async <T,>(section: string, apply: (data: T) => void) => {
      const res = await apiFetch(`/api/projects/${selectedProject.id}/analytics/${section}${q}`, {
        credentials: 'include',
      });
      if (res.ok) apply(await res.json());
    };

    const loaders = {
      overview: () => load('overview', setOverview),
      users: () => load('users', setUserMetrics),
      events: () => load('events', setEventMetrics),
      gamification: () => load('gamification', setGamificationMetrics),
      notifications: () => load('notifications', setNotificationMetrics),
      integrations: () => load('integrations', setIntegrationMetrics),
    };

    try {
      await Promise.all(TAB_SECTIONS[activeTab].map((section) => loaders[section]()));
    } catch {
      // Silently catch network errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedProject?.id, range, activeTab]);

  const handleExportCsv = (type: string) => {
    if (!selectedProject?.id) return;
    const queryParams = new URLSearchParams();
    queryParams.append('range', range);
    queryParams.append('type', type);
    if (range === 'custom') {
      if (startDate) queryParams.append('startDate', startDate);
      if (endDate) queryParams.append('endDate', endDate);
    }
    window.open(`/api/projects/${selectedProject.id}/analytics/export?${queryParams.toString()}`, '_blank');
  };

  const tabData = {
    overview,
    users: userMetrics,
    events: eventMetrics,
    gamification: gamificationMetrics,
    delivery: notificationMetrics,
  }[activeTab];
  const showSkeleton = loading && !tabData;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <PageHeader
        title="Analytics"
        description="How your users, events and rewards are doing over time."
        actions={
          <>
<div className="w-28 sm:w-36">
            <Dropdown
              placeholder="Export"
              align="right"
              value={null}
              options={[
                {
                  value: 'all',
                  label: 'Full Report (All Metrics)',
                  sublabel: 'Comprehensive 5-section CSV report',
                  icon: <Download className="w-3.5 h-3.5 text-brand-400" />,
                },
                {
                  value: 'users',
                  label: 'Users Directory CSV',
                  sublabel: 'Registered end users list',
                  icon: <Users className="w-3.5 h-3.5 text-success-400" />,
                },
                {
                  value: 'events',
                  label: 'Events Log CSV',
                  sublabel: 'Events received',
                  icon: <Activity className="w-3.5 h-3.5 text-info-400" />,
                },
                {
                  value: 'xp',
                  label: 'XP History CSV',
                  sublabel: 'XP award transactions',
                  icon: <Coins className="w-3.5 h-3.5 text-warning-400" />,
                },
                {
                  value: 'achievements',
                  label: 'Achievements Unlocked CSV',
                  sublabel: 'Unlocked achievements',
                  icon: <Trophy className="w-3.5 h-3.5 text-info-400" />,
                },
              ]}
              onChange={(val) => {
                handleExportCsv(val);
              }}
              variant="orange"
            />
          </div>
<button
            onClick={fetchAnalytics}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
            title="Refresh Analytics" aria-label="Refresh Analytics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          </>
        }
        toolbar={
          <>
<div className="flex items-center bg-zinc-950 border border-zinc-800 p-1">
            {(['24h', '7d', '30d', '90d', 'custom'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setRange(p)}
                className={`px-3 py-1 text-xs font-semibold transition ${
                  range === p
                    ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {p.toUpperCase()}
              </button>
            ))}
          </div>
{range === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs text-white px-2 py-1 focus:border-brand-500"
              />
              <span className="text-zinc-400 text-xs">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs text-white px-2 py-1 focus:border-brand-500"
              />
              <button
                onClick={fetchAnalytics}
                className="px-2 py-1 bg-brand-500 text-black text-xs font-bold"
              >
                Apply
              </button>
            </div>
          )}
          </>
        }
      />

      {/* Tabs */}
      <div className="page-toolbar flex border-b border-zinc-800 gap-6 text-xs">
        {(
          [
            { id: 'overview', label: 'Overview' },
            { id: 'users', label: 'User Growth' },
            { id: 'events', label: 'Event Volume' },
            { id: 'gamification', label: 'Gamification' },
            { id: 'delivery', label: 'Delivery & Integrations' },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`pb-3 border-b-2 font-bold transition ${
              activeTab === tab.id
                ? 'border-brand-500 text-brand-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab Content */}
      {showSkeleton && <TableSkeleton rows={8} />}

      {!showSkeleton && activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <SummaryCard title="Total End Users" value={overview?.totalUsers ?? 0} icon={Users} color="text-brand-400" />
            <SummaryCard title="Active Users (Period)" value={overview?.activeUsers ?? 0} icon={TrendingUp} color="text-success-400" />
            <SummaryCard title="Events Received" value={overview?.eventsProcessed ?? 0} icon={Activity} color="text-info-400" />
            <SummaryCard title="Total XP Awarded" value={overview?.xpAwarded ?? 0} icon={Coins} color="text-warning-400" />
            <SummaryCard title="Achievements Unlocked" value={overview?.achievementsUnlocked ?? 0} icon={Trophy} color="text-info-400" />
            <SummaryCard title="Challenges Completed" value={overview?.challengesCompleted ?? 0} icon={Target} color="text-danger-400" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DataBox title="User Activity Summary">
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Total Registered Users:</span>
                  <span className="text-white font-bold">{userMetrics?.totalUsers ?? 0}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">New Users in Range:</span>
                  <span className="text-success-400 font-bold">+{userMetrics?.newUsers ?? 0}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-zinc-400">Active Users in Range:</span>
                  <span className="text-info-400 font-bold">{userMetrics?.activeUsers ?? 0}</span>
                </div>
              </div>
            </DataBox>

            <DataBox title="Gamification Summary">
              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Total XP Awarded:</span>
                  <span className="text-warning-400 font-bold">{gamificationMetrics?.totalXpAwarded ?? 0} XP</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Avg XP Per Active User:</span>
                  <span className="text-white font-bold">{gamificationMetrics?.avgXpPerUser ?? 0} XP</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-zinc-400">Challenge Completion Rate:</span>
                  <span className="text-danger-400 font-bold">{gamificationMetrics?.challenges?.completionRatePercent ?? 0}%</span>
                </div>
              </div>
            </DataBox>
          </div>
        </div>
      )}

      {/* User Growth Tab */}
      {!showSkeleton && activeTab === 'users' && (
        <DataBox title="User Growth Over Time">
          {userMetrics?.userGrowthOverTime?.length === 0 ? (
            <p className="text-xs text-zinc-400 py-8 text-center">No user registration activity recorded in this period.</p>
          ) : (
            <div className="space-y-2">
              {userMetrics?.userGrowthOverTime?.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">{item.date}</span>
                  <span className="text-success-400 font-bold">+{item.count} new users</span>
                </div>
              ))}
            </div>
          )}
        </DataBox>
      )}

      {/* Event Volume Tab */}
      {!showSkeleton && activeTab === 'events' && (
        <div className="space-y-6">
          <DataBox title="Top event types">
            {eventMetrics?.topEventTypes?.length === 0 ? (
              <p className="text-xs text-zinc-400 py-8 text-center">No events in this period.</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {eventMetrics?.topEventTypes?.map((row, idx) => (
                  <div key={idx} className="flex items-center justify-between py-2.5 text-xs font-mono">
                    <span className="text-info-400 font-bold">{row.type}</span>
                    <span className="text-zinc-300">{row.count} events</span>
                  </div>
                ))}
              </div>
            )}
          </DataBox>
        </div>
      )}

      {/* Gamification Tab */}
      {!showSkeleton && activeTab === 'gamification' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DataBox title="Most Popular Achievements">
              {gamificationMetrics?.topAchievements?.length === 0 ? (
                <p className="text-xs text-zinc-400 py-8 text-center">No achievements unlocked yet.</p>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {gamificationMetrics?.topAchievements?.map((ach, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 text-xs font-mono">
                      <span className="text-info-400 font-bold">{ach.name}</span>
                      <span className="text-zinc-300">{ach.unlockedCount} unlocked</span>
                    </div>
                  ))}
                </div>
              )}
            </DataBox>

            <DataBox title="Most Triggered Gamification Rules">
              {gamificationMetrics?.topTriggeredRules?.length === 0 ? (
                <p className="text-xs text-zinc-400 py-8 text-center">No rule executions recorded.</p>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {gamificationMetrics?.topTriggeredRules?.map((rule, idx) => (
                    <div key={idx} className="flex items-center justify-between py-2 text-xs font-mono">
                      <div>
                        <span className="text-brand-400 font-bold block">{rule.name}</span>
                        <span className="text-xs text-zinc-400">Trigger: {rule.trigger}</span>
                      </div>
                      <span className="text-zinc-300">{rule.executionCount} executions</span>
                    </div>
                  ))}
                </div>
              )}
            </DataBox>
          </div>
        </div>
      )}

      {/* Delivery & Integrations Tab */}
      {!showSkeleton && activeTab === 'delivery' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DataBox title="In-App & Email Notifications">
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">In-App Notifications Generated:</span>
                <span className="text-white font-bold">{notificationMetrics?.inAppNotificationsGenerated ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">Emails sent:</span>
                <span className="text-success-400 font-bold">{notificationMetrics?.outbox?.completed ?? 0}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-zinc-400">Emails failed:</span>
                <span className="text-danger-400 font-bold">{notificationMetrics?.outbox?.failed ?? 0}</span>
              </div>
            </div>
          </DataBox>

          <DataBox title="Webhooks & Integrations">
            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">Webhooks Delivered:</span>
                <span className="text-success-400 font-bold">{integrationMetrics?.webhooks?.delivered ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">Webhooks Failed:</span>
                <span className="text-danger-400 font-bold">{integrationMetrics?.webhooks?.failed ?? 0}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-zinc-400">External Integrations Delivered:</span>
                <span className="text-info-400 font-bold">{integrationMetrics?.integrations?.delivered ?? 0}</span>
              </div>
            </div>
          </DataBox>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: LucideIcon; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-400">{title}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className={`text-xl font-bold ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function DataBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-5 space-y-4">
      <h3 className="text-xs font-bold text-white border-b border-zinc-800 pb-2">{title}</h3>
      {children}
    </div>
  );
}
