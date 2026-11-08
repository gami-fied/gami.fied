'use client';

import { apiFetch } from '@/lib/api-client';
import React, { useState, useEffect, ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useDashboard } from '../features/context/dashboard-context';
import { Sidebar } from './sidebar';
import { ApiStatusBanner } from './api-status-banner';
import { CommandPalette } from './command-palette';
import { Topbar } from './topbar';
import { OnboardingFlow } from '../features/onboarding/onboarding-flow';
import { EmptyState } from '../ui/empty-state';
import { ShellSkeleton } from '../ui/skeleton';
import { usePermissions } from '@/hooks/use-permissions';
import { findAdminOnlyRoute, findFeatureRoute } from '@/lib/navigation';
import { useProjectFeatures } from '@/hooks/use-project-features';
import { FeatureOff } from './feature-off';
import { FolderKanban, ShieldAlert } from 'lucide-react';

const SIDEBAR_STORAGE_KEY = 'gami.sidebarCollapsed';

/** Pages that work without a project, so a member with none can still reach them. */
const NO_PROJECT_PAGES = ['/dashboard/profile', '/dashboard/organization'];

export function DashboardShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const {
    isPending,
    session,
    organizations,
    selectedOrg,
    selectedProject,
    loadingOrgs,
    projectsFailed,
    error,
    setError,
  } = useDashboard();
  const { isOn: isFeatureOn } = useProjectFeatures(selectedProject?.id);

  const { isAdminOrOwner, roleLabel } = usePermissions();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    setIsCollapsed(localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true');
  }, []);

  const toggleCollapsed = () => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(!isCollapsed));
    setIsCollapsed(!isCollapsed);
  };

  // Platform Email OTP Verification Enforcement
  useEffect(() => {
    async function checkOtpRequirement() {
      try {
        const res = await apiFetch('/api/auth/otp/status');
        if (res.ok) {
          const data = await res.json();
          if (data.requireEmailOtpVerification && !data.emailVerified) {
            if (pathname !== '/verify-email') {
              router.push('/verify-email');
            }
          }
        }
      } catch {
        // Ignore fallback
      }
    }
    if (session) {
      checkOtpRequirement();
    }
  }, [session, pathname, router]);

  if (isPending || (loadingOrgs && organizations.length === 0)) return <ShellSkeleton />;

  if (!session) return <ShellSkeleton />;

  // If user has no orgs OR no projects in active org (for admins), render Onboarding Flow
  const needsOnboarding =
    !projectsFailed &&
    (organizations.length === 0 || !selectedOrg || (isAdminOrOwner && !selectedProject));

  const restrictedRoute = isAdminOrOwner ? undefined : findAdminOnlyRoute(pathname);
  const featureRoute = findFeatureRoute(pathname);
  const featureOff = featureRoute && !isFeatureOn(featureRoute.feature) ? featureRoute : undefined;
  const hasNoProject =
    !isAdminOrOwner &&
    !projectsFailed &&
    !selectedProject &&
    !NO_PROJECT_PAGES.some((page) => pathname.startsWith(page));

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex">
      {/* Desktop Sidebar */}
      {!needsOnboarding && (
        <div className="hidden lg:block">
          <Sidebar isCollapsed={isCollapsed} onToggleCollapse={toggleCollapsed} />
        </div>
      )}

      {/* Mobile Drawer */}
      {!needsOnboarding && isMobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 animate-fade-in"
            onClick={() => setIsMobileOpen(false)}
          />
          <div className="relative z-50 w-64 bg-zinc-950 border-r border-zinc-800">
            <Sidebar
              isCollapsed={false}
              onToggleCollapse={() => setIsMobileOpen(false)}
              onNavigate={() => setIsMobileOpen(false)}
              showOrganizationSwitcher
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[margin-left] duration-200 ease-out ${
          !needsOnboarding && (isCollapsed ? 'lg:ml-16' : 'lg:ml-64')
        }`}
      >
        <Topbar onMobileMenuToggle={() => setIsMobileOpen(!isMobileOpen)} />
        <CommandPalette />
        <ApiStatusBanner />

        {error && (
          <div className="m-6 mb-0 bg-danger-950/40 border border-danger-800/60 text-danger-300 text-xs px-4 py-3 rounded-none flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-4 text-danger-400 hover:text-danger-200 transition font-bold text-sm shrink-0"
              aria-label="Dismiss error"
            >
              ✕
            </button>
          </div>
        )}

        <main className="flex-1 p-4 sm:p-6 md:p-8 w-full max-w-[96rem] mx-auto space-y-6">
          {needsOnboarding ? (
            <OnboardingFlow />
          ) : restrictedRoute ? (
            <EmptyState
              icon={ShieldAlert}
              title={`${restrictedRoute.name} is for admins`}
              description={`You're a ${roleLabel.toLowerCase()} of ${selectedOrg?.name ?? 'this organization'}. Ask an owner or admin if you need this page.`}
              action={{ label: 'Back to Overview', href: '/dashboard' }}
            />
          ) : featureOff ? (
            <FeatureOff name={featureOff.name} feature={featureOff.feature!} />
          ) : hasNoProject ? (
            <EmptyState
              icon={FolderKanban}
              title="You don't have a project yet"
              description={`Ask an owner or admin of ${selectedOrg?.name ?? 'your organization'} to add you to a project. You'll see it here as soon as they do.`}
              action={{ label: 'See your team', href: '/dashboard/organization/members' }}
            />
          ) : (
            <div key={pathname} className="animate-page-in">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
