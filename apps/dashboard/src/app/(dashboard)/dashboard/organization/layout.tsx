'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';

const TABS = [
  { name: 'Members', href: '/dashboard/organization/members', adminOnly: false },
  { name: 'Invitations', href: '/dashboard/organization/invitations', adminOnly: true },
  { name: 'Data', href: '/dashboard/organization/data', adminOnly: true },
];

/** Team pages belong to the organization, so they share tabs rather than sidebar space. */
export default function OrganizationLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { isAdminOrOwner } = usePermissions();
  const tabs = TABS.filter((tab) => isAdminOrOwner || !tab.adminOnly);

  return (
    <div className="space-y-6">
      {tabs.length > 1 && (
        <nav aria-label="Team" className="flex gap-1 border-b border-zinc-800 overflow-x-auto">
          {tabs.map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? 'page' : undefined}
                className={`px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors ${
                  active
                    ? 'border-brand-500 text-brand-400'
                    : 'border-transparent text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {tab.name}
              </Link>
            );
          })}
        </nav>
      )}
      {children}
    </div>
  );
}
