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
  UserPlus,
  Webhook,
  Gamepad2,
  Blocks,
  Server,
  History,
  Settings as SettingsIcon,
} from 'lucide-react';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  disabled?: boolean;
}

interface NavGroup {
  label?: string;
  theme: 'orange' | 'emerald' | 'cyan';
  items: NavItem[];
}

export function Sidebar({ isCollapsed, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const { session, selectedOrg, logout } = useDashboard();

  const userRole = selectedOrg?.role || 'member';
  const isAdminOrOwner = ['owner', 'admin'].includes(userRole);

  const rawNavGroups: NavGroup[] = [
    {
      theme: 'orange',
      items: [
        { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
      ],
    },
    {
      label: 'GAMIFICATION',
      theme: 'orange',
      items: [
        { name: 'Events', href: '/dashboard/events', icon: Activity },
        { name: 'Rules', href: '/dashboard/rules', icon: Zap },
        { name: 'XP', href: '/dashboard/xp', icon: Coins },
        { name: 'Achievements', href: '/dashboard/achievements', icon: Trophy },
        { name: 'Levels & Progression', href: '/dashboard/levels', icon: TrendingUp },
        { name: 'Leaderboards', href: '/dashboard/leaderboard', icon: Medal },
        { name: 'Challenges', href: '/dashboard/challenges', icon: Target },
      ],
    },
    {
      label: 'USERS',
      theme: 'orange',
      items: [
        { name: 'Users', href: '/dashboard/users', icon: Users },
      ],
    },
    {
      label: 'ORGANIZATION',
      theme: 'orange',
      items: [
        { name: 'Members', href: '/dashboard/organization/members', icon: Users },
        { name: 'Invitations', href: '/dashboard/organization/invitations', icon: UserPlus },
      ],
    },
    {
      label: 'DEVELOPER',
      theme: 'emerald',
      items: [
        { name: 'API Keys', href: '/dashboard/api-keys', icon: KeyRound },
        { name: 'Webhooks', href: '/dashboard/webhooks', icon: Webhook },
        { name: 'Integrations', href: '/dashboard/integrations', icon: Blocks },
      ],
    },
    {
      label: 'OPERATIONS',
      theme: 'cyan',
      items: [
        { name: 'Delivery Health', href: '/dashboard/system', icon: Server },
        { name: 'Audit Logs', href: '/dashboard/audit-logs', icon: History },
        { name: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
      ],
    },
  ];

  const navGroups = rawNavGroups
    .map((group) => {
      // Hide DEVELOPER and OPERATIONS sections entirely for regular members
      if (!isAdminOrOwner && ['DEVELOPER', 'OPERATIONS'].includes(group.label || '')) {
        return { ...group, items: [] };
      }

      const items = group.items.filter((item) => {
        if (!isAdminOrOwner && item.href === '/dashboard/organization/invitations') {
          return false;
        }
        return true;
      });
      return { ...group, items };
    })
    .filter((group) => group.items.length > 0);

  const getActiveStyles = (theme: 'orange' | 'emerald' | 'cyan') => {
    switch (theme) {
      case 'emerald':
        return {
          activeClass: 'bg-emerald-500/12 text-emerald-400 border-l-2 border-emerald-400 border-y border-r border-emerald-500/20',
          iconClass: 'text-emerald-400',
          textClass: 'text-emerald-300 font-mono',
          dotClass: 'bg-emerald-400',
        };
      case 'cyan':
        return {
          activeClass: 'bg-cyan-500/12 text-cyan-400 border-l-2 border-cyan-400 border-y border-r border-cyan-500/20',
          iconClass: 'text-cyan-400',
          textClass: 'text-cyan-300 font-mono',
          dotClass: 'bg-cyan-400',
        };
      case 'orange':
      default:
        return {
          activeClass: 'bg-orange-500/12 text-orange-400 border-l-2 border-orange-400 border-y border-r border-orange-500/20',
          iconClass: 'text-orange-400',
          textClass: 'text-orange-300 font-mono',
          dotClass: 'bg-orange-400',
        };
    }
  };

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-30 bg-zinc-950 border-r border-zinc-800/60 transition-all duration-300 flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-zinc-800/60 shrink-0">
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

      {/* Navigation Groups */}
      <nav className="flex-1 py-3 px-2 space-y-4 overflow-y-auto">
        {navGroups.map((group, groupIdx) => (
          <div key={group.label || `group-${groupIdx}`} className="space-y-0.5">
            {group.label && !isCollapsed && (
              <div className="px-3 pt-2 pb-1 text-[10px] font-mono font-bold tracking-wider text-zinc-500 uppercase">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const isActive =
                !item.disabled &&
                (item.href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(item.href));
              const Icon = item.icon;
              const themeStyles = getActiveStyles(group.theme);

              if (item.disabled) {
                return (
                  <div
                    key={item.name}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-none text-xs font-semibold text-zinc-600 border border-transparent cursor-not-allowed opacity-60 ${
                      isCollapsed ? 'justify-center px-0' : ''
                    }`}
                    title={isCollapsed ? `${item.name} (Soon)` : undefined}
                  >
                    <Icon className="w-4 h-4 shrink-0 text-zinc-600" />
                    {!isCollapsed && (
                      <span className="truncate flex-1 font-mono text-zinc-600">
                        {item.name}
                      </span>
                    )}
                    {!isCollapsed && (
                      <span className="text-[9px] font-mono uppercase font-bold tracking-wider px-1.5 py-0.5 text-zinc-600 border border-zinc-800">
                        Soon
                      </span>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-none text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? themeStyles.activeClass
                      : 'text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900/80 border border-transparent'
                  } ${isCollapsed ? 'justify-center px-0' : ''}`}
                  title={isCollapsed ? item.name : undefined}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isActive ? themeStyles.iconClass : 'text-zinc-500 group-hover:text-zinc-300'
                    }`}
                  />
                  {!isCollapsed && (
                    <span className={`truncate ${isActive ? themeStyles.textClass : ''}`}>
                      {item.name}
                    </span>
                  )}
                  {/* Active indicator dot */}
                  {isActive && !isCollapsed && (
                    <div className={`ml-auto w-1.5 h-1.5 rounded-none ${themeStyles.dotClass} shrink-0`} />
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Footer */}
      <div className="p-3 border-t border-zinc-800/60 shrink-0">
        <div className={`flex items-center gap-3 ${isCollapsed ? 'justify-center' : ''}`}>
          <Link
            href="/dashboard/profile"
            className="flex items-center gap-3 flex-1 min-w-0 group hover:opacity-80 transition"
            title="Edit Profile & Preferences"
          >
            <div className="w-8 h-8 rounded-none bg-zinc-800 border-2 border-orange-500/40 flex items-center justify-center text-xs font-mono font-bold text-orange-400 shrink-0 group-hover:border-orange-400">
              {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : 'G'}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-200 group-hover:text-orange-400 transition truncate">
                  {session?.user?.name || 'Dashboard User'}
                </p>
                <p className="text-[10px] text-zinc-500 truncate font-mono">{session?.user?.email}</p>
              </div>
            )}
          </Link>
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
