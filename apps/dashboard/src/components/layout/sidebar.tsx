'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, ShieldCheck } from 'lucide-react';
import { LogoMark } from '@gami/ui';
import { useDashboard } from '../features/context/dashboard-context';
import { OrganizationSwitcher } from './organization-switcher';
import { Tooltip } from '../ui/tooltip';
import { usePermissions } from '@/hooks/use-permissions';
import { isNavItemActive, visibleNavGroups } from '@/lib/navigation';
import { useProjectFeatures } from '@/hooks/use-project-features';

interface SidebarProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  /** The phone header has no room for this, so the drawer carries it. */
  showOrganizationSwitcher?: boolean;
  onNavigate?: () => void;
}

const GROUP_STATE_KEY = 'gami.sidebarGroups';

/** Set-up pages are used less than the rest, so their groups start folded and the menu fits a laptop screen. */
const CLOSED_BY_DEFAULT = ['connect', 'manage'];

/** Which groups are open: the user's own choices, remembered between visits, over the defaults. */
function useGroupState() {
  const [choices, setChoices] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(GROUP_STATE_KEY) ?? '{}') as unknown;
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) setChoices(saved as Record<string, boolean>);
    } catch {
      // Nothing saved, or storage is not available: the defaults apply.
    }
  }, []);

  const isOpen = (id: string) => choices[id] ?? !CLOSED_BY_DEFAULT.includes(id);

  const set = (id: string, open: boolean) => {
    setChoices((current) => {
      const next = { ...current, [id]: open };
      try {
        localStorage.setItem(GROUP_STATE_KEY, JSON.stringify(next));
      } catch {
        // The choice still holds for this visit.
      }
      return next;
    });
  };

  return { isOpen, set };
}

export function Sidebar({
  isCollapsed,
  onToggleCollapse,
  showOrganizationSwitcher,
  onNavigate,
}: SidebarProps) {
  const pathname = usePathname();
  const { session, selectedOrg, selectedProject, logout } = useDashboard();
  const { isAdminOrOwner, isPlatformAdmin, roleLabel } = usePermissions();
  const groups = useGroupState();

  const { isOn } = useProjectFeatures(selectedProject?.id);
  const navGroups = visibleNavGroups(isAdminOrOwner, isOn);
  const linkLayout = isCollapsed ? 'justify-center px-0' : 'px-3';

  return (
    <aside
      className={`fixed top-0 left-0 bottom-0 z-30 bg-zinc-950 border-r border-zinc-800/60 transition-[width] duration-200 ease-out flex flex-col ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-800/60 shrink-0">
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-3 overflow-hidden">
          <LogoMark size={28} className="shrink-0 border border-zinc-800" />
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

      <nav
        aria-label="Main"
        className="flex-1 py-2 px-2 space-y-1 overflow-y-auto"
      >
        {navGroups.map((group, index) => {
          const hasActivePage = group.items.some((item) => isNavItemActive(item, pathname));
          // A group holding the current page stays open, so the reader never loses their place.
          const isOpen = isCollapsed || !group.id || hasActivePage || groups.isOpen(group.id);
          const listId = group.id ? `nav-group-${group.id}` : undefined;

          return (
            <div key={group.id ?? index}>
              {group.label &&
                (isCollapsed ? (
                  <div className="mx-2 my-1.5 border-t border-zinc-800/60" />
                ) : (
                  <button
                    type="button"
                    onClick={() => group.id && groups.set(group.id, !isOpen)}
                    aria-expanded={isOpen}
                    aria-controls={listId}
                    className="flex w-full items-center justify-between px-3 pt-2 pb-1 text-xs font-semibold text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    {group.label}
                    <ChevronDown
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? '' : '-rotate-90'}`}
                    />
                  </button>
                ))}
              {isOpen && (
                <div id={listId}>
                  {group.items.map((item) => {
                    const isActive = isNavItemActive(item, pathname);
                    const Icon = item.icon;
                    return (
                      <Tooltip key={item.href} label={item.name} side="right" disabled={!isCollapsed} className="flex w-full">
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={isActive ? 'page' : undefined}
                          aria-label={isCollapsed ? item.name : undefined}
                          className={`flex w-full items-center gap-3 text-[13px] font-medium border-l-2 transition-colors duration-150 ${onNavigate ? 'py-2.5' : 'py-1.5'} ${linkLayout} ${
                            isActive
                              ? 'bg-brand-500/10 text-brand-400 border-brand-400'
                              : 'text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/80 border-transparent'
                          }`}
                        >
                          <Icon className="w-4 h-4 shrink-0" />
                          {!isCollapsed && <span className="truncate">{item.name}</span>}
                        </Link>
                      </Tooltip>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="p-2 border-t border-zinc-800/60 shrink-0 space-y-1">
        {isPlatformAdmin && (
          <Tooltip label="Platform Admin" side="right" disabled={!isCollapsed} className="flex w-full">
            <Link
              href="/admin"
              onClick={onNavigate}
              aria-label={isCollapsed ? 'Platform Admin' : undefined}
              className={`flex w-full items-center gap-3 py-1.5 text-[13px] font-medium text-zinc-300 hover:text-zinc-100 hover:bg-zinc-900/80 transition-colors ${linkLayout}`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span>Platform Admin</span>}
            </Link>
          </Tooltip>
        )}
        <div className={`flex items-center gap-2 p-1 ${isCollapsed ? 'flex-col' : ''}`}>
          <Tooltip label="Your profile" side="right" disabled={!isCollapsed} className={isCollapsed ? '' : 'flex-1 min-w-0'}>
            <Link
              href="/dashboard/profile"
              onClick={onNavigate}
              aria-label={isCollapsed ? 'Your profile' : undefined}
              className="flex items-center gap-3 flex-1 min-w-0 group"
            >
              <div className="w-8 h-8 bg-zinc-800 border border-brand-500/40 flex items-center justify-center text-xs font-bold text-brand-400 shrink-0 group-hover:border-brand-400 transition-colors">
                {session?.user?.name ? session.user.name.charAt(0).toUpperCase() : 'G'}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-zinc-200 group-hover:text-brand-400 transition-colors truncate">
                    {session?.user?.name || 'Your profile'}
                  </p>
                  <p className="text-xs text-zinc-400 truncate">
                    {roleLabel}
                    {selectedOrg ? ` · ${selectedOrg.name}` : ''}
                  </p>
                </div>
              )}
            </Link>
          </Tooltip>
          {/* Shown in the narrow rail too, so there is always a way to log out. */}
          <Tooltip label="Log out" side={isCollapsed ? 'right' : 'top'}>
            <button
              onClick={logout}
              className="p-1.5 text-zinc-400 hover:text-danger-400 hover:bg-danger-950/40 transition-colors shrink-0"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}
