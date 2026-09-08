'use client';
import {
  CarFront,
  Route,
  Users,
  ShieldCheck,
  Plus,
  ArrowRight,
  Clock,
  CalendarDays,
  ArrowUpRight,
  Check,
  MapPin,
  Play,
  GraduationCap,
} from 'lucide-react';
import { Avatar, Badge } from './shell';
import { RideMap } from './ride-map';
import { EmptyState } from './controls';
import { type State, type Ride, time, date, dateKey } from '@/lib/types';
import type { Modal } from './dialogs';
export type ViewProps = {
  state: State;
  open: (m: Modal) => void;
  navigate: (p: string, id?: string) => void;
};
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function RideQueue({
  ride,
  state,
  onOpen,
}: {
  ride: Ride;
  state: State;
  onOpen: () => void;
}) {
  const f = state.families.find((f) => f.id === ride.familyId),
    d = state.drivers.find((d) => d.id === ride.driverId);
  return (
    <button
      className="queue-card"
      style={{
        display: 'block',
        width: '100%',
        background: 'transparent',
        textAlign: 'left',
        borderLeft: 0,
        borderRight: 0,
        borderBottom: 0,
      }}
      onClick={onOpen}
    >
      <div className="queue-head">
        <strong>
          {time(ride.scheduledAt)}{' '}
          <span className="muted" style={{ fontWeight: 400, fontSize: 11 }}>
            {date(ride.scheduledAt)}
          </span>
        </strong>
        <Badge value={ride.status} />
      </div>
      <div className="queue-route">
        <i className="route-dot" />
        <span>{state.anchors.find((a) => a.id === ride.pickupId)?.name}</span>
        <i className="route-square" />
        <span>{state.anchors.find((a) => a.id === ride.dropoffId)?.name}</span>
      </div>
      <div className="queue-person">
        <span>
          <Avatar name={f?.student ?? 'Student'} />
          {f?.student ?? 'Student'}
        </span>
        <span>
          {d?.name.split(' ')[0] ?? 'Needs driver'}
          <ArrowUpRight size={14} />
        </span>
      </div>
    </button>
  );
}
export function Dashboard({ state, open, navigate }: ViewProps) {
  const today = state.rides.filter(
    (r) => dateKey(r.scheduledAt) === dateKey(state.serverTime),
  );
  const activeRides = state.rides.filter(
    (r) => r.status === 'in_progress' || r.status === 'arrived',
  );
  const pendingDrivers = state.drivers.filter((d) => d.status === 'review');
  const upcoming = state.rides
    .filter(
      (r) => !['completed', 'cancelled', 'in_progress'].includes(r.status),
    )
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const completed = state.rides.filter((r) => r.status === 'completed');
  const liveRide =
    activeRides[0] ?? upcoming.find((r) => r.driverId) ?? upcoming[0];
  const stats =
    state.role === 'admin'
      ? [
          {
            label: 'Rides today',
            n: today.length,
            sub: `${today.filter((r) => r.status === 'completed').length} completed today`,
            I: Route,
          },
          {
            label: 'Active rides',
            n: activeRides.length,
            sub: state.demo ? 'Practice journeys' : 'At pickup or on the road',
            I: CarFront,
          },
          {
            label: 'Approved drivers',
            n: state.drivers.filter((d) => d.status === 'approved').length,
            sub: `${pendingDrivers.length} awaiting your review`,
            I: ShieldCheck,
          },
          {
            label: 'Pilot families',
            n: state.families.length,
            sub: 'Connected to the community',
            I: Users,
          },
        ]
      : [
          {
            label: 'Upcoming rides',
            n: upcoming.length,
            sub: 'A little planning goes a long way',
            I: CalendarDays,
          },
          {
            label: 'Active rides',
            n: activeRides.length,
            sub: 'Follow the journey below',
            I: CarFront,
          },
          {
            label: 'Completed rides',
            n: completed.length,
            sub: 'More doors opened',
            I: Route,
          },
          {
            label:
              state.role === 'driver' ? 'Volunteer hours' : 'Linked students',
            n:
              state.role === 'driver'
                ? (state.drivers[0]?.hours ?? 0).toFixed(1)
                : state.families.length,
            sub:
              state.role === 'driver'
                ? 'From completed ride times'
                : 'Your family, connected',
            I: GraduationCap,
          },
        ];
  return (
    <>
      <Heading
        title={
          state.role === 'admin'
            ? 'Pilot overview'
            : state.role === 'driver'
              ? `Your next good turn, ${state.name.split(' ')[0]}.`
              : `Let’s get there, ${state.name.split(' ')[0]}.`
        }
        description={
          state.role === 'admin'
            ? 'Keep your community moving, one coordinated ride at a time.'
            : state.role === 'driver'
              ? 'Your schedule, your rides, and the students counting on you.'
              : 'Plan a ride and stay connected through every step of the journey.'
        }
      >
        {state.demo && (
          <button className="btn" onClick={() => open({ kind: 'tour' })}>
            <Play />
            Try the ride flow
          </button>
        )}
        {state.role !== 'driver' && (
          <button
            className="btn primary"
            onClick={() => open({ kind: 'ride' })}
          >
            <Plus />
            {state.role === 'family' ? 'Request a ride' : 'Schedule a ride'}
          </button>
        )}
      </Heading>
      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-top">
              {s.label}
              <span className="stat-icon">
                <s.I />
              </span>
            </div>
            <div className="stat-value">{s.n}</div>
            <div className="stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>
      {state.role === 'driver' && state.drivers[0]?.status !== 'approved' && (
        <div className="notice warning" style={{ marginBottom: 22 }}>
          <ShieldCheck />
          Your profile needs coordinator review before you can accept rides.{' '}
          <button className="text-link" onClick={() => navigate('profile')}>
            View profile
          </button>
        </div>
      )}
      <div className="dash-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                {activeRides.length
                  ? 'On the move'
                  : 'Your community, connected'}
              </h2>
              <p>Flower Mound & the surrounding community</p>
            </div>
            {liveRide ? (
              <button
                className="text-link"
                onClick={() => navigate('rides', liveRide.id)}
              >
                View ride
                <ArrowUpRight />
              </button>
            ) : (
              <span className="badge teal">Community map</span>
            )}
          </div>
          <RideMap
            anchors={state.anchors}
            ride={liveRide}
            demo={state.demo}
            role={state.role}
          />
          <div className="map-foot">
            <span>
              <i className="dot" style={{ color: '#169682' }} />
              {state.demo
                ? 'Sample position · practice ride'
                : liveRide?.locationAt
                  ? `Last GPS update ${time(liveRide.locationAt)}`
                  : 'Waiting for driver location'}
            </span>
            <span>
              <MapPin size={12} />
              North Texas
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Coming up next</h2>
              <p>
                {upcoming.length} upcoming{' '}
                {upcoming.length === 1 ? 'ride' : 'rides'}
              </p>
            </div>
            <Clock size={17} color="#7f95a0" />
          </div>
          <div className="ride-queue">
            {upcoming.slice(0, 2).map((r) => (
              <RideQueue
                key={r.id}
                ride={r}
                state={state}
                onOpen={() => navigate('rides', r.id)}
              />
            ))}
            {!upcoming.length && (
              <EmptyState
                title="A clear schedule"
                description="Your upcoming rides will appear here."
              />
            )}
          </div>
          <div style={{ padding: '15px 21px', borderTop: '1px solid #e7edf0' }}>
            <button className="text-link" onClick={() => navigate('rides')}>
              View all rides
              <ArrowRight />
            </button>
          </div>
        </section>
      </div>
      <div className="bottom-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              {state.role === 'admin' ? 'Driver approvals' : 'Recent rides'}{' '}
              {state.role === 'admin' && pendingDrivers.length > 0 && (
                <span className="badge amber" style={{ marginLeft: 6 }}>
                  {pendingDrivers.length}
                </span>
              )}
            </h2>
            <button
              className="text-link"
              onClick={() =>
                navigate(state.role === 'admin' ? 'drivers' : 'rides')
              }
            >
              {state.role === 'admin' ? 'View register' : 'Ride history'}
              <ArrowRight />
            </button>
          </div>
          {state.role === 'admin'
            ? pendingDrivers.slice(0, 2).map((d) => (
                <div className="approval-row" key={d.id}>
                  <Avatar name={d.name} alt />
                  <div>
                    <strong>{d.name}</strong>
                    <p>{d.school} · Application submitted</p>
                  </div>
                  <button
                    className="btn small"
                    onClick={() => open({ kind: 'driver', driver: d })}
                  >
                    Review
                  </button>
                </div>
              ))
            : completed.slice(0, 2).map((r) => (
                <div className="approval-row" key={r.id}>
                  <span className="stat-icon">
                    <Check size={18} />
                  </span>
                  <div>
                    <strong>{r.activity}</strong>
                    <p>
                      {date(r.scheduledAt)} ·{' '}
                      {state.anchors.find((a) => a.id === r.dropoffId)?.name}
                    </p>
                  </div>
                  <button
                    className="btn small"
                    onClick={() => navigate('rides', r.id)}
                  >
                    Details
                  </button>
                </div>
              ))}
          {((state.role === 'admin' && !pendingDrivers.length) ||
            (state.role !== 'admin' && !completed.length)) && (
            <EmptyState
              title={
                state.role === 'admin'
                  ? 'All caught up'
                  : 'Your journey starts here'
              }
              description={
                state.role === 'admin'
                  ? 'New driver applications will appear here for review.'
                  : 'Completed trips will be saved in your ride history.'
              }
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Latest activity</h2>
            <button className="text-link" onClick={() => navigate('safety')}>
              View all
              <ArrowRight />
            </button>
          </div>
          {state.events.slice(0, 3).map((e) => (
            <div className="activity" key={e.id}>
              <span className="event-icon">
                {e.kind === 'driver' ? <ShieldCheck /> : <Route />}
              </span>
              <div style={{ lineHeight: 1.5 }}>
                {e.message}
                <small>
                  {date(e.createdAt)} · {time(e.createdAt)}
                </small>
              </div>
            </div>
          ))}
          {!state.events.length && (
            <div className="activity">
              <span className="event-icon">
                <ShieldCheck />
              </span>
              <div>
                Ready when you are.
                <small>Ride updates and help requests will appear here.</small>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
