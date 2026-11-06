import { useDashboard } from '@/components/features/context/dashboard-context';

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

/** The one place the dashboard works out what the signed-in person may do. */
export function usePermissions() {
  const { session, selectedOrg, isPlatformAdmin: flaggedAdmin } = useDashboard();
  const user = session?.user as { role?: string; isPlatformAdmin?: boolean } | undefined;

  const isPlatformAdmin = flaggedAdmin || user?.role === 'admin' || Boolean(user?.isPlatformAdmin);
  const role = selectedOrg?.role ?? 'member';

  return {
    role,
    roleLabel: ROLE_LABELS[role] ?? role,
    isPlatformAdmin,
    isAdminOrOwner: isPlatformAdmin || ['owner', 'admin'].includes(role),
  };
}
