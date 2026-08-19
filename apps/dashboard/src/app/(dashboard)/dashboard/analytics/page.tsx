'use client';

import React, { useEffect, useState } from 'react';
import { useDashboard } from '@/components/features/context/dashboard-context';
import { Dropdown } from '@/components/ui/dropdown';
import {
  BarChart3,
  Calendar,
  Download,
  Users,
  Activity,
  Zap,
  Coins,
  Trophy,
  Target,
  RefreshCw,
  TrendingUp,
  Send,
  Webhook,
  Bot,
} from 'lucide-react';

export default function AnalyticsPage() {
  const { selectedProject } = useDashboard();
  const [range, setRange] = useState<'24h' | '7d' | '30d' | '90d' | 'custom'>('7d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'events' | 'gamification' | 'delivery'>('overview');

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [userMetrics, setUserMetrics] = useState<any>(null);
  const [eventMetrics, setEventMetrics] = useState<any>(null);
  const [gamificationMetrics, setGamificationMetrics] = useState<any>(null);
  const [notificationMetrics, setNotificationMetrics] = useState<any>(null);
  const [integrationMetrics, setIntegrationMetrics] = useState<any>(null);

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

    try {
      const [ovRes, uRes, eRes, gRes, nRes, iRes] = await Promise.all([
        fetch(`/api/projects/${selectedProject.id}/analytics/overview${q}`, { credentials: 'include' }),
        fetch(`/api/projects/${selectedProject.id}/analytics/users${q}`, { credentials: 'include' }),
        fetch(`/api/projects/${selectedProject.id}/analytics/events${q}`, { credentials: 'include' }),
        fetch(`/api/projects/${selectedProject.id}/analytics/gamification${q}`, { credentials: 'include' }),
        fetch(`/api/projects/${selectedProject.id}/analytics/notifications${q}`, { credentials: 'include' }),
        fetch(`/api/projects/${selectedProject.id}/analytics/integrations${q}`, { credentials: 'include' }),
      ]);

      if (ovRes.ok) setOverview(await ovRes.json());
      if (uRes.ok) setUserMetrics(await uRes.json());
      if (eRes.ok) setEventMetrics(await eRes.json());
      if (gRes.ok) setGamificationMetrics(await gRes.json());
      if (nRes.ok) setNotificationMetrics(await nRes.json());
      if (iRes.ok) setIntegrationMetrics(await iRes.json());
    } catch {
      // Silently catch network errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [selectedProject?.id, range]);

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

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="bg-zinc-900 border border-zinc-800 p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <BarChart3 className="w-6 h-6 text-orange-400" />
            <h1 className="text-xl font-bold text-white font-mono tracking-tight">Project Analytics & Insights</h1>
          </div>
          <p className="text-xs text-zinc-400">
            Near-real-time product analytics, user growth, event volume, and gamification performance metrics.
          </p>
        </div>

        {/* Date Range Selector & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-zinc-950 border border-zinc-800 p-1">
            {(['24h', '7d', '30d', '90d', 'custom'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setRange(p)}
                className={`px-3 py-1 text-xs font-mono font-semibold transition ${
                  range === p
                    ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30'
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
                className="bg-zinc-950 border border-zinc-800 text-xs font-mono text-white px-2 py-1"
              />
              <span className="text-zinc-500 text-xs">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-zinc-950 border border-zinc-800 text-xs font-mono text-white px-2 py-1"
              />
              <button
                onClick={fetchAnalytics}
                className="px-2 py-1 bg-orange-500 text-black text-xs font-mono font-bold"
              >
                Apply
              </button>
            </div>
          )}

          <button
            onClick={fetchAnalytics}
            className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition"
            title="Refresh Analytics"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <div className="w-56">
            <Dropdown
              placeholder="Export CSV..."
              value={null}
              options={[
                {
                  value: 'all',
                  label: 'Full Report (All Metrics)',
                  sublabel: 'Comprehensive 5-section CSV report',
                  icon: <Download className="w-3.5 h-3.5 text-orange-400" />,
                },
                {
                  value: 'users',
                  label: 'Users Directory CSV',
                  sublabel: 'Registered end users list',
                  icon: <Users className="w-3.5 h-3.5 text-emerald-400" />,
                },
                {
                  value: 'events',
                  label: 'Events Log CSV',
                  sublabel: 'Ingested event activity',
                  icon: <Activity className="w-3.5 h-3.5 text-cyan-400" />,
                },
                {
                  value: 'xp',
                  label: 'XP Ledger CSV',
                  sublabel: 'XP award transactions',
                  icon: <Coins className="w-3.5 h-3.5 text-amber-400" />,
                },
                {
                  value: 'achievements',
                  label: 'Achievements Unlocked CSV',
                  sublabel: 'Unlocked achievements',
                  icon: <Trophy className="w-3.5 h-3.5 text-purple-400" />,
                },
              ]}
              onChange={(val) => {
                handleExportCsv(val);
              }}
              variant="orange"
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800 gap-6 font-mono text-xs">
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
                ? 'border-orange-500 text-orange-400'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            <SummaryCard title="Total End Users" value={overview?.totalUsers ?? 0} icon={Users} color="text-orange-400" />
            <SummaryCard title="Active Users (Period)" value={overview?.activeUsers ?? 0} icon={TrendingUp} color="text-emerald-400" />
            <SummaryCard title="Events Received" value={overview?.eventsProcessed ?? 0} icon={Activity} color="text-cyan-400" />
            <SummaryCard title="Total XP Awarded" value={overview?.xpAwarded ?? 0} icon={Coins} color="text-amber-400" />
            <SummaryCard title="Achievements Unlocked" value={overview?.achievementsUnlocked ?? 0} icon={Trophy} color="text-purple-400" />
            <SummaryCard title="Challenges Completed" value={overview?.challengesCompleted ?? 0} icon={Target} color="text-rose-400" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DataBox title="User Activity Summary">
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Total Registered Users:</span>
                  <span className="text-white font-bold">{userMetrics?.totalUsers ?? 0}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">New Users in Range:</span>
                  <span className="text-emerald-400 font-bold">+{userMetrics?.newUsers ?? 0}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-zinc-400">Active Users in Range:</span>
                  <span className="text-cyan-400 font-bold">{userMetrics?.activeUsers ?? 0}</span>
                </div>
              </div>
            </DataBox>

            <DataBox title="Gamification Summary">
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Total XP Awarded:</span>
                  <span className="text-amber-400 font-bold">{gamificationMetrics?.totalXpAwarded ?? 0} XP</span>
                </div>
                <div className="flex justify-between py-2 border-b border-zinc-800">
                  <span className="text-zinc-400">Avg XP Per Active User:</span>
                  <span className="text-white font-bold">{gamificationMetrics?.avgXpPerUser ?? 0} XP</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-zinc-400">Challenge Completion Rate:</span>
                  <span className="text-rose-400 font-bold">{gamificationMetrics?.challenges?.completionRatePercent ?? 0}%</span>
                </div>
              </div>
            </DataBox>
          </div>
        </div>
      )}

      {/* User Growth Tab */}
      {activeTab === 'users' && (
        <DataBox title="User Growth Over Time">
          {userMetrics?.userGrowthOverTime?.length === 0 ? (
            <p className="text-xs font-mono text-zinc-500 py-8 text-center">No user registration activity recorded in this period.</p>
          ) : (
            <div className="space-y-2">
              {userMetrics?.userGrowthOverTime?.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between text-xs font-mono py-1.5 border-b border-zinc-800/60">
                  <span className="text-zinc-400">{item.date}</span>
                  <span className="text-emerald-400 font-bold">+{item.count} new users</span>
                </div>
              ))}
            </div>
          )}
        </DataBox>
      )}

      {/* Event Volume Tab */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          <DataBox title="Top Ingested Event Types">
            {eventMetrics?.topEventTypes?.length === 0 ? (
              <p className="text-xs font-mono text-zinc-500 py-8 text-center">No event ingestion records found.</p>
            ) : (
              <div className="divide-y divide-zinc-800">
                {eventMetrics?.topEventTypes?.map((row: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between py-2.5 text-xs font-mono">
                    <span className="text-cyan-400 font-bold">{row.type}</span>
                    <span className="text-zinc-300">{row.count} events</span>
                  </div>
                ))}
              </div>
            )}
          </DataBox>
        </div>
      )}

      {/* Gamification Tab */}
      {activeTab === 'gamification' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <DataBox title="Most Popular Achievements">
              {gamificationMetrics?.topAchievements?.length === 0 ? (
                <p className="text-xs font-mono text-zinc-500 py-8 text-center">No achievements unlocked yet.</p>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {gamificationMetrics?.topAchievements?.map((ach: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between py-2 text-xs font-mono">
                      <span className="text-purple-400 font-bold">{ach.name}</span>
                      <span className="text-zinc-300">{ach.unlockedCount} unlocked</span>
                    </div>
                  ))}
                </div>
              )}
            </DataBox>

            <DataBox title="Most Triggered Gamification Rules">
              {gamificationMetrics?.topTriggeredRules?.length === 0 ? (
                <p className="text-xs font-mono text-zinc-500 py-8 text-center">No rule executions recorded.</p>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {gamificationMetrics?.topTriggeredRules?.map((rule: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between py-2 text-xs font-mono">
                      <div>
                        <span className="text-orange-400 font-bold block">{rule.name}</span>
                        <span className="text-[10px] text-zinc-500">Trigger: {rule.trigger}</span>
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
      {activeTab === 'delivery' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <DataBox title="In-App & Email Notifications">
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">In-App Notifications Generated:</span>
                <span className="text-white font-bold">{notificationMetrics?.inAppNotificationsGenerated ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">Email Outbox Completed:</span>
                <span className="text-emerald-400 font-bold">{notificationMetrics?.outbox?.completed ?? 0}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-zinc-400">Email Outbox Failed:</span>
                <span className="text-rose-400 font-bold">{notificationMetrics?.outbox?.failed ?? 0}</span>
              </div>
            </div>
          </DataBox>

          <DataBox title="Webhooks & Integrations">
            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">Webhooks Delivered:</span>
                <span className="text-emerald-400 font-bold">{integrationMetrics?.webhooks?.delivered ?? 0}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-zinc-800">
                <span className="text-zinc-400">Webhooks Failed:</span>
                <span className="text-rose-400 font-bold">{integrationMetrics?.webhooks?.failed ?? 0}</span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-zinc-400">External Integrations Delivered:</span>
                <span className="text-cyan-400 font-bold">{integrationMetrics?.integrations?.delivered ?? 0}</span>
              </div>
            </div>
          </DataBox>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: any; color: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-wider">{title}</span>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className={`text-xl font-bold font-mono ${color}`}>{value.toLocaleString()}</div>
    </div>
  );
}

function DataBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 p-5 space-y-4">
      <h3 className="text-xs font-mono font-bold text-white uppercase tracking-wider border-b border-zinc-800 pb-2">{title}</h3>
      {children}
    </div>
  );
}
