'use client';

import React, { useEffect, useState } from 'react';
import { Menu, Search } from 'lucide-react';
import { OrganizationSwitcher } from './organization-switcher';
import { ProjectSwitcher } from './project-switcher';
import { ProjectAlerts } from './project-alerts';
import { ThemeToggle } from './theme-toggle';
import { OPEN_SEARCH_EVENT } from '@/lib/navigation';

interface TopbarProps {
  onMobileMenuToggle: () => void;
}

export function Topbar({ onMobileMenuToggle }: TopbarProps) {
  const [shortcut, setShortcut] = useState('Ctrl K');

  useEffect(() => {
    if (/mac|iphone|ipad/i.test(navigator.platform)) setShortcut('⌘ K');
  }, []);

  return (
    <header className="h-14 bg-zinc-950 border-b border-zinc-800/60 sticky top-0 z-20 px-3 sm:px-6 flex items-center gap-2 sm:gap-3">
      <button
        onClick={onMobileMenuToggle}
        className="lg:hidden grid h-9 w-9 place-items-center text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="hidden lg:block">
        <OrganizationSwitcher />
      </div>
      <div className="min-w-0">
        <ProjectSwitcher />
      </div>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <button
          onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH_EVENT))}
          aria-label="Search"
          className="flex h-9 min-w-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap px-2.5 sm:px-3 text-xs text-zinc-400 sm:border border-zinc-800 hover:text-zinc-100 hover:border-zinc-700 transition-colors"
        >
          <Search className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          <span className="hidden md:inline">Search</span>
          <kbd className="hidden md:inline whitespace-nowrap font-sans text-xs text-zinc-400 border border-zinc-800 px-1">
            {shortcut}
          </kbd>
        </button>
        <ProjectAlerts />
        <ThemeToggle />
      </div>
    </header>
  );
}
