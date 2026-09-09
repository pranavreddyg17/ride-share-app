import type { Role } from './types';

export const ADMIN_NAV = [
  { id: 'overview', label: 'Dispatch', group: 'Operations', code: '01' },
  { id: 'rides', label: 'Ride ledger', group: 'Operations', code: '02' },
  { id: 'hours', label: 'Service hours', group: 'Operations', code: '03' },
  { id: 'safety', label: 'Help & activity', group: 'Operations', code: '04' },
  { id: 'drivers', label: 'Drivers', group: 'Registers', code: '05' },
  { id: 'families', label: 'Families', group: 'Registers', code: '06' },
  { id: 'anchors', label: 'Meeting points', group: 'Registers', code: '07' },
  { id: 'settings', label: 'Settings', group: 'Workspace', code: '08' },
] as const;

const pages: Record<Role, readonly string[]> = {
  admin: ADMIN_NAV.map((item) => item.id),
  driver: ['overview', 'rides', 'availability', 'profile', 'safety', 'hours'],
  family: ['overview', 'rides', 'family', 'anchors', 'safety'],
};
export function visiblePage(page: string, role: Role): string {
  const canonical =
    page === 'reports' ? 'rides' : page === 'audit' ? 'settings' : page;
  return pages[role].includes(canonical) ? canonical : 'overview';
}
