'use client';

import React, { useState, ReactNode } from 'react';
import { useDashboard } from '../features/context/dashboard-context';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { OnboardingFlow } from '../features/onboarding/onboarding-flow';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export function DashboardShell({ children }: { children: ReactNode }) {
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
      <div className="flex h-screen w-screen items-center justify-center bg-zinc-950 text-zinc-400 gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        <span className="text-sm font-medium">Loading session & workspace data...</span>
      </div>
    );
  }

  if (!session) return null;

  // If user has no orgs OR no projects in active org, render Onboarding Flow
  const needsOnboarding = organizations.length === 0 || !selectedOrg || !selectedProject;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
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
