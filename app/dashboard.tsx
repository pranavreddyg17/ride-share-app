'use client';
import { useState } from 'react';
import { ArrowRight, ArrowUpRight, Plus } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Badge } from './shell';
import { RideMap } from './ride-map';
import { type State, time, dateKey } from '@/lib/types';
import { approvedMinutes, durationLabel } from '@/lib/service-hours';
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
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      <div className="actions">{children}</div>
    </div>
  );
}
export function Dashboard({ state, open, navigate }: ViewProps) {
  const [day, setDay] = useState(dateKey(state.serverTime));
  const [focus, setFocus] = useState<string>();
  const schedule = state.rides
    .filter((r) => dateKey(r.scheduledAt) === day)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const live = state.rides.filter((r) =>
    ['arrived', 'in_progress'].includes(r.status),
  );
  const matching = state.rides.filter(
    (r) => r.status === 'pending' && !r.driverId,
  );
  const review = state.rides.filter(
    (r) =>
      r.status === 'completed' && !state.credits.some((c) => c.rideId === r.id),
  );
  const driverReview = state.drivers.filter((d) => d.status === 'review');
  const help = state.events.filter((e) => e.kind === 'sos' && !e.resolved);
  const selected = live.find((r) => r.id === focus) ?? live[0];
  return (
    <>
      <Heading title="Dispatch" description="North Texas · Central Time">
        <button className="btn primary" onClick={() => open({ kind: 'ride' })}>
          <Plus />
          Schedule ride
        </button>
      </Heading>
      <div className="operations-metrics" aria-label="Today’s operations">
        <div>
          <span>Scheduled today</span>
          <strong>
            {
              state.rides.filter(
                (r) =>
                  r.status !== 'cancelled' &&
                  dateKey(r.scheduledAt) === dateKey(state.serverTime),
              ).length
            }
          </strong>
        </div>
        <div>
          <span>Trips underway now</span>
          <strong>{live.length}</strong>
        </div>
        <div>
          <span>Completed today</span>
          <strong>
            {
              state.rides.filter(
                (r) =>
                  r.status === 'completed' &&
                  r.completedAt &&
                  dateKey(r.completedAt) === dateKey(state.serverTime),
              ).length
            }
          </strong>
        </div>
      </div>
      <div className="dispatch-layout">
        <section className="dispatch-schedule">
          <div className="section-head">
            <h2>Ride schedule</h2>
            <label className="compact-date">
              Date
              <input
                aria-label="Schedule date"
                type="date"
                value={day}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
          </div>
          <div className="table-panel">
            <Table className="data-table dispatch-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Pickup / CT</TableHead>
                  <TableHead>Student & route</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>
                    <span className="sr-only">Open ride</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {schedule.map((ride) => {
                  const family =
                    ride.familySnapshot ??
                    state.families.find((f) => f.id === ride.familyId);
                  const driver =
                    ride.driverSnapshot ??
                    state.drivers.find((d) => d.id === ride.driverId);
                  return (
                    <TableRow key={ride.id}>
                      <TableCell className="schedule-time">
                        <strong>{time(ride.scheduledAt)}</strong>
                        <small className="mono">{ride.id}</small>
                      </TableCell>
                      <TableCell>
                        <strong>{family?.student ?? 'Student'}</strong>
                        <small className="table-route">
                          {ride.pickupSnapshot?.name ??
                            state.anchors.find((a) => a.id === ride.pickupId)
                              ?.name}
                          <ArrowRight size={12} />
                          {ride.dropoffSnapshot?.name ??
                            state.anchors.find((a) => a.id === ride.dropoffId)
                              ?.name}
                        </small>
                      </TableCell>
                      <TableCell>
                        {driver?.name ??
                          (ride.status === 'pending' ? (
                            <button
                              className="text-link"
                              onClick={() => open({ kind: 'assign', ride })}
                            >
                              Assign driver
                            </button>
                          ) : (
                            '—'
                          ))}
                      </TableCell>
                      <TableCell>
                        <Badge value={ride.status} />
                      </TableCell>
                      <TableCell>
                        <button
                          className="icon-btn"
                          aria-label={`Open ${ride.id}`}
                          onClick={() => navigate('rides', ride.id)}
                        >
                          <ArrowUpRight size={18} />
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {!schedule.length && (
            <div className="plain-empty">
              <strong>No rides on this date</strong>
              <p>Choose another date or schedule a ride.</p>
            </div>
          )}
          <div className="section-foot">
            <span>
              {schedule.length} rides ·{' '}
              {schedule.filter((r) => r.status === 'completed').length}{' '}
              completed
            </span>
            <button className="text-link" onClick={() => navigate('rides')}>
              Full ride ledger
              <ArrowRight size={15} />
            </button>
          </div>
          {matching.length + review.length + driverReview.length + help.length >
            0 && (
            <section className="action-register">
              <div className="section-head">
                <h2>Needs attention</h2>
                <span>
                  {matching.length +
                    review.length +
                    driverReview.length +
                    help.length}{' '}
                  items
                </span>
              </div>
              {[
                {
                  title: 'Unassigned requests',
                  detail: 'Choose a driver for each request',
                  count: matching.length,
                  page: 'rides',
                },
                {
                  title: 'Service credit review',
                  detail: 'Arrival-to-drop-off time, including waiting',
                  count: review.length,
                  page: 'hours',
                },
                {
                  title: 'Driver applications',
                  detail: 'Review documents and eligibility',
                  count: driverReview.length,
                  page: 'drivers',
                },
                {
                  title: 'Open help requests',
                  detail: 'Coordinator follow-up required',
                  count: help.length,
                  page: 'safety',
                },
              ]
                .filter((item) => item.count > 0)
                .map((item) => (
                  <button
                    className="action-register-row"
                    key={item.page}
                    onClick={() =>
                      navigate(
                        item.page,
                        item.page === 'rides' ? matching[0]?.id : undefined,
                      )
                    }
                  >
                    <span className="action-count mono">{item.count}</span>
                    <div>
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </div>
                    <ArrowUpRight size={18} />
                  </button>
                ))}
            </section>
          )}
        </section>
        <aside className="dispatch-aside">
          <section className="dispatch-map">
            <div className="section-head">
              <h2>Trip tracking</h2>
              <span className="mono">
                {String(live.length).padStart(2, '0')}
              </span>
            </div>
            {selected && (
              <RideMap
                anchors={state.anchors}
                ride={selected}
                demo={state.demo}
                role={state.role}
              />
            )}
            <div className="active-trip-list">
              {live.map((ride) => (
                <button
                  key={ride.id}
                  className={selected?.id === ride.id ? 'selected' : ''}
                  onClick={() => setFocus(ride.id)}
                >
                  <div>
                    <strong>
                      {ride.driverSnapshot?.name ??
                        state.drivers.find((d) => d.id === ride.driverId)
                          ?.name ??
                        'Driver'}
                    </strong>
                    <span className="mono">{ride.id}</span>
                  </div>
                  <Badge value={ride.status} />
                </button>
              ))}
            </div>
            {selected ? (
              <div className="section-foot">
                <span>
                  {selected.locationAt
                    ? `GPS ${time(selected.locationAt)}`
                    : 'No GPS received'}
                </span>
                <button
                  className="text-link"
                  onClick={() => navigate('rides', selected.id)}
                >
                  Track
                  <ArrowUpRight size={14} />
                </button>
              </div>
            ) : (
              <div className="plain-empty">
                <p>No active trips.</p>
              </div>
            )}
          </section>
          <section className="service-summary">
            <div className="section-head">
              <h2>Approved service</h2>
              <button
                aria-label="Open service hours"
                className="icon-btn"
                onClick={() => navigate('hours')}
              >
                <ArrowUpRight size={17} />
              </button>
            </div>
            {state.drivers
              .filter((d) => d.status === 'approved')
              .slice(0, 4)
              .map((driver) => (
                <div className="service-summary-row" key={driver.id}>
                  <div>
                    <strong>{driver.name}</strong>
                    <span>{driver.rides} completed rides</span>
                  </div>
                  <strong className="mono">
                    {durationLabel(approvedMinutes(state.credits, driver.id))}
                  </strong>
                </div>
              ))}
          </section>
        </aside>
      </div>
    </>
  );
}
