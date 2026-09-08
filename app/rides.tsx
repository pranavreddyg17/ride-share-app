'use client';
import { watchDevicePosition } from '@/lib/gps';
import { useState, useEffect, useRef } from 'react';
import { ChevronRight as ChevronIcon } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import {
  Plus,
  ArrowLeft,
  ShieldCheck,
  MapPin,
  Navigation,
  Check,
  Phone,
  AlertCircle,
  CarFront,
  Star,
  Radio,
  Square,
  ArrowRight,
} from 'lucide-react';
import { Heading, type ViewProps } from './dashboard';
import { Badge, Avatar } from './shell';
import { EmptyState } from './controls';
import { RideMap } from './ride-map';
import { TripScreen } from './consumer';
import { type Ride, time, date, active } from '@/lib/types';
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
            Plan a ride
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
                {state.anchors.find((a) => a.id === r.pickupId)?.name}
              </div>
              <div>
                <i className="route-square" />
                {state.anchors.find((a) => a.id === r.dropoffId)?.name}
              </div>
            </div>
            <footer>
              <Badge value={r.status} />
              <span>
                {state.drivers.find((d) => d.id === r.driverId)?.name ??
                  'Awaiting a match'}
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
  const [otp, setOtp] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [route, setRoute] = useState<{ distance: number; duration: number } | null>(
      null,
    ),
    [sharing, setSharing] = useState(false),
    [gpsError, setGpsError] = useState('');
  const lastPing = useRef(0);
  const driver = state.drivers.find((d) => d.id === ride.driverId),
    family = state.families.find((f) => f.id === ride.familyId),
    pickup =
      ride.pickupSnapshot ?? state.anchors.find((a) => a.id === ride.pickupId),
    dropoff =
      ride.dropoffSnapshot ??
      state.anchors.find((a) => a.id === ride.dropoffId);
  const status = ride.status;
  const terminal = ['completed', 'cancelled'].includes(status);
  const stale =
    !ride.locationAt || Date.now() - Date.parse(ride.locationAt) > 45000;
  const expired =
    !ride.otpExpiresAt || Date.parse(ride.otpExpiresAt) < Date.now();
  const isDriver = state.role === 'driver';
  const currentCommit = useRef(commit);
  currentCommit.current = commit;
  useEffect(() => {
    if (!sharing || !isDriver || terminal) return;
    if (!navigator.geolocation) {
      setGpsError('This browser does not support device location.');
      setSharing(false);
      return;
    }
    const stop = watchDevicePosition(
      navigator.geolocation,
      (position) => {
        if (Date.now() - lastPing.current < 5000) return;
        lastPing.current = Date.now();
        const { latitude, longitude, accuracy } = position.coords;
        currentCommit
          .current({
            op: 'location',
            id: ride.id,
            lat: latitude,
            lng: longitude,
            accuracy,
            source: 'device',
            capturedAt: new Date(position.timestamp).toISOString(),
          })
          .catch((error: Error) => {
            setGpsError(error.message);
            setSharing(false);
          });
      },
      (e) => {
        setGpsError(
          e.code === 1
            ? 'Location permission was denied. Allow location for this site, then try again.'
            : 'A GPS fix is unavailable. Move to an open area and try again.',
        );
        setSharing(false);
      },
    );
    return stop;
  }, [sharing, isDriver, terminal, ride.id, state.demo, state.role]);
  async function action(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      await commit({ op: 'ride.action', id: ride.id, action, ...extra });
      setOtp('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const stage = [
    'pending',
    'accepted',
    'arrived',
    'in_progress',
    'completed',
  ].indexOf(status);
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
          {state.role === 'admin' && ride.status === 'completed' && (
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
                  ? 'Sample position · not a live vehicle'
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
              {isDriver && !terminal && (
                <div style={{ marginTop: 20 }}>
                  <a
                    className="btn"
                    target="_blank"
                    rel="noreferrer"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${status === 'in_progress' ? dropoff?.lat : pickup?.lat},${status === 'in_progress' ? dropoff?.lng : pickup?.lng}&travelmode=driving`}
                  >
                    <Navigation />
                    Open driving directions
                  </a>
                  <p className="muted" style={{ fontSize: 12, marginTop: 9 }}>
                    Set up navigation while parked.
                  </p>
                </div>
              )}
            </div>
          </section>
        </div>
        <div>
          <section className="panel">
            <div className="panel-heading">
              <h2>{driver ? 'Your driver' : 'Matching a driver'}</h2>
              <CarFront size={19} />
            </div>
            <div className="detail-body">
              {driver ? (
                <>
                  <div className="name-cell">
                    <Avatar name={driver.name} />
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
                  {!isDriver && (
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
                  Your coordinator will assign a reviewed driver. Check back
                  here for confirmation.
                </p>
              )}
              {state.role === 'admin' &&
                ['pending', 'accepted'].includes(status) && (
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
              <h2>Every step, together</h2>
            </div>
            <div className="detail-body">
              {[
                'Ride requested',
                'Driver confirmed',
                'Driver at pickup',
                'Pickup code verified',
                'Arrived at destination',
              ].map((name, i) => (
                <div
                  key={name}
                  className={`step-line ${stage >= i ? 'done' : ''}`}
                  style={{ padding: '10px 0' }}
                >
                  {stage >= i ? (
                    <Check />
                  ) : (
                    <span
                      style={{
                        border: '1px solid #e0e0e0',
                        width: 19,
                        height: 19,
                        borderRadius: '50%',
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div>
                    {name}
                    {i === 3 && ride.startedAt && (
                      <small>{time(ride.startedAt)}</small>
                    )}
                    {i === 4 && ride.completedAt && (
                      <small>{time(ride.completedAt)}</small>
                    )}
                  </div>
                </div>
              ))}
              {status === 'cancelled' && (
                <div className="notice warning" style={{ marginTop: 10 }}>
                  Cancelled: {ride.cancelReason}
                </div>
              )}
              {state.role === 'family' && status === 'arrived' && (
                <div
                  style={{
                    marginTop: 18,
                    paddingTop: 18,
                    borderTop: '1px solid #eaeaea',
                  }}
                >
                  <strong style={{ fontSize: 14 }}>Your pickup code</strong>
                  {ride.otp && !expired ? (
                    <>
                      <div className="code-display">
                        {ride.otp.split('').map((v, i) => (
                          <span key={i}>{v}</span>
                        ))}
                      </div>
                      <p
                        className="muted"
                        style={{ fontSize: 12, lineHeight: 1.6 }}
                      >
                        Give this code to your assigned driver at pickup.
                        Expires in{' '}
                        {Math.max(
                          0,
                          Math.ceil(
                            (Date.parse(ride.otpExpiresAt!) - Date.now()) /
                              60000,
                          ),
                        )}{' '}
                        min.
                      </p>
                    </>
                  ) : (
                    <p className="error-message">
                      The code expired. Contact the coordinator for a new code.
                    </p>
                  )}
                </div>
              )}
              {isDriver && !terminal && (
                <div
                  style={{
                    marginTop: 17,
                    paddingTop: 17,
                    borderTop: '1px solid #ececec',
                  }}
                >
                  {status === 'pending' && (
                    <button
                      className="btn primary"
                      style={{ width: '100%' }}
                      disabled={busy || driver?.status !== 'approved'}
                      onClick={() => action('accept')}
                    >
                      Confirm this ride
                      <Check />
                    </button>
                  )}
                  {status === 'accepted' && (
                    <button
                      className="btn primary"
                      style={{ width: '100%' }}
                      disabled={busy}
                      onClick={() => action('arrive')}
                    >
                      <MapPin />
                      I’ve arrived at pickup
                    </button>
                  )}
                  {status === 'arrived' && (
                    <>
                      <label
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          display: 'block',
                          marginBottom: 12,
                        }}
                        htmlFor="pickup-otp"
                      >
                        Ask the family for their pickup code
                      </label>
                      <InputOTP
                        id="pickup-otp"
                        maxLength={6}
                        pattern="^[0-9]+$"
                        value={otp}
                        onChange={setOtp}
                        disabled={busy || ride.otpAttempts >= 5 || expired}
                      >
                        <InputOTPGroup>
                          {Array.from({ length: 6 }, (_, i) => (
                            <InputOTPSlot
                              key={i}
                              index={i}
                              className="h-11 w-10 text-lg"
                            />
                          ))}
                        </InputOTPGroup>
                      </InputOTP>
                      <button
                        className="btn primary"
                        style={{ width: '100%', marginTop: 14 }}
                        onClick={() => action('verify', { otp })}
                        disabled={
                          otp.length !== 6 ||
                          busy ||
                          expired ||
                          ride.otpAttempts >= 5
                        }
                      >
                        <ShieldCheck />
                        Verify pickup & start
                      </button>
                      {(expired || ride.otpAttempts >= 5) && (
                        <p className="error-message">
                          {expired ? 'Code expired.' : 'Too many attempts.'} Ask
                          the coordinator for a fresh code.
                        </p>
                      )}
                    </>
                  )}
                  {status === 'in_progress' && (
                    <>
                      <button
                        className="btn primary"
                        style={{ width: '100%' }}
                        disabled={busy}
                        onClick={() => action('complete')}
                      >
                        <Check />
                        Confirm drop-off
                      </button>
                      <p
                        className="muted"
                        style={{ fontSize: 12, marginTop: 10, lineHeight: 1.6 }}
                      >
                        {state.demo
                          ? 'Practice mode skips the GPS distance check.'
                          : 'Requires a recent, accurate GPS fix within 200 m of the destination.'}
                      </p>
                    </>
                  )}
                </div>
              )}
              {state.role === 'admin' && status === 'arrived' && (
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
              {status === 'completed' &&
                (ride.rating ? (
                  <div className="notice" style={{ marginTop: 15 }}>
                    <Star fill="#7e7e7e" />
                    {ride.rating}/5 ·{' '}
                    {ride.feedback || 'Thanks for riding with us.'}
                  </div>
                ) : (
                  state.role === 'family' && (
                    <button
                      className="btn primary"
                      style={{ width: '100%', marginTop: 17 }}
                      onClick={() => open({ kind: 'rating', ride })}
                    >
                      <Star />
                      Rate this ride
                    </button>
                  )
                ))}
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
                  {isDriver && status === 'pending'
                    ? 'Decline ride'
                    : 'Cancel ride'}
                </button>
              )}
            </div>
          </section>
          {isDriver && active(status) && (
            <section className="panel" style={{ marginTop: 20 }}>
              <div className="panel-heading">
                <h2>Share your location</h2>
                <Radio size={18} />
              </div>
              <div className="detail-body">
                <p
                  className="muted"
                  style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 15 }}
                >
                  Keep this page open with location permission enabled. Your
                  assigned family and coordinator see updates about every 5
                  seconds.
                </p>
                <button
                  className={`btn ${sharing ? '' : 'primary'}`}
                  style={{ width: '100%' }}
                  onClick={() => {
                    setSharing(!sharing);
                    setGpsError('');
                  }}
                >
                  {sharing ? <Square /> : <Navigation />}
                  {sharing ? 'Stop location sharing' : 'Share device location'}
                </button>
                {gpsError && (
                  <p role="alert" className="error-message">
                    {gpsError}
                  </p>
                )}
                {sharing && !gpsError && (
                  <p className="notice" style={{ marginTop: 12, fontSize: 12 }}>
                    Location sharing is enabled. Waiting for the next GPS fix.
                  </p>
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
