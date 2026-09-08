'use client';
import { postMutation } from '@/lib/client-api';
import { useState, useEffect, useRef } from 'react';
import { watchDevicePosition } from '@/lib/gps';
import {
  CarFront,
  ArrowRight,
  ArrowLeft,
  MapPin,
  ShieldCheck,
  Phone,
  Star,
  Navigation,
  Play,
  Square,
  ChevronRight,
  Check,
  Radio,
  Users,
  ArrowUpRight,
  CalendarDays,
  GraduationCap,
} from 'lucide-react';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { RideMap, type RoadRoute } from './ride-map';
import { Avatar } from './shell';
import { Field } from './controls';
import { type ViewProps } from './dashboard';
import type { Commit } from './dialogs';
import { type Ride, type Anchor, time, date, active } from '@/lib/types';
export type ConsumerProps = ViewProps & { commit: Commit };
function PlacePicker({
  value,
  onChange,
  anchors,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  anchors: Anchor[];
  label: string;
}) {
  const items = anchors.map((a) => ({ value: a.id, label: a.name }));
  return (
    <Combobox
      items={items}
      value={items.find((a) => a.value === value) ?? null}
      onValueChange={(v) => onChange(v?.value ?? '')}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
    >
      <ComboboxInput aria-label={label} placeholder={label} showClear />
      <ComboboxContent>
        <ComboboxEmpty>No registered locations found</ComboboxEmpty>
        <ComboboxList>
          {(item: { value: string; label: string }) => (
            <ComboboxItem key={item.value} value={item}>
              <MapPin size={16} />
              {item.label}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
export function ConsumerHome(props: ConsumerProps) {
  const { state } = props;
  const [booking, setBooking] = useState(false);
  const current = state.rides
    .filter((r) => ['in_progress', 'arrived', 'accepted'].includes(r.status))
    .sort(
      (a, b) =>
        ['in_progress', 'arrived', 'accepted'].indexOf(a.status) -
        ['in_progress', 'arrived', 'accepted'].indexOf(b.status),
    )[0];
  const pending = state.rides
    .filter((r) => r.status === 'pending')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0];
  if (!booking && (current || pending))
    return (
      <TripScreen
        {...props}
        ride={current ?? pending}
        onNewRide={state.role === 'family' ? () => setBooking(true) : undefined}
      />
    );
  if (state.role === 'family')
    return (
      <BookingScreen
        {...props}
        onBack={current || pending ? () => setBooking(false) : undefined}
      />
    );
  return (
    <div className="ride-experience">
      <RideMap
        anchors={state.anchors}
        demo={state.demo}
        role={state.role}
        full
      />
      <div className="map-region">
        <MapPin size={14} />
        Flower Mound, Texas
      </div>
      <section className="trip-panel">
        <div className="sheet-handle" />
        <div className="trip-panel-content">
          <span className="caps-label">DRIVER HOME</span>
          <h1>
            You’re ready for
            <br />
            your next ride.
          </h1>
          <p className="panel-copy">
            Your coordinator’s assigned requests will appear here. Keep your
            weekly availability up to date.
          </p>
          <div className="ride-option">
            <span className="vehicle-symbol">
              <CarFront size={36} />
            </span>
            <div>
              <strong>{state.drivers[0]?.vehicle ?? 'Your vehicle'}</strong>
              <p>{state.drivers[0]?.plate ?? 'Complete your driver profile'}</p>
            </div>
          </div>
          <button
            className="ride-button"
            onClick={() => props.navigate('availability')}
          >
            Set my availability
            <ArrowRight />
          </button>
          <button
            className="ride-button secondary"
            onClick={() => props.navigate('rides')}
          >
            View ride history
          </button>
        </div>
      </section>
    </div>
  );
}
function BookingScreen({
  state,
  navigate,
  commit,
  onBack,
}: ConsumerProps & { onBack?: () => void }) {
  const [pickup, setPickup] = useState(state.anchors[0]?.id ?? ''),
    [dropoff, setDropoff] = useState(''),
    [at, setAt] = useState(() => {
      const d = new Date(Date.now() + 60 * 60000);
      return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
    }),
    [activity, setActivity] = useState(''),
    [step, setStep] = useState(0),
    [route, setRoute] = useState<RoadRoute | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const family = state.families[0];
  function changeLocation(set: (v: string) => void, v: string) {
    set(v);
    setRoute(null);
    setStep(0);
  }
  async function request() {
    setBusy(true);
    setError('');
    try {
      const result = await commit({
        op: 'ride.create',
        pickupId: pickup,
        dropoffId: dropoff,
        scheduledAt: new Date(at).toISOString(),
        activity,
        notes: '',
      });
      if (result.id) navigate('rides', result.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ride-experience">
      <RideMap
        anchors={state.anchors}
        preview={
          pickup && dropoff
            ? { pickupId: pickup, dropoffId: dropoff }
            : undefined
        }
        demo={state.demo}
        role={state.role}
        full
        onRoute={setRoute}
      />
      <div className="map-region">
        <MapPin size={14} />
        Flower Mound, Texas
        <span className="region-divider" />
        North Texas pilot
      </div>
      <section className="trip-panel booking-panel">
        <div className="sheet-handle" />
        <div className="trip-panel-content">
          {onBack && (
            <button
              className="round-back"
              aria-label="Back to your active ride"
              onClick={onBack}
            >
              <ArrowLeft />
            </button>
          )}
          <span className="caps-label">
            {step === 0 ? 'LET’S GET THERE' : 'REVIEW YOUR RIDE'}
          </span>
          <h1>{step === 0 ? 'Request a ride' : 'Review your ride'}</h1>
          <p className="panel-copy">
            {step === 0
              ? `Plan ${family?.student.split(' ')[0] ?? 'your student'}’s next ride.`
              : 'Community rides, coordinated with care.'}
          </p>
          {step === 0 ? (
            <>
              <div className="place-fields">
                <div className="place-row">
                  <span className="route-dot" />
                  <PlacePicker
                    value={pickup}
                    onChange={(v) => changeLocation(setPickup, v)}
                    anchors={state.anchors}
                    label="Pickup location"
                  />
                </div>
                <div className="place-row">
                  <span className="route-square" />
                  <PlacePicker
                    value={dropoff}
                    onChange={(v) => changeLocation(setDropoff, v)}
                    anchors={state.anchors}
                    label="Where to?"
                  />
                </div>
              </div>
              <div className="schedule-control">
                <CalendarDays size={20} />
                <div>
                  <label htmlFor="ride-at">Schedule pickup</label>
                  <input
                    id="ride-at"
                    type="datetime-local"
                    value={at}
                    onChange={(e) => setAt(e.target.value)}
                  />
                </div>
              </div>
              <Field label="What’s the occasion?">
                <input
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  placeholder="Practice, tutoring, music…"
                  maxLength={100}
                />
              </Field>
              <button
                className="ride-button"
                disabled={
                  !pickup ||
                  !dropoff ||
                  pickup === dropoff ||
                  activity.trim().length < 2 ||
                  !at ||
                  !family
                }
                onClick={() => setStep(1)}
              >
                Review ride
                <ArrowRight />
              </button>
              <p className="fine-print">
                Schedule 30 minutes to 7 days ahead. Rides use registered
                community locations.
              </p>
              <div className="frequent-places">
                <span className="caps-label">COMMUNITY DESTINATIONS</span>
                {state.anchors
                  .filter((a) => a.id !== pickup)
                  .slice(0, 3)
                  .map((a) => (
                    <button
                      key={a.id}
                      onClick={() => changeLocation(setDropoff, a.id)}
                    >
                      <span className="place-icon">
                        {a.category === 'School' ||
                        a.category === 'Learning' ? (
                          <GraduationCap />
                        ) : (
                          <MapPin />
                        )}
                      </span>
                      <span>
                        <strong>{a.name}</strong>
                        <small>{a.address.split(',')[0]}</small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <>
              <div className="compact-route">
                <div>
                  <i className="route-dot" />
                  {state.anchors.find((a) => a.id === pickup)?.name}
                </div>
                <div>
                  <i className="route-square" />
                  {state.anchors.find((a) => a.id === dropoff)?.name}
                </div>
                <button className="text-link" onClick={() => setStep(0)}>
                  Edit route
                </button>
              </div>
              <div className="ride-option selected">
                <span className="vehicle-symbol">
                  <CarFront size={40} />
                </span>
                <div>
                  <strong>Kinetic Community</strong>
                  <p>1 student · reviewed volunteer driver</p>
                  <small>
                    {route
                      ? `${Math.ceil(route.duration / 60)} min drive · ${(route.distance / 1609).toFixed(1)} mi`
                      : 'Route estimate unavailable'}
                  </small>
                </div>
                <Check size={20} />
              </div>
              <div className="booking-summary">
                <span>Pickup</span>
                <strong>
                  {date(new Date(at).toISOString())} ·{' '}
                  {time(new Date(at).toISOString())} CT
                </strong>
                <span>Student</span>
                <strong>{family?.student}</strong>
                <span>Activity</span>
                <strong>{activity}</strong>
              </div>
              <div className="safety-note">
                <ShieldCheck />
                <p>
                  Your coordinator confirms the match. You’ll see the driver,
                  vehicle, and pickup code here.
                </p>
              </div>
              {error && (
                <p role="alert" className="error-message">
                  {error}
                </p>
              )}
              <button
                className="ride-button"
                disabled={busy || !family?.consent}
                onClick={request}
              >
                {busy ? 'Requesting…' : 'Request ride'}
                <ArrowRight />
              </button>
              {!family?.consent && (
                <p className="error-message">
                  Guardian consent must be recorded before booking.
                </p>
              )}
              <p className="fine-print">
                No payment is collected in this pilot.
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
export function TripScreen({
  state,
  ride,
  open,
  navigate,
  commit,
  onNewRide,
}: ConsumerProps & { ride: Ride; onNewRide?: () => void }) {
  const [road, setRoad] = useState<RoadRoute | null>(null),
    [eta, setEta] = useState<number | null>(null),
    [otp, setOtp] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [tracking, setTracking] = useState<'off' | 'device' | 'simulation'>('off'),
    [gpsMessage, setGpsMessage] = useState(''),
    [clock, setClock] = useState(Date.now());
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const simulationPoint = useRef(0);
  const tick = useRef(0);
  const d = state.drivers.find((d) => d.id === ride.driverId),
    f = state.families.find((f) => f.id === ride.familyId),
    pickup =
      ride.pickupSnapshot ?? state.anchors.find((a) => a.id === ride.pickupId),
    dropoff =
      ride.dropoffSnapshot ??
      state.anchors.find((a) => a.id === ride.dropoffId);
  const isDriver = state.role === 'driver',
    terminal = ['completed', 'cancelled'].includes(ride.status),
    age = ride.locationAt
      ? Math.max(0, Math.floor((clock - Date.parse(ride.locationAt)) / 1000))
      : null,
    stale = age === null || age > 45,
    expired = !ride.otpExpiresAt || Date.parse(ride.otpExpiresAt) < clock;
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function action(action: string, data: Record<string, unknown> = {}) {
    setBusy(true);
    setError('');
    try {
      await commit({ op: 'ride.action', id: ride.id, action, ...data });
      setOtp('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sendLocation(
    lat: number,
    lng: number,
    accuracy: number,
    source: 'device' | 'simulation',
    capturedAt = Date.now(),
  ) {
    await postMutation(state.demo, 'driver', {
      op: 'location',
      id: ride.id,
      lat,
      lng,
      accuracy,
      source,
      capturedAt: new Date(capturedAt).toISOString(),
    });
    setGpsMessage(
      source === 'simulation'
        ? 'Simulated GPS delivered to the ride.'
        : 'Device GPS delivered to the ride.',
    );
  }
  const sendRef = useRef(sendLocation);
  useEffect(() => {
    sendRef.current = sendLocation;
  });
  useEffect(() => {
    if (tracking === 'off' || !isDriver || terminal) return;
    if (tracking === 'device') {
      if (!navigator.geolocation) {
        setGpsMessage('This browser does not support geolocation.');
        setTracking('off');
        return;
      }
      const stop = watchDevicePosition(
        navigator.geolocation,
        (p) => {
          if (Date.now() - tick.current < 3000) return;
          tick.current = Date.now();
          sendRef
            .current(
              p.coords.latitude,
              p.coords.longitude,
              p.coords.accuracy,
              'device',
              p.timestamp,
            )
            .catch((e) => setGpsMessage(e.message));
        },
        (e) => {
          setGpsMessage(
            e.code === 1
              ? 'Location permission denied. Allow location for this site and try again.'
              : 'GPS is unavailable. Move to an open area and try again.',
          );
          setTracking('off');
        },
      );
      return stop;
    }
    if (!state.demo || !road?.coordinates.length) {
      setTracking('off');
      return;
    }
    const points = road.coordinates;
    simulationPoint.current = 0;
    let inFlight = false;
    const move = async () => {
      if (inFlight) return;
      inFlight = true;
      const i = Math.min(
        points.length - 1,
        Math.round((simulationPoint.current * (points.length - 1)) / 24),
      );
      try {
        await sendRef.current(points[i][1], points[i][0], 8, 'simulation');
        simulationPoint.current++;
        if (i === points.length - 1) {
          setTracking('off');
          setGpsMessage(
            'Test drive finished at the destination. You can confirm drop-off.',
          );
        }
      } catch (e) {
        setGpsMessage((e as Error).message);
        setTracking('off');
      } finally {
        inFlight = false;
      }
    };
    void move();
    const timer = setInterval(move, 3000);
    return () => clearInterval(timer);
  }, [tracking, isDriver, terminal, ride.id, road, state.demo]);
  useEffect(() => {
    if (stale || terminal || !active(ride.status)) {
      setEta(null);
      return;
    }
    const controller = new AbortController();
    let inFlight = false;
    async function refreshEta() {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      await fetch(
        `/api/route?mode=${state.demo ? 'practice' : 'pilot'}&id=${encodeURIComponent(ride.id)}&leg=current`,
        { headers: { 'x-ky-role': state.role }, signal: controller.signal },
      )
        .then(async (r) => {
          const v = (await r.json()) as { duration?: number };
          if (r.ok && v.duration !== undefined)
            setEta(Math.max(1, Math.ceil(v.duration / 60)));
          else setEta(null);
        })
        .catch(() => {
          if (!controller.signal.aborted) setEta(null);
        });
      inFlight = false;
    }
    void refreshEta();
    const timer = setInterval(refreshEta, 15000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [ride.status, stale, terminal, ride.id, state.demo, state.role]);
  const titles: Record<string, string> = isDriver
    ? {
        pending: 'Ride assignment',
        accepted: 'Go to pickup',
        arrived: 'Verify pickup',
        in_progress: 'Ride in progress',
        completed: 'Ride completed',
        cancelled: 'Ride cancelled',
      }
    : {
        pending: ride.driverId
          ? 'Awaiting driver confirmation'
          : 'Awaiting driver assignment',
        accepted: 'Ride confirmed',
        arrived: 'Driver at pickup',
        in_progress: 'Ride in progress',
        completed: 'Ride completed',
        cancelled: 'Ride cancelled',
      };
  const statusLine =
    ride.status === 'in_progress'
      ? `To ${dropoff?.name ?? 'your destination'}`
      : ride.status === 'arrived'
        ? 'Meet at the agreed pickup point.'
        : `${date(ride.scheduledAt)} · ${time(ride.scheduledAt)} CT`;
  return (
    <div className="ride-experience">
      <RideMap
        anchors={state.anchors}
        ride={ride}
        demo={state.demo}
        role={state.role}
        full
        onRoute={setRoad}
      />
      <div className="map-region">
        <MapPin size={14} />
        Flower Mound, Texas
        <span className="region-divider" />
        {ride.activity}
      </div>
      <section className="trip-panel">
        <div className="sheet-handle" />
        <div className="trip-panel-content">
          <div className="trip-topline">
            <button
              className="round-back"
              aria-label="Back to rides"
              onClick={() => navigate('rides')}
            >
              <ArrowLeft />
            </button>
            <span className="trip-reference">{ride.id}</span>
            <button
              className="help-pill"
              onClick={() => open({ kind: 'help', ride })}
              disabled={terminal}
            >
              <ShieldCheck size={15} />
              Help
            </button>
          </div>
          <div className="trip-headline">
            <div>
              <h1>{titles[ride.status]}</h1>
              <p className="panel-copy">{statusLine}</p>
            </div>
            {eta && !stale && !terminal && (
              <div className="eta-block">
                <strong>{eta}</strong>
                <span>min est.</span>
              </div>
            )}
          </div>
          <div
            className="ride-steps"
            aria-label={`Ride status: ${ride.status}`}
          >
            {['pending', 'accepted', 'arrived', 'in_progress', 'completed'].map(
              (s, i) => (
                <span
                  key={s}
                  className={
                    [
                      'pending',
                      'accepted',
                      'arrived',
                      'in_progress',
                      'completed',
                    ].indexOf(ride.status) >= i
                      ? 'done'
                      : ''
                  }
                />
              ),
            )}
          </div>
          {d ? (
            <div className="driver-identity">
              <div className="driver-person">
                <Avatar name={isDriver ? (f?.student ?? 'Student') : d.name} />
                <div>
                  <strong>{isDriver ? f?.student : d.name}</strong>
                  <span>
                    {isDriver ? (
                      `Guardian: ${f?.guardian}`
                    ) : d.rating ? (
                      <>★ {d.rating.toFixed(1)} · Reviewed driver</>
                    ) : (
                      'Approved driver'
                    )}
                  </span>
                </div>
              </div>
              <div className="vehicle-identity">
                <span className="plate-number">{d.plate}</span>
                <p>{d.vehicle}</p>
              </div>
            </div>
          ) : (
            <div className="matching-state">
              <span className="matching-ring">
                <Users />
              </span>
              <p>
                A coordinator is matching your ride with an approved driver.
                Your request is saved.
              </p>
            </div>
          )}
          {d && !terminal && !isDriver && (
            <div className="contact-actions">
              <a href={`tel:${d.phone}`}>
                <Phone size={17} />
                Call driver
              </a>
              <button onClick={() => open({ kind: 'help', ride })}>
                <ShieldCheck size={17} />
                Safety & help
              </button>
            </div>
          )}
          <div className="compact-route">
            <div>
              <i className="route-dot" />
              <span>
                <strong>{pickup?.name}</strong>
                <small>{pickup?.notes}</small>
              </span>
            </div>
            <div>
              <i className="route-square" />
              <span>
                <strong>{dropoff?.name}</strong>
                <small>{ride.activity}</small>
              </span>
            </div>
          </div>
          {!terminal && active(ride.status) && (
            <div className={`tracking-line ${stale ? 'stale' : ''}`}>
              <Radio size={15} />
              <span>
                {state.demo
                  ? ride.locationSource === 'device'
                    ? 'Device GPS · practice ride'
                    : stale
                      ? 'Sample position · test drive stopped'
                      : 'Test GPS · simulated ride'
                  : stale
                    ? 'Driver location not current'
                    : 'Receiving driver GPS'}
                <small>
                  {age === null
                    ? 'Waiting for the first location update.'
                    : `Last update ${age < 60 ? age + ' seconds' : Math.floor(age / 60) + ' minutes'} ago${ride.accuracy ? ` · ±${Math.round(ride.accuracy)} m` : ''}`}
                </small>
              </span>
              {!stale && <i className="dot" />}
            </div>
          )}
          {ride.status === 'arrived' && state.role === 'family' && (
            <div className="pickup-panel">
              <h3>Share this code at pickup</h3>
              {ride.otp && !expired ? (
                <>
                  <div className="code-display">
                    {ride.otp.split('').map((v, i) => (
                      <span key={i}>{v}</span>
                    ))}
                  </div>
                  <p>
                    Match the car and driver first. Code expires in{' '}
                    {Math.max(
                      0,
                      Math.ceil(
                        (Date.parse(ride.otpExpiresAt!) - clock) / 60000,
                      ),
                    )}{' '}
                    min.
                  </p>
                </>
              ) : (
                <p className="error-message">
                  Code expired. Ask the coordinator for a new code.
                </p>
              )}
            </div>
          )}
          {isDriver && !terminal && (
            <div className="driver-actions">
              {ride.status === 'pending' && (
                <button
                  className="ride-button"
                  disabled={busy || d?.status !== 'approved'}
                  onClick={() => action('accept')}
                >
                  Accept ride
                  <ArrowRight />
                </button>
              )}
              {ride.status === 'accepted' && (
                <>
                  <a
                    className="ride-button secondary"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${pickup?.lat},${pickup?.lng}&travelmode=driving`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation />
                    Navigate to pickup
                  </a>
                  <button
                    className="ride-button"
                    disabled={busy}
                    onClick={() => action('arrive')}
                  >
                    I’ve arrived
                    <Check />
                  </button>
                </>
              )}
              {ride.status === 'arrived' && (
                <>
                  <label htmlFor="trip-pickup-code">
                    Enter the family’s pickup code
                  </label>
                  <InputOTP
                    id="trip-pickup-code"
                    value={otp}
                    onChange={setOtp}
                    maxLength={6}
                    pattern="^[0-9]+$"
                    disabled={busy || expired || ride.otpAttempts >= 5}
                  >
                    <InputOTPGroup>
                      {Array.from({ length: 6 }, (_, i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className="h-12 w-11 text-lg"
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                  <button
                    className="ride-button"
                    disabled={
                      busy ||
                      otp.length !== 6 ||
                      expired ||
                      ride.otpAttempts >= 5
                    }
                    onClick={() => action('verify', { otp })}
                  >
                    Verify & start ride
                    <ShieldCheck />
                  </button>
                  {(expired || ride.otpAttempts >= 5) && (
                    <p className="error-message">
                      Contact the coordinator to refresh the pickup code.
                    </p>
                  )}
                </>
              )}
              {ride.status === 'in_progress' && (
                <>
                  <a
                    className="ride-button secondary"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${dropoff?.lat},${dropoff?.lng}&travelmode=driving`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <Navigation />
                    Navigate to destination
                  </a>
                  <button
                    className="ride-button"
                    disabled={busy}
                    onClick={() => action('complete')}
                  >
                    Complete ride
                    <Check />
                  </button>
                </>
              )}
            </div>
          )}
          {isDriver && active(ride.status) && !terminal && (
            <div className="gps-controls">
              <button
                className="gps-toggle"
                onClick={() => {
                  setTracking(tracking === 'device' ? 'off' : 'device');
                  setGpsMessage('');
                }}
              >
                <Navigation size={17} />
                {tracking === 'device'
                  ? 'Stop sharing device GPS'
                  : 'Share my device GPS'}
                <span className={tracking === 'device' ? 'on' : ''} />
              </button>
              <p className="fine-print">
                Keep this page open. Screen lock and backgrounding can interrupt
                tracking.
              </p>
              {state.demo && ride.status === 'in_progress' && (
                <>
                  <button
                    className="test-drive"
                    disabled={!road}
                    onClick={() => {
                      setTracking(
                        tracking === 'simulation' ? 'off' : 'simulation',
                      );
                      setGpsMessage('');
                    }}
                  >
                    {tracking === 'simulation' ? (
                      <Square size={15} />
                    ) : (
                      <Play size={15} />
                    )}{' '}
                    {tracking === 'simulation'
                      ? 'Stop test drive'
                      : 'Play a 75-second test drive'}
                    <ArrowRight size={15} />
                  </button>
                  <a
                    className="text-link"
                    href="/?mode=practice&viewAs=family"
                    target="_blank"
                    rel="noreferrer"
                    style={{ marginTop: 13 }}
                  >
                    Open family tracker in another tab
                    <ArrowUpRight size={13} />
                  </a>
                  <p className="fine-print">
                    Test GPS follows the road route and is saved to the server.
                    Both views receive the same location.
                  </p>
                </>
              )}
              {gpsMessage && (
                <output className="gps-feedback">{gpsMessage}</output>
              )}
            </div>
          )}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {terminal && ride.status === 'completed' && (
            <>
              <div className="ride-receipt">
                <Check />
                <div>
                  <strong>Drop-off confirmed</strong>
                  <small>
                    {ride.completedAt ? time(ride.completedAt) + ' · ' : ''}
                    {ride.activity}
                  </small>
                </div>
              </div>
              {state.role === 'family' && !ride.rating && (
                <button
                  className="ride-button"
                  onClick={() => open({ kind: 'rating', ride })}
                >
                  Rate your ride
                  <Star />
                </button>
              )}
              {ride.rating && (
                <p className="rating-received">
                  {'★'.repeat(ride.rating)}{' '}
                  <span>{ride.feedback || 'Thanks for the feedback.'}</span>
                </p>
              )}
            </>
          )}
          {ride.status === 'cancelled' && (
            <p className="error-message">{ride.cancelReason}</p>
          )}
          {['pending', 'accepted', 'arrived'].includes(ride.status) && (
            <button
              className="cancel-trip"
              onClick={() =>
                open({
                  kind:
                    isDriver && ['pending', 'accepted'].includes(ride.status)
                      ? 'decline'
                      : 'cancel',
                  ride,
                })
              }
              disabled={busy}
            >
              {isDriver && ['pending', 'accepted'].includes(ride.status)
                ? 'Decline ride'
                : 'Cancel ride'}
            </button>
          )}
          {onNewRide && (
            <button className="ride-button secondary" onClick={onNewRide}>
              Schedule another ride
              <CalendarDays />
            </button>
          )}
          {state.settings.contactPhone && (
            <a
              className="coordinator-contact"
              href={`tel:${state.settings.contactPhone}`}
            >
              Call coordinator · {state.settings.contactPhone}
            </a>
          )}
        </div>
      </section>
      <div className="map-bottom-label">
        <ShieldCheck size={14} />
        {state.demo
          ? 'Practice mode · no real ride is taking place'
          : 'Private tracking · visible to your family and coordinator'}
      </div>
    </div>
  );
}
