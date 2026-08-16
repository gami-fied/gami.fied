'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useDashboard } from '../features/context/dashboard-context';
import { OrganizationSwitcher } from './organization-switcher';
import { ProjectSwitcher } from './project-switcher';
import { NotificationCenter } from '../features/notifications/notification-center';
import { Menu } from 'lucide-react';

interface TopbarProps {
  onMobileMenuToggle: () => void;
}

export function Topbar({ onMobileMenuToggle }: TopbarProps) {
  const pathname = usePathname();

  const getPageTitle = (path: string) => {
    if (path === '/dashboard') return 'Overview';
    if (path.startsWith('/dashboard/events')) return 'Events Ingestion & Logs';
    if (path.startsWith('/dashboard/rules')) return 'Rules Engine';
    if (path.startsWith('/dashboard/xp')) return 'XP & Ledger System';
    if (path.startsWith('/dashboard/achievements')) return 'Achievements & Badges';
    if (path.startsWith('/dashboard/levels')) return 'Levels & Progression';
    if (path.startsWith('/dashboard/leaderboard')) return 'Leaderboards & Rankings';
    if (path.startsWith('/dashboard/challenges')) return 'Challenges & Quests';
    if (path.startsWith('/dashboard/users')) return 'Users';
    if (path.startsWith('/dashboard/organization/members')) return 'Organization Members & Roles';
    if (path.startsWith('/dashboard/organization/invitations')) return 'Organization Invitations';
    if (path.startsWith('/dashboard/api-keys')) return 'API Keys Management';
    if (path.startsWith('/dashboard/webhooks')) return 'Webhooks & External Deliveries';
    if (path.startsWith('/dashboard/integrations')) return 'Integrations & External Channels';
    if (path.startsWith('/dashboard/system')) return 'System Health & Observability';
    if (path.startsWith('/dashboard/audit-logs')) return 'Security & System Audit Logs';
    if (path.startsWith('/dashboard/settings')) return 'Server SMTP & System Settings';
    return 'Dashboard';
  };

  const getAccentLineClass = (path: string) => {
    if (
      path.startsWith('/dashboard/api-keys') ||
      path.startsWith('/dashboard/webhooks') ||
      path.startsWith('/dashboard/integrations')
    ) {
      return 'via-emerald-500/40';
    }
    if (
      path.startsWith('/dashboard/system') ||
      path.startsWith('/dashboard/audit-logs') ||
      path.startsWith('/dashboard/settings')
    ) {
      return 'via-cyan-500/40';
    }
    return 'via-orange-500/40';
  };

  return (
    <header className="relative h-16 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/60 sticky top-0 z-20 px-4 sm:px-6 flex items-center justify-between gap-4 shadow-sm shadow-black/20 font-mono">
      {/* Dynamic Section Accent Line */}
      <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${getAccentLineClass(pathname)} to-transparent`} />
      
      <div className="flex items-center gap-3">
        <button
          onClick={onMobileMenuToggle}
          className="lg:hidden p-2 rounded-none text-zinc-400 hover:text-white hover:bg-zinc-900 transition"
          aria-label="Open mobile menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <span className="font-bold text-base text-zinc-100 tracking-tight">
            {getPageTitle(pathname)}
          </span>
        </div>
      </div>

      {/* Switchers & Context */}
      <div className="flex items-center gap-3">
        <OrganizationSwitcher />
        <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
        <ProjectSwitcher />

        <div className="h-4 w-px bg-zinc-800 hidden sm:block" />
        <NotificationCenter />
      </div>
    </header>
  );
}
