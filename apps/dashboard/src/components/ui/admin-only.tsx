'use client';

import type { ReactNode } from 'react';
import { usePermissions } from '@/hooks/use-permissions';

/** Shows an action only to people who can use it, rather than disabling it for everyone else. */
export function AdminOnly({ children }: { children: ReactNode }) {
  const { isAdminOrOwner } = usePermissions();
  return isAdminOrOwner ? <>{children}</> : null;
}
