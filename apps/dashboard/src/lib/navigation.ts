import type { ComponentType } from 'react';
import {
  Activity,
  BarChart3,
  Blocks,
  Code2,
  Coins,
  Flame,
  Gauge,
  FileText,
  HeartPulse,
  History,
  KeyRound,
  LayoutDashboard,
  Mail,
  Medal,
  Settings,
  Target,
  Trophy,
  TrendingUp,
  Users,
  UsersRound,
  Webhook,
  Zap,
} from 'lucide-react';

export interface NavItem {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  /** Hidden from plain members, and the shell refuses the route. */
  adminOnly?: boolean;
  /** Also active under this path, for items with tabs. */
  section?: string;
  exact?: boolean;
  /** Other words people search for. */
  keywords?: string;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/** The one list of dashboard pages. The sidebar, route guard and search all read from it. */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { name: 'Overview', href: '/dashboard', icon: LayoutDashboard, exact: true, keywords: 'home' },
    ],
  },
  {
    label: 'Build',
    items: [
      { name: 'Rules', href: '/dashboard/rules', icon: Zap },
      { name: 'Achievements', href: '/dashboard/achievements', icon: Trophy, keywords: 'badges' },
      { name: 'Streaks', href: '/dashboard/streaks', icon: Flame, keywords: 'daily habit consecutive' },
      { name: 'Boosts & limits', href: '/dashboard/boosts', icon: Gauge, keywords: 'multiplier double xp cap cooldown abuse' },
      { name: 'Levels', href: '/dashboard/levels', icon: TrendingUp, keywords: 'progression' },
      { name: 'Challenges', href: '/dashboard/challenges', icon: Target, keywords: 'quests' },
      { name: 'Campaigns', href: '/dashboard/campaigns', icon: Mail, adminOnly: true, keywords: 'email reminders recap winback' },
    ],
  },
  {
    label: 'Activity',
    items: [
      { name: 'Users', href: '/dashboard/users', icon: Users, keywords: 'players' },
      { name: 'Events', href: '/dashboard/events', icon: Activity, keywords: 'logs' },
      { name: 'XP History', href: '/dashboard/xp', icon: Coins, keywords: 'points ledger' },
      { name: 'Leaderboard', href: '/dashboard/leaderboard', icon: Medal, keywords: 'rankings' },
      { name: 'Analytics', href: '/dashboard/analytics', icon: BarChart3, keywords: 'reports' },
    ],
  },
  {
    label: 'Connect',
    items: [
      { name: 'API Keys', href: '/dashboard/api-keys', icon: KeyRound, adminOnly: true },
      { name: 'Webhooks', href: '/dashboard/webhooks', icon: Webhook, adminOnly: true },
      {
        name: 'Integrations',
        href: '/dashboard/integrations',
        icon: Blocks,
        adminOnly: true,
        keywords: 'discord',
      },
      {
        name: 'Developer Hub',
        href: '/dashboard/developer',
        icon: Code2,
        adminOnly: true,
        exact: true,
        keywords: 'sdk install',
      },
      {
        name: 'API Docs',
        href: '/dashboard/developer/docs',
        icon: FileText,
        adminOnly: true,
        keywords: 'reference',
      },
    ],
  },
  {
    label: 'Manage',
    items: [
      {
        name: 'Team',
        href: '/dashboard/organization/members',
        section: '/dashboard/organization',
        icon: UsersRound,
        keywords: 'members invitations data export',
      },
      {
        name: 'Delivery Health',
        href: '/dashboard/system',
        icon: HeartPulse,
        adminOnly: true,
        keywords: 'status system queue failures',
      },
      { name: 'Audit Logs', href: '/dashboard/audit-logs', icon: History, adminOnly: true },
      { name: 'Settings', href: '/dashboard/settings', icon: Settings, adminOnly: true },
    ],
  },
];

/** Admin pages that sit behind a tab rather than a sidebar item. */
const ADMIN_TABS = [
  { name: 'Invitations', href: '/dashboard/organization/invitations' },
  { name: 'Data', href: '/dashboard/organization/data' },
];

export const OPEN_SEARCH_EVENT = 'gami:open-search';

const isUnder = (pathname: string, href: string) =>
  pathname === href || pathname.startsWith(`${href}/`);

export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return isUnder(pathname, item.section ?? item.href);
}

export function visibleNavGroups(isAdminOrOwner: boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isAdminOrOwner || !item.adminOnly),
  })).filter((group) => group.items.length > 0);
}

/** The admin-only page at this address, if there is one. */
export function findAdminOnlyRoute(pathname: string): { name: string; href: string } | undefined {
  const adminItems = NAV_GROUPS.flatMap((group) => group.items).filter((item) => item.adminOnly);
  return [...adminItems, ...ADMIN_TABS].find((item) => isUnder(pathname, item.href));
}
