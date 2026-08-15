'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useDashboard } from '../features/context/dashboard-context';
import {
  LayoutDashboard,
  Activity,
  Zap,
  Coins,
  Trophy,
  TrendingUp,
  KeyRound,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Target,
  Medal,
  Users,
  Webhook,
  Gamepad2,
} from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { session, logout } = useDashboard();

  const navItems = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Events', href: '/dashboard/events', icon: Activity },
    { name: 'Rules', href: '/dashboard/rules', icon: Zap },
    { name: 'XP System', href: '/dashboard/xp', icon: Coins },
    { name: 'Achievements', href: '/dashboard/achievements', icon: Trophy },
    { name: 'Levels & Progression', href: '/dashboard/levels', icon: TrendingUp },
    { name: 'Leaderboards', href: '/dashboard/leaderboard', icon: Medal },
    { name: 'Challenges', href: '/dashboard/challenges', icon: Target },
    { name: 'End-Users', href: '/dashboard/users', icon: Users },
    { name: 'Webhooks', href: '/dashboard/webhooks', icon: Webhook },
    { name: 'API Keys', href: '/dashboard/api-keys', icon: KeyRound },
    { name: 'System Health', href: '/dashboard/system', icon: Activity },
    { name: 'Audit Logs', href: '/dashboard/audit-logs', icon: Target },
  ];

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-30 bg-zinc-950 border-r border-zinc-800/60 transition-all duration-300 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-800/60">
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
          {/* Game logo badge */}
          <div className="w-8 h-8 rounded-none bg-orange-500 flex items-center justify-center text-white shrink-0">
            <Gamepad2 className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <div className="overflow-hidden">
              <span className="font-bold text-sm text-white tracking-tight whitespace-nowrap block leading-none font-mono">
                Gami-fied
              </span>
              <span className="text-[10px] text-orange-400 font-semibold tracking-widest uppercase whitespace-nowrap block mt-0.5 font-mono">
                Game Engine
              </span>
            </div>
          )}
        </Link>
        <button
          onClick={onToggleCollapse}
          className="p-1 rounded-none text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-none text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-orange-500/12 text-orange-400 border-l-2 border-orange-400 border-y border-r border-orange-500/20'
                  : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/80 border border-transparent'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
              title={isCollapsed ? item.name : undefined}
            >
              <Icon
                className={`w-4 h-4 shrink-0 transition-colors ${isActive ? 'text-orange-400' : 'text-zinc-500 group-hover:text-zinc-300'}`}
              />
              {!isCollapsed && (
                <span className={`truncate ${isActive ? 'text-orange-300 font-mono' : ''}`}>
                  {item.name}
                </span>
              )}
              {/* Active indicator dot */}
              {isActive && !isCollapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-none bg-orange-400 shrink-0" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-zinc-800/60">
        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
          <div className="w-8 h-8 rounded-none bg-zinc-800 border-2 border-orange-500/40 flex items-center justify-center text-xs font-mono font-bold text-orange-400 shrink-0">
            {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : 'G'}
          </div>
          {!isCollapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-zinc-200 truncate">
                {session?.user?.name || 'Dashboard User'}
              </p>
              <p className="text-[10px] text-zinc-500 truncate font-mono">{session?.user?.email}</p>
            </div>
          )}
          {!isCollapsed && (
            <button
              onClick={logout}
              className="p-1.5 rounded-none text-zinc-600 hover:text-rose-400 hover:bg-rose-950/40 transition shrink-0"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
