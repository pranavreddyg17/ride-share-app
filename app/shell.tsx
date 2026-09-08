'use client';
import Link from 'next/link';
import {
  Clock as ClockIcon,
  LayoutDashboard,
  Route,
  CarFront,
  Users,
  MapPin,
  ShieldCheck,
  Settings2,
  ChevronRight,
  FileSpreadsheet,
  ListFilter,
  GraduationCap,
  LogOut,
} from 'lucide-react';
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
export const sections = [
  { id: 'overview', label: 'Dispatch', icon: LayoutDashboard },
  { id: 'rides', label: 'Rides', icon: Route },
  { id: 'drivers', label: 'Driver register', icon: CarFront },
  { id: 'families', label: 'Families', icon: Users },
  { id: 'anchors', label: 'Anchor locations', icon: MapPin },
  { id: 'safety', label: 'Safety & activity', icon: ShieldCheck },
  { id: 'settings', label: 'Pilot settings', icon: Settings2 },
  { id: 'hours', label: 'Service hours', icon: GraduationCap },
  { id: 'reports', label: 'Reports & exports', icon: FileSpreadsheet },
  { id: 'audit', label: 'Request logs', icon: ListFilter },
];
export function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark">ky.</span>
      <div>
        <strong>Kinetic Youth</strong>
        <small>TRANSPORTATION / SERVICE</small>
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
  role,
  counts,
}: {
  page: string;
  onNavigate: (p: string) => void;
  role: string;
  counts: Record<string, number>;
}) {
  const { setOpenMobile } = useSidebar();
  const opts =
    role === 'admin'
      ? [
          sections[0],
          sections[1],
          sections[7],
          sections[8],
          sections[2],
          sections[3],
          sections[4],
          sections[5],
          sections[9],
          sections[6],
        ]
      : role === 'driver'
        ? [
            sections[0],
            { ...sections[1], label: 'My rides' },
            {
              id: 'availability',
              label: 'My availability',
              icon: GraduationCap,
            },
            { id: 'profile', label: 'Driver profile', icon: CarFront },
            sections[7],
            sections[5],
          ]
        : [
            sections[0],
            { ...sections[1], label: 'My rides' },
            { id: 'family', label: 'My family', icon: Users },
            sections[4],
            sections[5],
          ];
  return (
    <SidebarMenu className="nav-items">
      {opts.map((s) => (
        <SidebarMenuItem key={s.id}>
          <SidebarMenuButton
            isActive={page === s.id}
            onClick={() => {
              onNavigate(s.id);
              setOpenMobile(false);
            }}
          >
            <s.icon />
            <span>{s.label}</span>
            {!!counts[s.id] && <b className="nav-badge">{counts[s.id]}</b>}
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  );
}
export function Shell({
  children,
  page,
  onNavigate,
  role = 'admin',
  name = 'Alex Morgan',
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
  completed?: number;
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
                    I: GraduationCap,
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
          <div className="pilot-place">
            <MapPin size={18} />
            <div>
              North Texas<small>Community pilot</small>
            </div>
            <ChevronRight size={15} />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <p className="nav-label">
            {role === 'admin'
              ? 'OPERATIONS'
              : role === 'driver'
                ? 'DRIVER WORKSPACE'
                : 'FAMILY WORKSPACE'}
          </p>
          <Navigation {...{ page, onNavigate, role, counts }} />
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
              <LogOut size={16} />
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
            {demo && (
              <span className="practice-label">
                Practice mode · sample data
              </span>
            )}
            {roleControl}
            <Avatar name={name} />
          </div>
        </header>
        <div className="page-wrap">
          {children}
          <footer className="screen-footer">
            <span>© 2026 Kinetic Youth · North Texas</span>
            <span>Times shown in Central Time</span>
          </footer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
