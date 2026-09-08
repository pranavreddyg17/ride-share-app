'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  ShieldCheck,
  AlertCircle,
  Check,
  Users,
  Clock,
  Plus,
  ArrowUpRight,
  CarFront,
  LogOut,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Heading, type ViewProps } from './dashboard';
import { Avatar, Badge } from './shell';
import { Field, EmptyState } from './controls';
import { DAYS, DRIVER_CHECKS, date, time, type Slot } from '@/lib/types';
import type { Commit } from './dialogs';
export function Safety({ state, open, navigate }: ViewProps) {
  const alerts = state.events.filter((e) => e.kind === 'sos');
  const events = state.events.filter((e) => e.kind !== 'sos');
  return (
    <>
      <Heading
        title="Safety & activity"
        description="Help requests, ride milestones, and a record of coordinator decisions."
      />
      <div className="notice warning" style={{ marginBottom: 22 }}>
        <AlertCircle />
        <div>
          Help requests appear here while the app is open. SMS and push alerts
          are not connected. For immediate danger,{' '}
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
              style={{ padding: '18px 22px', borderTop: '1px solid #e5eaf0' }}
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
                  borderTop: '1px solid #ecf0f2',
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
                </div>
              </div>
            ))}
            {!events.length && (
              <EmptyState
                title="A fresh start"
                description="Ride and registration events appear here as your pilot gets moving."
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
  const [slots, setSlots] = useState<Slot[]>(() => driver?.availability ?? []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [saved, setSaved] = useState(false);
  async function save() {
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await commit({ op: 'availability', slots });
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
              Profile changes return your application to coordinator review.
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
}: ViewProps & { commit: Commit }) {
  const [settings, setSettings] = useState(state.settings),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
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
      <Heading
        title="Pilot settings"
        description="Manage your pilot’s contacts, account access, and launch setup."
      />
      <div className="settings-grid">
        <section className="panel settings-card">
          <h2>Community pilot</h2>
          <p>
            The coordinator contact is shown to families and drivers during a
            ride.
          </p>
          <form onSubmit={save}>
            <Field label="Pilot name">
              <input
                required
                value={settings.pilotName}
                onChange={(e) =>
                  setSettings({ ...settings, pilotName: e.target.value })
                }
              />
            </Field>
            <Field label="Coordinator name">
              <input
                required
                value={settings.coordinator}
                onChange={(e) =>
                  setSettings({ ...settings, coordinator: e.target.value })
                }
              />
            </Field>
            <Field
              label="Coordinator phone"
              hint="Use a country code, e.g. +12145550123. Leave blank until confirmed."
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
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save pilot details'}
            </button>
          </form>
        </section>
        <section className="panel settings-card">
          <h2>
            {state.demo
              ? 'Ready for your own records?'
              : 'You’re in the real pilot workspace'}
          </h2>
          <p>
            {state.demo
              ? 'Practice mode contains fictional drivers, families, and rides. Your real pilot workspace starts empty and keeps its records separate.'
              : 'These are your organization’s records. Roles are checked against the account access register; practice personas cannot access them.'}
          </p>
          <div className="notice" style={{ marginBottom: 20 }}>
            <ShieldCheck />
            {state.demo
              ? 'The current site is a private preview, accessible only to its owner.'
              : 'Add drivers, families, anchor locations, and account access before coordinating trips.'}
          </div>
          <a className="btn primary" href={state.demo ? '/?mode=pilot' : '/'}>
            {state.demo
              ? 'Open real pilot workspace'
              : 'Return to practice workspace'}
            <ArrowUpRight />
          </a>
          <div
            style={{
              marginTop: 23,
              paddingTop: 23,
              borderTop: '1px solid #e4ebed',
            }}
          >
            <h2>Sign-in</h2>
            <p>
              Secure ChatGPT sign-in is active. Access to the pilot is granted
              by verified email. SMS sign-in and text notifications are not
              connected.
            </p>
            <Link className="text-link" href="/login">
              <LogOut size={15} />
              Account & sign-in options
            </Link>
          </div>
        </section>
        <section className="panel settings-card">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 15,
            }}
          >
            <h2>Account access</h2>
            {!state.demo && (
              <button
                className="btn small"
                onClick={() => open({ kind: 'member' })}
              >
                <Plus />
                Add account
              </button>
            )}
          </div>
          <p>
            Register the driver or family first, then link their sign-in email
            to that record. Coordinators are added here too.
          </p>
          {state.demo ? (
            <div className="notice">
              <Users />
              Practice accounts use the role selector. Switch to the real pilot
              workspace to manage actual access.
            </div>
          ) : (
            <div>
              {state.members.map((m) => (
                <div className="detail-pair" key={m.email}>
                  <div>
                    <strong style={{ fontSize: 13, fontWeight: 500 }}>
                      {m.name}
                    </strong>
                    <small
                      style={{ display: 'block', fontSize: 12, marginTop: 4 }}
                    >
                      {m.email}
                    </small>
                  </div>
                  <div className="actions">
                    <span className="badge">{m.role}</span>
                    {m.email !== state.email && (
                      <button
                        className="text-link"
                        style={{ color: '#b24b58' }}
                        onClick={() =>
                          open({ kind: 'member-remove', email: m.email })
                        }
                      >
                        Revoke
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel settings-card">
          <h2>Before the first real ride</h2>
          <p>
            This pilot has coordination tools. The following operational setup
            still needs to be completed.
          </p>
          <div className="details-list">
            {[
              'Confirm driver eligibility, license restrictions, coverage, consent, and the screening process.',
              'Confirm anchor partners, pickup instructions, and the coordinator’s response process.',
              'Connect and test SMS / push alerts; in-app help requests are not continuously monitored.',
              'Test GPS and handoff on actual phones. This web app tracks only while open.',
              'Configure participant access, retention and backups, and a production maps service.',
            ].map((text, i) => (
              <div className="check-row" key={text}>
                <span
                  className="badge amber"
                  style={{ width: 24, justifyContent: 'center', flexShrink: 0 }}
                >
                  {i + 1}
                </span>
                <span>{text}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
