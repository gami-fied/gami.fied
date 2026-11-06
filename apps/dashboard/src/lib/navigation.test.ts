import { describe, expect, it } from 'vitest';
import { findAdminOnlyRoute, isNavItemActive, NAV_GROUPS, visibleNavGroups } from './navigation';

const allItems = NAV_GROUPS.flatMap((group) => group.items);
const item = (name: string) => allItems.find((entry) => entry.name === name)!;

describe('navigation', () => {
  it('hides admin pages from members', () => {
    const names = visibleNavGroups(false).flatMap((g) => g.items.map((i) => i.name));

    expect(names).toContain('Team');
    expect(names).not.toContain('API Keys');
    expect(visibleNavGroups(false).map((g) => g.label)).not.toContain('Connect');
  });

  it('refuses every admin page by address, including the ones the sidebar missed', () => {
    expect(findAdminOnlyRoute('/dashboard/developer')?.name).toBe('Developer Hub');
    expect(findAdminOnlyRoute('/dashboard/developer/docs')).toBeDefined();
    expect(findAdminOnlyRoute('/dashboard/organization/invitations')?.name).toBe('Invitations');
    expect(findAdminOnlyRoute('/dashboard/organization/data')?.name).toBe('Data');
  });

  it('leaves member pages open', () => {
    expect(findAdminOnlyRoute('/dashboard')).toBeUndefined();
    expect(findAdminOnlyRoute('/dashboard/organization/members')).toBeUndefined();
    expect(findAdminOnlyRoute('/dashboard/users')).toBeUndefined();
  });

  it('marks Team active on every tab', () => {
    expect(isNavItemActive(item('Team'), '/dashboard/organization/data')).toBe(true);
  });

  it('keeps Developer Hub and API Docs apart', () => {
    expect(isNavItemActive(item('Developer Hub'), '/dashboard/developer/docs')).toBe(false);
    expect(isNavItemActive(item('API Docs'), '/dashboard/developer/docs')).toBe(true);
  });
});
