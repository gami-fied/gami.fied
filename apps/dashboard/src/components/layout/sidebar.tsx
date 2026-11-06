'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight, Gamepad2, LogOut, ShieldCheck } from 'lucide-react';
import { useDashboard } from '../features/context/dashboard-context';
import { OrganizationSwitcher } from './organization-switcher';
import { usePermissions } from '@/hooks/use-permissions';
import { isNavItemActive, visibleNavGroups } from '@/lib/navigation';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /** The phone header has no room for this, so the drawer carries it. */
  showOrganizationSwitcher?: boolean;
  onNavigate?: () => void;
}

export function Sidebar({
  isCollapsed,
  onToggleCollapse,
  showOrganizationSwitcher,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const { session, selectedOrg, logout } = useDashboard();
  const { isAdminOrOwner, isPlatformAdmin, roleLabel } = usePermissions();

  const navGroups = visibleNavGroups(isAdminOrOwner);
  const linkLayout = isCollapsed ? 'justify-center px-0' : 'px-3';

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-30 bg-zinc-950 border-r border-zinc-800/60 transition-[width] duration-200 ease-out flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800/60 shrink-0">
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-3 overflow-hidden">
          <div className="w-7 h-7 bg-brand-500 flex items-center justify-center text-on-accent shrink-0">
            <Gamepad2 className="w-4 h-4" />
          </div>
          {!isCollapsed && (
            <span className="font-bold text-sm text-white tracking-tight whitespace-nowrap">
              Gami.Fied
            </span>
          )}
        </Link>
        <button
          onClick={onToggleCollapse}
          className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 transition-colors"
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {showOrganizationSwitcher && (
        <div className="p-2 border-b border-zinc-800/60">
          <OrganizationSwitcher />
        </div>
      )}

      <nav aria-label="Main" className="flex-1 py-2 px-2 space-y-2 overflow-y-auto">
        {navGroups.map((group, index) => (
          <div key={group.label ?? index}>
            {group.label &&
              (isCollapsed ? (
                <div className="mx-2 my-1.5 border-t border-zinc-800/60" />
              ) : (
                <div className="px-3 pt-1.5 pb-0.5 text-[11px] font-semibold text-zinc-400">
                  {group.label}
                </div>
              ))}
            {group.items.map((item) => {
              const isActive = isNavItemActive(item, pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  title={isCollapsed ? item.name : undefined}
                  className={`flex items-center gap-3 text-xs font-semibold border-l-2 transition-colors duration-150 ${onNavigate ? 'py-2.5' : 'py-1.5'} ${linkLayout} ${
                    isActive
                      ? 'bg-brand-500/10 text-brand-400 border-brand-400'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80 border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span className="truncate">{item.name}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="p-2 border-t border-zinc-800/60 shrink-0 space-y-1">
        {isPlatformAdmin && (
          <Link
            href="/admin"
            onClick={onNavigate}
            title={isCollapsed ? 'Platform Admin' : undefined}
            className={`flex items-center gap-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/80 transition-colors ${linkLayout}`}
          >
            <ShieldCheck className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Platform Admin</span>}
          </Link>
        )}
        <div className={`flex items-center gap-2 p-1 ${isCollapsed ? 'justify-center' : ''}`}>
          <Link
            href="/dashboard/profile"
            onClick={onNavigate}
            className="flex items-center gap-3 flex-1 min-w-0 group"
            title="Your profile"
          >
            <div className="w-8 h-8 bg-zinc-800 border border-brand-500/40 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0 group-hover:border-brand-400 transition-colors">
              {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : 'G'}
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-zinc-200 group-hover:text-brand-400 transition-colors truncate">
                  {session?.user?.name || 'Your profile'}
                </p>
                <p className="text-[11px] text-zinc-400 truncate">
                  {roleLabel}
                  {selectedOrg ? ` · ${selectedOrg.name}` : ''}
                </p>
              </div>
            )}
          </Link>
          {!isCollapsed && (
            <button
              onClick={logout}
              className="p-1.5 text-zinc-400 hover:text-danger-400 hover:bg-danger-950/40 transition-colors shrink-0"
              title="Log out"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
