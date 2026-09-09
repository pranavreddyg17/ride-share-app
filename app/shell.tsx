'use client';
import Link from 'next/link';
import {
  Clock as ClockIcon,
  CarFront,
  Users,
  ChevronRight,
  GraduationCap,
  CircleUserRound,
  CalendarDays,
} from 'lucide-react';
import { ADMIN_NAV } from '@/lib/navigation';
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import type { ReactNode } from 'react';
export const sections = ADMIN_NAV;
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">ky.</span>
      <div>
        <strong>Kinetic Youth</strong>
      </div>
    </div>
  );
}
export function Avatar({ name, alt = false }: { name: string; alt?: boolean }) {
  return (
    <span className={`avatar ${alt ? 'alt' : ''}`}>
      {name
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')}
    </span>
  );
}
export function Badge({ value }: { value: string }) {
  const names: Record<string, string> = {
    pending: 'Pending',
    accepted: 'Confirmed',
    arrived: 'At pickup',
    in_progress: 'In progress',
    completed: 'Completed',
    cancelled: 'Cancelled',
    approved: 'Approved',
    review: 'Under review',
    suspended: 'Suspended',
  };
  return (
    <span
      className={`badge ${['approved', 'completed'].includes(value) ? 'green' : ['in_progress'].includes(value) ? 'teal' : ['pending', 'review', 'arrived'].includes(value) ? 'amber' : value === 'suspended' || value === 'cancelled' ? 'red' : 'blue'}`}
    >
      <i className="dot" />
      {names[value] ?? value}
    </span>
  );
}
function Navigation({
  page,
  onNavigate,
  counts,
}: {
  page: string;
  onNavigate: (p: string) => void;
  counts: Record<string, number>;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <nav aria-label="Coordinator navigation">
      {['Operations', 'Registers', 'Workspace'].map((group) => (
        <div className="nav-section" key={group}>
          <p className="nav-section-label">{group}</p>
          <SidebarMenu className="nav-items">
            {sections
              .filter((s) => s.group === group)
              .map((s) => (
                <SidebarMenuItem key={s.id}>
                  <SidebarMenuButton
                    isActive={page === s.id}
                    aria-current={page === s.id ? 'page' : undefined}
                    onClick={() => {
                      onNavigate(s.id);
                      setOpenMobile(false);
                    }}
                  >
                    <span className="nav-index" aria-hidden="true">
                      {s.code}
                    </span>
                    <span>{s.label}</span>
                    {!!counts[s.id] && (
                      <b className="nav-badge">{counts[s.id]}</b>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
          </SidebarMenu>
        </div>
      ))}
    </nav>
  );
}
export function Shell({
  children,
  page,
  onNavigate,
  role = 'admin',
  name = '',
  demo = true,
  counts = {},
  roleControl,
}: {
  children: ReactNode;
  page: string;
  onNavigate: (p: string) => void;
  role?: string;
  name?: string;
  demo?: boolean;
  counts?: Record<string, number>;
  roleControl?: ReactNode;
}) {
  if (role !== 'admin')
    return (
      <div className="consumer-shell">
        <header className="consumer-header">
          <button
            className="consumer-brand"
            onClick={() => onNavigate('overview')}
            aria-label="Kinetic Youth home"
          >
            <span>ky</span>kinetic youth
          </button>
          <nav className="consumer-nav" aria-label="Main navigation">
            {(role === 'driver'
              ? [
                  { id: 'overview', label: 'Drive', I: CarFront },
                  { id: 'rides', label: 'Activity', I: ClockIcon },
                  {
                    id: 'availability',
                    label: 'Availability',
                    I: CalendarDays,
                  },
                  { id: 'profile', label: 'Account', I: Users },
                  { id: 'hours', label: 'Service hours', I: GraduationCap },
                ]
              : [
                  { id: 'overview', label: 'Ride', I: CarFront },
                  { id: 'rides', label: 'Activity', I: ClockIcon },
                  { id: 'family', label: 'Family', I: Users },
                ]
            ).map((n) => (
              <button
                key={n.id}
                className={page === n.id ? 'active' : ''}
                aria-current={page === n.id ? 'page' : undefined}
                onClick={() => onNavigate(n.id)}
              >
                <n.I size={17} />
                {n.label}
              </button>
            ))}
          </nav>
          <div className="consumer-account">
            <Link href="/login" aria-label="Account">
              <Avatar name={name} />
            </Link>
          </div>
        </header>
        {demo && (
          <div className="preview-toolbar">
            <span>PRACTICE</span>
            <span className="preview-explainer">Fictional people & rides</span>
            <div>{roleControl}</div>
          </div>
        )}
        <main
          className={`consumer-main ${page === 'overview' || page === 'rides' ? 'map-capable' : ''}`}
        >
          {children}
        </main>
      </div>
    );
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '224px' } as React.CSSProperties}
    >
      <Sidebar>
        <SidebarHeader style={{ padding: 0 }}>
          <Brand />
        </SidebarHeader>
        <SidebarContent>
          <Navigation {...{ page, onNavigate, counts }} />
        </SidebarContent>
        <SidebarFooter style={{ padding: 0 }}>
          <div className="side-person">
            <Avatar name={name} />
            <div style={{ flex: 1 }}>
              <strong>{name}</strong>
              <small>
                {role === 'admin'
                  ? 'Pilot coordinator'
                  : role === 'driver'
                    ? 'Volunteer driver'
                    : 'Parent / guardian'}
              </small>
            </div>
            <Link href="/login" aria-label="Account and sign in">
              <CircleUserRound size={18} />
            </Link>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <div className="breadcrumb">
            <SidebarTrigger className="mobile-menu" />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong style={{ fontWeight: 500 }}>
              {sections.find((s) => s.id === page)?.label ??
                (page === 'availability'
                  ? 'My availability'
                  : page === 'profile'
                    ? 'Driver profile'
                    : 'My family')}
            </strong>
          </div>
          <div className="top-actions">
            {demo && <span className="practice-label">Practice</span>}
            {roleControl}
          </div>
        </header>
        <div className="page-wrap">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
