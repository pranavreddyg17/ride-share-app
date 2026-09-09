'use client';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  AlertCircle,
  Check,
  Users,
  Clock,
  Plus,
  ArrowUpRight,
  CarFront,
} from 'lucide-react';
import { AuditLog } from './audit';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Heading, type ViewProps } from './dashboard';
import { Avatar, Badge } from './shell';
import { Field, EmptyState, Check as CheckField } from './controls';
import { DAYS, DRIVER_CHECKS, date, time, type Slot } from '@/lib/types';
import type { Commit } from './dialogs';
export function Safety({ state, open, navigate }: ViewProps) {
  const alerts = state.events.filter((e) => e.kind === 'sos');
  const events = state.events.filter((e) => e.kind !== 'sos');
  return (
    <>
      <Heading
        title="Help & activity"
        description="Coordinator requests and ride history."
      />
      <div className="notice warning" style={{ marginBottom: 22 }}>
        <AlertCircle />
        <div>
          Help requests appear here while the app is open. Text alerts require
          SMS setup and delivery confirmation. For immediate danger,{' '}
          <a href="tel:911">
            <strong>call 911</strong>
          </a>
          .{' '}
          {state.settings.contactPhone && (
            <a href={`tel:${state.settings.contactPhone}`}>
              <strong>Coordinator: {state.settings.contactPhone}</strong>
            </a>
          )}
        </div>
      </div>
      <div className="settings-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              Help requests{' '}
              <span className="badge red" style={{ marginLeft: 5 }}>
                {alerts.filter((e) => !e.resolved).length} open
              </span>
            </h2>
            <ShieldCheck size={20} />
          </div>
          {alerts.map((e) => (
            <div
              key={e.id}
              style={{ padding: '18px 22px', borderTop: '1px solid #e9e9e9' }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginBottom: 12,
                }}
              >
                <span className={`badge ${e.resolved ? 'green' : 'red'}`}>
                  {e.resolved ? 'Resolved' : 'Needs attention'}
                </span>
                <small className="muted">
                  {date(e.createdAt)} · {time(e.createdAt)}
                </small>
              </div>
              <p style={{ fontSize: 14, lineHeight: 1.7 }}>{e.message}</p>
              {e.note && (
                <p className="notice" style={{ marginTop: 12 }}>
                  {e.note}
                </p>
              )}
              <div className="actions" style={{ marginTop: 14 }}>
                {e.rideId && (
                  <button
                    className="btn small"
                    onClick={() => navigate('rides', e.rideId!)}
                  >
                    View ride
                  </button>
                )}
                {state.role === 'admin' && !e.resolved && (
                  <button
                    className="btn small primary"
                    onClick={() => open({ kind: 'resolve', event: e })}
                  >
                    Resolve with notes
                  </button>
                )}
              </div>
            </div>
          ))}
          {!alerts.length && (
            <EmptyState
              title="No help requests"
              description="Requests from your rides will appear here for coordinator follow-up."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Activity log</h2>
            <Clock size={18} />
          </div>
          <div style={{ maxHeight: 700, overflow: 'auto' }}>
            {events.map((e) => (
              <div
                className="activity"
                key={e.id}
                style={{
                  borderTop: '1px solid #efefef',
                  paddingTop: 17,
                  paddingBottom: 17,
                }}
              >
                <span className="event-icon">
                  {e.kind === 'driver' ? (
                    <CarFront />
                  ) : e.kind === 'access' ? (
                    <Users />
                  ) : (
                    <Check />
                  )}
                </span>
                <div style={{ lineHeight: 1.65 }}>
                  {e.message}
                  <small>
                    {date(e.createdAt)} · {time(e.createdAt)}
                  </small>
                  {state.role === 'admin' && (
                    <details className="event-details">
                      <summary>Audit details</summary>
                      <small>
                        {e.actorEmail
                          ? `${e.actorEmail} · ${e.action ?? e.kind}`
                          : 'Legacy event: actor not recorded'}
                        {e.requestId && (
                          <span
                            style={{
                              display: 'block',
                              overflowWrap: 'anywhere',
                            }}
                          >
                            Request {e.requestId}
                          </span>
                        )}
                      </small>
                    </details>
                  )}
                </div>
              </div>
            ))}
            {!events.length && (
              <EmptyState
                title="No activity recorded"
                description="Ride updates, registrations, and credit reviews appear here."
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
export function Availability({
  state,
  commit,
}: ViewProps & { commit: Commit }) {
  const driver = state.drivers[0];
  const [version, setVersion] = useState(driver?.version);
  const [slots, setSlots] = useState<Slot[]>(() => driver?.availability ?? []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const result = await commit({ op: 'availability', slots, version });
      setVersion(result.version);
      setSaved(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading
        title="My availability"
        description="Set your usual weekly windows. All times below are Central time."
      />
      <section className="panel" style={{ maxWidth: 760 }}>
        <div className="panel-heading">
          <h2>Your weekly driving schedule</h2>
          <Clock size={20} />
        </div>
        <div className="detail-body">
          {driver?.status !== 'approved' ? (
            <div className="notice warning">
              <ShieldCheck />
              Your profile needs coordinator approval before you can publish
              availability.
            </div>
          ) : (
            <>
              {slots.map((s, i) => (
                <div className="availability-row" key={s.day}>
                  <Switch
                    checked={s.enabled}
                    aria-label={`${DAYS[s.day]} availability`}
                    onCheckedChange={(v) => {
                      setSaved(false);
                      setSlots(
                        slots.map((s, j) =>
                          i === j ? { ...s, enabled: v } : s,
                        ),
                      );
                    }}
                  />
                  <strong style={{ fontSize: 13, fontWeight: 500 }}>
                    {DAYS[s.day].slice(0, 3)}
                  </strong>
                  <input
                    type="time"
                    aria-label={`${DAYS[s.day]} start time`}
                    value={s.start}
                    disabled={!s.enabled}
                    onChange={(e) => {
                      setSaved(false);
                      setSlots(
                        slots.map((s, j) =>
                          i === j ? { ...s, start: e.target.value } : s,
                        ),
                      );
                    }}
                  />
                  <span className="muted">–</span>
                  <input
                    type="time"
                    aria-label={`${DAYS[s.day]} end time`}
                    value={s.end}
                    disabled={!s.enabled}
                    onChange={(e) => {
                      setSaved(false);
                      setSlots(
                        slots.map((s, j) =>
                          i === j ? { ...s, end: e.target.value } : s,
                        ),
                      );
                    }}
                  />
                </div>
              ))}
              <div className="notice" style={{ margin: '20px 0' }}>
                <Clock />
                Allow at least 30 minutes per trip. Changes that conflict with
                your confirmed rides cannot be saved.
              </div>
              {error && (
                <p className="error-message" role="alert">
                  {error}
                </p>
              )}
              {saved && (
                <output
                  className="notice"

                  style={{ marginBottom: 15 }}
                >
                  <Check />
                  Weekly availability saved.
                </output>
              )}
              <button className="btn primary" disabled={busy} onClick={save}>
                {busy ? 'Saving…' : 'Save availability'}
              </button>
            </>
          )}
        </div>
      </section>
    </>
  );
}
export function DriverProfile({ state, open }: ViewProps) {
  const d = state.drivers[0];
  return (
    <>
      <Heading
        title="Your driver profile"
        description="Keep your contact, vehicle, and review details up to date."
      />
      {d ? (
        <div className="settings-grid">
          <section className="panel settings-card">
            <div className="name-cell">
              <Avatar name={d.name} />
              <div>
                <h2 style={{ marginBottom: 5 }}>{d.name}</h2>
                <Badge value={d.status} />
              </div>
            </div>
            <div className="detail-pair">
              <span>School</span>
              {d.school}
            </div>
            <div className="detail-pair">
              <span>Phone</span>
              {d.phone}
            </div>
            <div className="detail-pair">
              <span>Vehicle</span>
              {d.vehicle}
            </div>
            <div className="detail-pair">
              <span>Plate</span>
              {d.plate}
            </div>
            <div className="detail-pair">
              <span>License expires</span>
              {d.licenseExpiry}
            </div>
            <div className="detail-pair">
              <span>Insurance expires</span>
              {d.insuranceExpiry}
            </div>
            <button
              className="btn primary"
              style={{ marginTop: 20 }}
              onClick={() => open({ kind: 'driver', driver: d })}
            >
              Update my profile
            </button>
            <p style={{ fontSize: 12, marginTop: 13 }}>
              Changes to identity, vehicle, or document dates require a new
              review.
            </p>
          </section>
          <section className="panel settings-card">
            <h2>Your review progress</h2>
            {DRIVER_CHECKS.map(([key, label]) => (
              <div className={`step-line ${d[key] ? 'done' : ''}`} key={key}>
                {d[key] ? <Check /> : <Clock />}
                <div>
                  {label}
                  <small>
                    {d[key] ? 'Recorded by coordinator' : 'Awaiting review'}
                  </small>
                </div>
              </div>
            ))}
            <div className="notice" style={{ marginTop: 20 }}>
              <ShieldCheck />
              Share original documents through your coordinator’s secure
              process. This app keeps the review record.
            </div>
          </section>
        </div>
      ) : (
        <EmptyState
          title="Your profile is not linked yet"
          description="Ask your coordinator to link your account to your driver registration."
        />
      )}
    </>
  );
}
export function Settings({
  state,
  open,
  commit,
  initialTab = 'general',
}: ViewProps & { commit: Commit; initialTab?: string }) {
  const [tab, setTab] = useState(initialTab);
  const [settings, setSettings] = useState(state.settings);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(e: React.SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await commit({ op: 'settings', ...settings });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Heading title="Settings" />
      <Tabs value={tab} onValueChange={(value) => setTab(String(value))}>
        <TabsList className="settings-tabs">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="access">Account access</TabsTrigger>
          <TabsTrigger value="services">Service status</TabsTrigger>
          <TabsTrigger value="logs">Request logs</TabsTrigger>
        </TabsList>
        <TabsContent value="general">
          <div className="settings-grid">
            <section className="panel settings-card">
              <h2>Coordinator contact</h2>
              <p>Shown to families and drivers during a ride.</p>
              <form onSubmit={save}>
                <Field label="Pilot name">
                  <input
                    required
                    maxLength={100}
                    value={settings.pilotName}
                    onChange={(e) =>
                      setSettings({ ...settings, pilotName: e.target.value })
                    }
                  />
                </Field>
                <Field label="Coordinator name">
                  <input
                    required
                    maxLength={100}
                    value={settings.coordinator}
                    onChange={(e) =>
                      setSettings({ ...settings, coordinator: e.target.value })
                    }
                  />
                </Field>
                <Field
                  label="Coordinator phone"
                  hint="Include the country code. Leave blank until confirmed."
                >
                  <input
                    type="tel"
                    placeholder="+1"
                    value={settings.contactPhone}
                    onChange={(e) =>
                      setSettings({ ...settings, contactPhone: e.target.value })
                    }
                  />
                </Field>
                <CheckField
                  checked={settings.smsConsent === true}
                  onChange={(smsConsent) =>
                    setSettings({ ...settings, smsConsent })
                  }
                  label="Coordinator consents to operational text alerts."
                />
                {error && (
                  <p className="error-message" role="alert">
                    {error}
                  </p>
                )}
                <button className="btn primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save contact'}
                </button>
              </form>
            </section>
            <section className="panel settings-card">
              <h2>Workspace</h2>
              <p>
                {state.demo
                  ? 'Practice uses fictional records, separate from your pilot.'
                  : 'You are viewing your organization’s pilot records.'}
              </p>
              <a
                className="btn"
                href={
                  state.demo ? '/?mode=pilot' : '/?mode=practice&viewAs=admin'
                }
              >
                {state.demo
                  ? 'Open pilot workspace'
                  : 'Open practice workspace'}
                <ArrowUpRight />
              </a>
              <div className="settings-account">
                <h2>Signed in as</h2>
                <p>{state.email}</p>
                <Link className="text-link" href="/login">
                  Manage sign-in
                  <ArrowUpRight size={15} />
                </Link>
              </div>
            </section>
          </div>
        </TabsContent>
        <TabsContent value="access">
          <section className="panel settings-card">
            <div className="section-head">
              <h2>Account access</h2>
              {!state.demo && (
                <button
                  className="btn primary"
                  onClick={() => open({ kind: 'member' })}
                >
                  <Plus />
                  Add account
                </button>
              )}
            </div>
            <p>
              Link an exact ChatGPT sign-in email to a registered driver or
              family, or grant coordinator access. Public visitors cannot read
              pilot records unless they are listed here.
            </p>
            {state.demo ? (
              <p className="notice">
                Practice uses the view selector. Manage participant access in
                the pilot workspace.
              </p>
            ) : (
              state.members.map((m) => (
                <div className="detail-pair" key={m.email}>
                  <div>
                    <strong>{m.name}</strong>
                    <small className="account-email">{m.email}</small>
                  </div>
                  <div className="actions">
                    <span className="badge">{m.role}</span>
                    {m.email !== state.email && (
                      <button
                        className="text-link"
                        onClick={() =>
                          open({ kind: 'member-remove', email: m.email })
                        }
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </section>
        </TabsContent>
        <TabsContent value="services">
          <OperationsStatus demo={state.demo} />
        </TabsContent>
        <TabsContent value="logs">
          <AuditLog state={state} embedded />
        </TabsContent>
      </Tabs>
    </>
  );
}

type OperationsData = {
  checks: { name: string; ok: boolean; detail: string }[];
  notifications: {
    id: string;
    ride_id: string;
    status: string;
    error: string;
    recipient_role: string;
    created_at: string;
  }[];
  staleRides: { id: string; status: string }[];
  unresolvedHelp: number;
  serverTime: string;
};
function OperationsStatus({ demo }: { demo: boolean }) {
  const [data, setData] = useState<OperationsData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      setBusy(true);
      try {
        const res = await fetch(
          `/api/operations?mode=${demo ? 'practice' : 'pilot'}`,
          { signal },
        );
        const value = (await res.json()) as OperationsData & { error?: string };
        if (!res.ok)
          throw new Error(value.error ?? 'Service status unavailable.');
        if (!signal?.aborted) {
          setData(value);
          setError('');
        }
      } catch (e) {
        if (!signal?.aborted) setError((e as Error).message);
      } finally {
        if (!signal?.aborted) setBusy(false);
      }
    },
    [demo],
  );
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    const timer = setInterval(() => void refresh(controller.signal), 30000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  return (
    <section className="panel settings-card" style={{ marginTop: 24 }}>
      <div className="panel-heading" style={{ padding: 0, marginBottom: 18 }}>
        <div>
          <h2>Service status</h2>
          <p>
            Configuration checks and recent text alerts. A configured service
            still needs a real ride rehearsal.
          </p>
        </div>
        <button
          className="btn small"
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? 'Checking…' : 'Refresh'}
        </button>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error} {data ? 'The results below may be out of date.' : ''}
        </p>
      )}
      {data && (
        <>
          <p>
            Last checked {new Date(data.serverTime).toLocaleTimeString()} ·{' '}
            {data.unresolvedHelp} open help requests · {data.staleRides.length}{' '}
            active rides without current GPS
          </p>
          <div className="settings-grid">
            {data.checks.map((check) => (
              <div className="detail-pair" key={check.name}>
                <div>
                  <strong>{check.name}</strong>
                  <p style={{ margin: '6px 0 0' }}>{check.detail}</p>
                </div>
                <span className={`badge ${check.ok ? 'green' : 'amber'}`}>
                  {check.ok ? 'Configured' : 'Needs setup'}
                </span>
              </div>
            ))}
          </div>
          <h3 style={{ marginTop: 24 }}>Recent text alerts</h3>
          {!data.notifications.length ? (
            <p>No text alerts recorded in this workspace.</p>
          ) : (
            data.notifications.map((item) => (
              <div className="detail-pair" key={item.id}>
                <div>
                  <strong>
                    {item.recipient_role} · Ride {item.ride_id.slice(0, 8)}
                  </strong>
                  <p style={{ margin: '6px 0 0' }}>
                    {item.error || new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`badge ${item.status === 'delivered' ? 'green' : 'amber'}`}
                >
                  {item.status.replaceAll('_', ' ')}
                </span>
              </div>
            ))
          )}
          {!!data.notifications.length && (
            <p>
              “Accepted” means the provider accepted the text. Only “delivered”
              confirms a delivery receipt. Check failed or unknown messages and
              contact participants directly when needed.
            </p>
          )}
        </>
      )}
      <a
        className="btn"
        href={`/api/export?mode=${demo ? 'practice' : 'pilot'}`}
      >
        Download operational records
      </a>
      <p>
        The export contains personal information. Store it securely; it is not a
        full database backup.
      </p>
    </section>
  );
}
