'use client';
import { useState } from 'react';
import { ChevronRight as ChevronIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus,
  ArrowLeft,
  ShieldCheck,
  MapPin,
  Phone,
  AlertCircle,
  CarFront,
  Star,
  ArrowRight,
} from 'lucide-react';
import { Heading, type ViewProps } from './dashboard';
import { Badge, Avatar } from './shell';
import { EmptyState } from './controls';
import { RideMap } from './ride-map';
import { TripScreen } from './consumer';
import { type Ride, time, date } from '@/lib/types';
import type { Commit } from './dialogs';
import { RideLedger, RideFacts } from './service-hours';
export function Rides({
  state,
  open,
  navigate,
  selected,
  commit,
}: { selected?: string; commit: Commit } & ViewProps) {
  const [filter, setFilter] = useState('upcoming');
  const ride = state.rides.find((r) => r.id === selected);
  const list = state.rides
    .filter(
      (r) =>
        filter === 'all' ||
        (filter === 'history'
          ? ['completed', 'cancelled'].includes(r.status)
          : !['completed', 'cancelled'].includes(r.status)),
    )
    .sort((a, b) =>
      filter === 'history'
        ? b.scheduledAt.localeCompare(a.scheduledAt)
        : a.scheduledAt.localeCompare(b.scheduledAt),
    );
  if (selected && !ride)
    return (
      <>
        <button className="text-link" onClick={() => navigate('rides')}>
          <ArrowLeft />
          All rides
        </button>
        <EmptyState
          title="Ride unavailable"
          description="This ride does not exist or is not assigned to your account."
        />
      </>
    );
  if (ride && state.role !== 'admin')
    return (
      <TripScreen {...{ state, open, navigate, ride, commit }} key={ride.id} />
    );
  if (ride)
    return (
      <RideDetail {...{ state, open, navigate, ride, commit }} key={ride.id} />
    );
  if (state.role === 'admin')
    return <RideLedger {...{ state, open, navigate }} />;
  return (
    <>
      <Heading
        title="Your activity"
        description="Upcoming and completed rides."
      >
        {state.role === 'family' && (
          <button className="btn primary" onClick={() => navigate('overview')}>
            <Plus />
            {state.rides.some(
              (r) => !['completed', 'cancelled'].includes(r.status),
            )
              ? 'Current ride'
              : 'Request a ride'}
          </button>
        )}
      </Heading>
      <div className="toolbar">
        <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
          <TabsList style={{ height: 42 }}>
            <TabsTrigger value="upcoming" style={{ padding: '8px 16px' }}>
              Upcoming
            </TabsTrigger>
            <TabsTrigger value="history" style={{ padding: '8px 16px' }}>
              Past rides
            </TabsTrigger>
            <TabsTrigger value="all" style={{ padding: '8px 16px' }}>
              All
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="consumer-ride-list">
        {list.map((r) => (
          <button
            className="consumer-ride-card"
            key={r.id}
            onClick={() => navigate('rides', r.id)}
          >
            <header>
              <span className="place-icon">
                <CarFront />
              </span>
              <div>
                <h3>{r.activity}</h3>
                <small>
                  {date(r.scheduledAt)} · {time(r.scheduledAt)} CT
                </small>
              </div>
              <ChevronIcon />
            </header>
            <div className="compact-route">
              <div>
                <i className="route-dot" />
                {r.pickupSnapshot?.name ??
                  state.anchors.find((a) => a.id === r.pickupId)?.name}
              </div>
              <div>
                <i className="route-square" />
                {r.dropoffSnapshot?.name ??
                  state.anchors.find((a) => a.id === r.dropoffId)?.name}
              </div>
            </div>
            <footer>
              <Badge value={r.status} />
              <span>
                {r.driverSnapshot?.name ??
                  state.drivers.find((d) => d.id === r.driverId)?.name ??
                  (r.status === 'cancelled'
                    ? 'Unassigned'
                    : 'Awaiting assignment')}
              </span>
            </footer>
          </button>
        ))}
      </div>
      {!list.length && (
        <EmptyState
          title="No rides here yet"
          description="Scheduled rides appear here."
        />
      )}
    </>
  );
}
function RideDetail({
  state,
  ride,
  open,
  navigate,
  commit,
}: ViewProps & { ride: Ride; commit: Commit }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [route, setRoute] = useState<{ distance: number; duration: number } | null>(
      null,
    );
  const driver = ride.driverId
      ? {
          ...state.drivers.find((d) => d.id === ride.driverId),
          ...ride.driverSnapshot,
        }
      : undefined,
    family = {
      ...state.families.find((f) => f.id === ride.familyId),
      ...ride.familySnapshot,
    },
    pickup =
      ride.pickupSnapshot ?? state.anchors.find((a) => a.id === ride.pickupId),
    dropoff =
      ride.dropoffSnapshot ??
      state.anchors.find((a) => a.id === ride.dropoffId);
  const status = ride.status;
  const terminal = ['completed', 'cancelled'].includes(status);
  const stale =
    !ride.locationAt || Date.now() - Date.parse(ride.locationAt) > 45000;
  async function action(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      await commit({ op: 'ride.action', id: ride.id, action, ...extra });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="text-link"
        style={{ marginBottom: 20 }}
        onClick={() => navigate('rides')}
      >
        <ArrowLeft />
        Back to rides
      </button>
      <Heading
        title={ride.activity}
        description={`${ride.id} · ${family?.student ?? 'Student'} · ${date(ride.scheduledAt)} at ${time(ride.scheduledAt)} Central`}
      >
        <Badge value={status} />
        {!terminal && (
          <button
            className="btn danger"
            onClick={() => open({ kind: 'help', ride })}
          >
            <ShieldCheck />
            Get help
          </button>
        )}
      </Heading>
      <div className="journey">
        <div>
          <RideFacts ride={ride} />
          {ride.status === 'completed' && (
            <div className="section-foot">
              <span>
                Service credit is reviewed separately from recorded trip time.
              </span>
              <button className="text-link" onClick={() => navigate('hours')}>
                Review service hours
                <ArrowRight size={15} />
              </button>
            </div>
          )}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Route</h2>
                <p>
                  {route
                    ? `${(route.distance / 1609.344).toFixed(1)} mi · about ${Math.ceil(route.duration / 60)} min driving`
                    : 'Pickup and destination'}
                </p>
              </div>
              <span
                className={`badge ${state.demo ? 'amber' : stale ? 'amber' : 'green'}`}
              >
                {state.demo
                  ? 'Practice route'
                  : terminal
                    ? 'Trip closed'
                    : stale
                      ? 'GPS not current'
                      : 'Recent GPS update'}
              </span>
            </div>
            <RideMap
              anchors={state.anchors}
              ride={ride}
              role={state.role}
              demo={state.demo}
              onRoute={setRoute}
            />
            <div className="map-foot">
              <span>
                {state.demo
                  ? 'Practice workspace'
                  : ride.locationAt
                    ? `Last reported ${time(ride.locationAt)}`
                    : 'No GPS position received'}
              </span>
              <span>
                {state.demo ? 'Practice route estimate' : 'Road route estimate'}
              </span>
            </div>
          </section>
          <section className="panel" style={{ marginTop: 20 }}>
            <div className="panel-heading">
              <h2>Meeting points</h2>
              <MapPin size={18} />
            </div>
            <div className="detail-body">
              <div
                className="queue-route"
                style={{ fontSize: 14, gap: '8px 15px' }}
              >
                <i className="route-dot" />
                <div>
                  <strong>{pickup?.name}</strong>
                  <p
                    className="muted"
                    style={{ fontSize: 13, margin: '4px 0 8px' }}
                  >
                    {pickup?.address}
                    <br />
                    {pickup?.notes}
                  </p>
                </div>
                <i className="route-square" />
                <div>
                  <strong>{dropoff?.name}</strong>
                  <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                    {dropoff?.address}
                    <br />
                    {dropoff?.notes}
                  </p>
                </div>
              </div>
              {ride.notes && (
                <div className="notice" style={{ marginTop: 17 }}>
                  {ride.notes}
                </div>
              )}
            </div>
          </section>
        </div>
        <div>
          <section className="panel">
            <div className="panel-heading">
              <h2>{driver ? 'Assigned driver' : 'Driver assignment'}</h2>
              <CarFront size={19} />
            </div>
            <div className="detail-body">
              {driver ? (
                <>
                  <div className="name-cell">
                    <Avatar name={driver.name ?? 'Driver'} />
                    <div>
                      <strong>{driver.name}</strong>
                      <small>{driver.school}</small>
                    </div>
                  </div>
                  <div className="detail-pair">
                    <span>Vehicle</span>
                    {driver.vehicle}
                  </div>
                  <div className="detail-pair">
                    <span>License plate</span>
                    <strong>{driver.plate}</strong>
                  </div>
                  <div className="detail-pair">
                    <span>Student</span>
                    {family?.student}
                  </div>
                  {driver.phone && (
                    <a
                      href={`tel:${driver.phone}`}
                      className="text-link"
                      style={{ marginTop: 14 }}
                    >
                      <Phone size={14} />
                      Call driver
                    </a>
                  )}
                </>
              ) : (
                <p className="muted" style={{ fontSize: 14, lineHeight: 1.7 }}>
                  Assign an approved driver to this request.
                </p>
              )}
              {['pending', 'accepted'].includes(status) && (
                <button
                  className="btn primary"
                  style={{ width: '100%', marginTop: 17 }}
                  onClick={() => open({ kind: 'assign', ride })}
                >
                  {driver ? 'Reassign driver' : 'Assign a driver'}
                </button>
              )}
            </div>
          </section>
          <section className="panel" style={{ marginTop: 20 }}>
            <div className="panel-heading">
              <h2>Family contact</h2>
            </div>
            <div className="detail-body">
              <div className="detail-pair">
                <span>Student</span>
                <strong>{family.student}</strong>
              </div>
              <div className="detail-pair">
                <span>Guardian</span>
                {family.guardian}
              </div>
              {family.phone && (
                <a className="text-link" href={`tel:${family.phone}`}>
                  <Phone size={14} />
                  {family.phone}
                </a>
              )}
            </div>
          </section>
          {(!terminal || !!ride.rating || !!ride.cancelReason) && (
            <section className="panel" style={{ marginTop: 20 }}>
              <div className="panel-heading">
                <h2>{terminal ? 'Ride outcome' : 'Ride actions'}</h2>
              </div>
              <div className="detail-body">
                {status === 'cancelled' && (
                  <div className="notice warning" style={{ marginTop: 10 }}>
                    Cancelled: {ride.cancelReason}
                  </div>
                )}
                {status === 'arrived' && (
                  <button
                    className="btn"
                    style={{ width: '100%', marginTop: 15 }}
                    disabled={busy}
                    onClick={() => action('refresh-code')}
                  >
                    <ShieldCheck />
                    Issue new pickup code
                  </button>
                )}
                {status === 'in_progress' && (
                  <details className="completion-exception">
                    <summary>Driver unable to finish the ride?</summary>
                    <button
                      className="btn"
                      style={{ width: '100%', marginTop: 15 }}
                      disabled={busy}
                      onClick={() => open({ kind: 'admin-complete', ride })}
                    >
                      <ShieldCheck />
                      Record verified drop-off
                    </button>
                    <p className="fine-print">
                      Recovery only: confirm the student arrived before closing
                      a ride without driver GPS.
                    </p>
                  </details>
                )}
                {ride.rating && (
                  <div className="notice" style={{ marginTop: 15 }}>
                    <Star />
                    {ride.rating}/5{ride.feedback ? ` · ${ride.feedback}` : ''}
                  </div>
                )}
                {error && (
                  <p role="alert" className="error-message">
                    {error}
                  </p>
                )}
                {busy && (
                  <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
                    Updating ride…
                  </p>
                )}
                {['pending', 'accepted', 'arrived'].includes(status) && (
                  <button
                    className="text-link"
                    style={{ color: '#696969', marginTop: 18 }}
                    disabled={busy}
                    onClick={() => open({ kind: 'cancel', ride })}
                  >
                    Cancel ride
                  </button>
                )}
              </div>
            </section>
          )}
          {!terminal && !state.demo && stale && (
            <div className="notice warning" style={{ marginTop: 18 }}>
              <AlertCircle />
              Driver location is not current. A map marker may show an older
              position; contact the driver or coordinator if needed.
            </div>
          )}
          {state.settings.contactPhone && (
            <a
              className="btn"
              style={{ width: '100%', marginTop: 18 }}
              href={`tel:${state.settings.contactPhone}`}
            >
              <Phone />
              Call pilot coordinator
            </a>
          )}
        </div>
      </div>
    </>
  );
}
