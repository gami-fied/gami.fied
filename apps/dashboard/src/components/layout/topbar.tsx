'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { useDashboard } from '../features/context/dashboard-context';
import { OrganizationSwitcher } from './organization-switcher';
import { ProjectSwitcher } from './project-switcher';
import { NotificationCenter } from '../features/notifications/notification-center';
import { Menu, LogOut, User } from 'lucide-react';

interface TopbarProps {
  onMobileMenuToggle: () => void;
}

export function Topbar({ onMobileMenuToggle }: TopbarProps) {
  const pathname = usePathname();
  const { logout, session } = useDashboard();

  const getPageTitle = (path: string) => {
    if (path === '/dashboard') return 'Overview';
    if (path.startsWith('/dashboard/events')) return 'Events Ingestion & Logs';
    if (path.startsWith('/dashboard/rules')) return 'Rules Engine';
    if (path.startsWith('/dashboard/xp')) return 'XP & Ledger System';
    if (path.startsWith('/dashboard/achievements')) return 'Achievements & Badges';
    if (path.startsWith('/dashboard/levels')) return 'Levels & Progression';
    if (path.startsWith('/dashboard/leaderboard')) return 'Leaderboards & Rankings';
    if (path.startsWith('/dashboard/challenges')) return 'Challenges & Quests';
    if (path.startsWith('/dashboard/api-keys')) return 'API Keys Management';
    if (path.startsWith('/dashboard/users')) return 'End-Users';
    return 'Dashboard';
  };

  return (
    <header className="relative h-16 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/60 sticky top-0 z-20 px-4 sm:px-6 flex items-center justify-between gap-4 shadow-sm shadow-black/20">
      {/* Subtle orange top-accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
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

        <div className="hidden md:flex items-center gap-2 pl-2">
          <div
            className="w-7 h-7 rounded-none bg-zinc-800 border border-zinc-700 flex items-center justify-center text-xs font-mono font-bold text-orange-400"
            title={session?.user?.name || session?.user?.email || 'User'}
          >
            {session?.user?.name ? (
              session.user.name.charAt(0).toUpperCase()
            ) : (
              <User className="w-3.5 h-3.5" />
            )}
          </div>
          {session?.user?.name && (
            <span className="text-xs text-zinc-400 font-medium hidden lg:block max-w-[120px] truncate">
              {session.user.name}
            </span>
          )}
          <button
            onClick={logout}
            className="text-xs text-zinc-400 hover:text-rose-400 transition ml-1"
            title="Log Out"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
