'use client';

import React, { useState, ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboard } from '../features/context/dashboard-context';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { OnboardingFlow } from '../features/onboarding/onboarding-flow';
import { Loader2, ShieldAlert, ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';

const ADMIN_RESTRICTED_ROUTES: Record<string, { title: string; description: string }> = {
  '/dashboard/organization/invitations': {
    title: 'Organization Pending Invitations',
    description: 'Viewing and managing pending team invitations requires Admin or Owner role in this organization.',
  },
  '/dashboard/api-keys': {
    title: 'Project API Keys',
    description: 'Managing project API keys and secret tokens requires Admin or Owner role.',
  },
  '/dashboard/webhooks': {
    title: 'Webhook Endpoints',
    description: 'Configuring webhook endpoints, viewing delivery logs, and replaying events requires Admin or Owner role.',
  },
  '/dashboard/integrations': {
    title: 'External Integrations & Channels',
    description: 'Connecting external providers (Discord, Slack), editing embed templates, and replaying deliveries requires Admin or Owner role.',
  },
  '/dashboard/system': {
    title: 'System Health & Operations',
    description: 'Viewing infrastructure health, database metrics, and server status requires Admin or Owner role.',
  },
  '/dashboard/audit-logs': {
    title: 'Audit Logs',
    description: 'Accessing organization audit logs and activity history requires Admin or Owner role.',
  },
  '/dashboard/settings': {
    title: 'Project & Organization Settings',
    description: 'Modifying project settings, deletion, and organization preferences requires Admin or Owner role.',
  },
};

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const {
    isPending,
    session,
    organizations,
    selectedOrg,
    selectedProject,
    loadingOrgs,
    error,
    setError,
  } = useDashboard();

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  if (isPending || loadingOrgs) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-400 gap-3 font-mono">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        <span className="text-sm font-medium">Loading session & workspace data...</span>
      </div>
    );
  }

  if (!session) return null;

  // Permission Guard Evaluation
  const isPlatformAdmin = (session?.user as any)?.role === 'admin' || Boolean((session?.user as any)?.isPlatformAdmin);
  const orgRole = selectedOrg?.role || 'member';
  const isAdminOrOwner = isPlatformAdmin || ['owner', 'admin'].includes(orgRole);

  // If user has no orgs OR no projects in active org (for admins), render Onboarding Flow
  const needsOnboarding = organizations.length === 0 || !selectedOrg || (isAdminOrOwner && !selectedProject);

  const matchedRestrictedRoute = Object.entries(ADMIN_RESTRICTED_ROUTES).find(([route]) =>
    pathname === route || pathname.startsWith(`${route}/`)
  );

  const isAccessDenied = !isAdminOrOwner && Boolean(matchedRestrictedRoute);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex font-mono">
      {/* Desktop Sidebar */}
      {!needsOnboarding && (
        <div className="hidden lg:block">
          <Sidebar
            isCollapsed={isCollapsed}
            onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
          />
        </div>
      )}

      {/* Mobile Drawer */}
      {!needsOnboarding && isMobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative z-50 w-64 bg-zinc-950 border-r border-zinc-800">
            <Sidebar isCollapsed={false} onToggleCollapse={() => setIsMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-all duration-300 ${
          !needsOnboarding && (isCollapsed ? 'lg:ml-16' : 'lg:ml-64')
        }`}
      >
        <Topbar onMobileMenuToggle={() => setIsMobileOpen(!isMobileOpen)} />

        {error && (
          <div className="m-6 mb-0 bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs px-4 py-3 rounded-none flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-4 text-rose-400 hover:text-rose-200 transition font-bold text-sm shrink-0"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        <main className="flex-1 p-6 md:p-8 w-full mx-auto space-y-6">
          {needsOnboarding ? (
            <OnboardingFlow />
          ) : isAccessDenied && matchedRestrictedRoute ? (
            <div className="py-20 px-6 text-center max-w-lg mx-auto space-y-6">
              <div className="w-16 h-16 bg-rose-950/40 border border-rose-800/80 text-rose-400 flex items-center justify-center mx-auto">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold tracking-widest text-rose-400 border border-rose-800 px-2 py-0.5 bg-rose-950/60 inline-block mb-3">
                  403 — ACCESS RESTRICTED
                </span>
                <h1 className="text-xl font-bold text-zinc-100 tracking-tight">
                  {matchedRestrictedRoute[1].title}
                </h1>
                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                  {matchedRestrictedRoute[1].description}
                </p>
              </div>
              <div className="pt-2">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Return to Dashboard Overview
                </Link>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
