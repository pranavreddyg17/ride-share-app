'use client';
import { useState, useEffect } from 'react';
import { ArrowUpRight, Download, Plus, X } from 'lucide-react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Heading, type ViewProps } from './dashboard';
import { Field, Pick, SearchBox } from './controls';
import { Badge } from './shell';
import type { Commit } from './dialogs';
import {
  type State,
  type Ride,
  type ServiceCredit,
  date,
  time,
} from '@/lib/types';
import {
  rideTiming,
  approvedMinutes,
  durationLabel,
  filterRides,
  creditState,
  type ReportFilters,
} from '@/lib/service-hours';

function Filters({
  state,
  value,
  onChange,
  review = false,
}: {
  state: State;
  value: ReportFilters;
  onChange: (v: ReportFilters) => void;
  review?: boolean;
}) {
  return (
    <div className="ledger-filters">
      <Field label="From">
        <input
          type="date"
          value={value.from ?? ''}
          onChange={(e) => onChange({ ...value, from: e.target.value })}
        />
      </Field>
      <Field label="Through">
        <input
          type="date"
          value={value.to ?? ''}
          min={value.from}
          onChange={(e) => onChange({ ...value, to: e.target.value })}
        />
      </Field>
      {state.role === 'admin' && (
        <div className="filter-select">
          <span>Driver</span>
          <Pick
            label="Filter driver"
            value={value.driver ?? 'all'}
            onChange={(driver) => onChange({ ...value, driver })}
            items={[
              { value: 'all', label: 'All drivers' },
              ...state.drivers.map((d) => ({ value: d.id, label: d.name })),
            ]}
          />
        </div>
      )}
      <div className="filter-select">
        <span>{review ? 'Credit status' : 'Ride status'}</span>
        <Pick
          label={review ? 'Credit status' : 'Ride status'}
          value={(review ? value.review : value.status) ?? 'all'}
          onChange={(v) =>
            onChange({ ...value, [review ? 'review' : 'status']: v })
          }
          items={
            review
              ? [
                  { value: 'all', label: 'All reviews' },
                  { value: 'pending', label: 'Needs review' },
                  { value: 'approved', label: 'Approved' },
                  { value: 'excluded', label: 'Excluded' },
                ]
              : [
                  { value: 'all', label: 'All rides' },
                  ...[
                    'pending',
                    'accepted',
                    'arrived',
                    'in_progress',
                    'completed',
                    'cancelled',
                  ].map((v) => ({ value: v, label: v.replaceAll('_', ' ') })),
                ]
          }
        />
      </div>
      <button
        className="btn small reset-filters"
        onClick={() => onChange({})}
        aria-label="Clear filters"
      >
        <X size={14} />
        Reset
      </button>
    </div>
  );
}
function ReviewLabel({ value }: { value: string }) {
  return (
    <span className={`credit-status credit-${value}`}>
      {(
        {
          pending: 'Needs review',
          approved: 'Approved',
          excluded: 'Excluded',
          not_eligible: 'Not eligible',
        } as Record<string, string>
      )[value] ?? value}
    </span>
  );
}
export function RideFacts({ ride }: { ride: Ride }) {
  const timing = rideTiming(ride);
  return (
    <section className="ride-facts">
      <div className="section-head">
        <h2>Trip record</h2>
        <span>Central Time</span>
      </div>
      {(!ride.familySnapshot || (ride.driverId && !ride.driverSnapshot)) && (
        <p className="ledger-note">
          Legacy record: participant details were not captured with this ride.
          Names may come from the current register.
        </p>
      )}
      <div className="record-timeline">
        {[
          { label: 'Requested', at: ride.createdAt },
          { label: 'Scheduled pickup', at: ride.scheduledAt },
          { label: 'Driver accepted', at: ride.acceptedAt },
          { label: 'Arrived at pickup', at: ride.arrivedAt },
          { label: 'Pickup verified', at: ride.startedAt },
          { label: 'Drop-off confirmed', at: ride.completedAt },
          ...(ride.cancelledAt
            ? [{ label: 'Cancelled', at: ride.cancelledAt }]
            : []),
        ].map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong className="mono">
              {item.at ? `${date(item.at)} · ${time(item.at)}` : '—'}
            </strong>
          </div>
        ))}
      </div>
      <div className="time-breakdown">
        <div>
          <span>Waiting</span>
          <strong>{durationLabel(timing.wait)}</strong>
        </div>
        <div>
          <span>Driving</span>
          <strong>{durationLabel(timing.driving)}</strong>
        </div>
        <div>
          <span>Service time</span>
          <strong>{durationLabel(timing.service)}</strong>
        </div>
      </div>
    </section>
  );
}
function CreditHistory({ id, state }: { id: string; state: State }) {
  const [reviews, setReviews] = useState<ServiceCredit[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(
      `/api/credits?mode=${state.demo ? 'practice' : 'pilot'}&id=${encodeURIComponent(id)}`,
      {
        headers: { 'x-ky-role': state.role },
        signal: controller.signal,
      },
    )
      .then(async (res) => {
        const data = (await res.json()) as {
          reviews: ServiceCredit[];
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? 'History unavailable.');
        setReviews(data.reviews);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [id, state.demo, state.role]);
  return (
    <details className="review-history">
      <summary>Review history</summary>
      {error ? (
        <p role="alert">{error}</p>
      ) : reviews === null ? (
        <p>Loading reviews…</p>
      ) : (
        reviews.map((review) => (
          <div key={review.revision}>
            <strong>
              Revision {review.revision} · {review.status} · {review.minutes}{' '}
              minutes
            </strong>
            <span>
              {review.reviewedBy} · {date(review.reviewedAt)} ·{' '}
              {time(review.reviewedAt)} CT
            </span>
            <p>{review.reason}</p>
          </div>
        ))
      )}
    </details>
  );
}
function CreditDialog({
  ride,
  credit,
  state,
  close,
  commit,
}: {
  ride: Ride;
  credit?: ServiceCredit;
  state: State;
  close: () => void;
  commit: Commit;
}) {
  const timing = rideTiming(ride);
  const [minutes, setMinutes] = useState(
    String(credit?.minutes ?? timing.suggested ?? ''),
  );
  const [status, setStatus] = useState(credit?.status ?? 'approved');
  const [reason, setReason] = useState('');
  const [revision] = useState(credit?.revision ?? 0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await commit({
        op: 'credit.review',
        id: ride.id,
        status,
        minutes: status === 'excluded' ? 0 : Number(minutes),
        reason,
        revision,
      });
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent className="credit-dialog">
        <DialogHeader>
          <DialogTitle>
            {credit ? 'Amend service credit' : 'Review service credit'}
          </DialogTitle>
          <DialogDescription>
            {ride.driverSnapshot?.name ??
              state.drivers.find((d) => d.id === ride.driverId)?.name}{' '}
            · {ride.id}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit}>
          <RideFacts ride={ride} />
          <p className="review-policy">
            Suggested credit uses arrival at pickup through drop-off, including
            waiting, rounded to the nearest minute.{' '}
            {timing.suggested === null
              ? 'Arrival or drop-off time is missing; verify the duration before entering credit.'
              : ''}
          </p>
          <div className="form-grid">
            <div className="filter-select">
              <span>Decision</span>
              <Pick
                label="Credit decision"
                value={status}
                onChange={(v) => setStatus(v as 'approved' | 'excluded')}
                items={[
                  { value: 'approved', label: 'Approve credit' },
                  { value: 'excluded', label: 'Exclude from credit' },
                ]}
              />
            </div>
            <Field
              label="Credited minutes"
              hint={`${((status === 'excluded' ? 0 : Number(minutes) || 0) / 60).toFixed(2)} service hours`}
            >
              <input
                type="number"
                required={status === 'approved'}
                disabled={status === 'excluded'}
                min={0}
                max={1440}
                step={1}
                value={status === 'excluded' ? 0 : minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </Field>
          </div>
          <Field label={credit ? 'Reason for amendment' : 'Review note'}>
            <textarea
              required
              minLength={4}
              maxLength={500}
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Record what you verified or why the credit differs."
            />
          </Field>
          {credit && <CreditHistory id={ride.id} state={state} />}
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={close}
            >
              Cancel
            </button>
            <button className="btn primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save review'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function ServiceHours({
  state,
  navigate,
  commit,
}: { commit: Commit } & ViewProps) {
  const [filters, setFilters] = useState<ReportFilters>({});
  const [selected, setSelected] = useState<string>();
  const [downloadError, setDownloadError] = useState(''),
    [downloading, setDownloading] = useState(false);
  const rides = filterRides(state, { ...filters, status: 'completed' });
  const reviews = state.credits.filter((c) =>
    rides.some((r) => r.id === c.rideId),
  );
  const pending = rides.filter((r) => !reviews.some((c) => c.rideId === r.id));
  const total = approvedMinutes(reviews);
  const selectedRide = state.rides.find((r) => r.id === selected);
  return (
    <>
      <Heading
        title="Service hours"
        description="Arrival at pickup through drop-off, including waiting."
      >
        <button
          className="btn"
          disabled={downloading}
          onClick={async () => {
            setDownloading(true);
            setDownloadError('');
            try {
              await downloadReport(state, { ...filters, status: 'completed' });
            } catch (e) {
              setDownloadError((e as Error).message);
            } finally {
              setDownloading(false);
            }
          }}
        >
          <Download />
          {downloading ? 'Preparing…' : 'Export Excel'}
        </button>
      </Heading>
      <div className="credit-overview">
        <div>
          <span>Approved service</span>
          <strong>
            {(total / 60).toFixed(2)}
            <small>hr</small>
          </strong>
        </div>
        <div>
          <span>Awaiting review</span>
          <strong>
            {pending.length}
            <small>rides</small>
          </strong>
        </div>
        <div>
          <span>Completed rides</span>
          <strong>{rides.length}</strong>
        </div>
        <div>
          <span>Excluded</span>
          <strong>
            {reviews.filter((c) => c.status === 'excluded').length}
          </strong>
        </div>
      </div>
      <Filters state={state} value={filters} onChange={setFilters} review />
      {downloadError && (
        <p className="error-message" role="alert">
          {downloadError}
        </p>
      )}
      <div className="table-panel">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Ride / date</TableHead>
              {state.role === 'admin' && <TableHead>Driver</TableHead>}
              <TableHead>Arrival → drop-off</TableHead>
              <TableHead>Waiting</TableHead>
              <TableHead>Recorded service</TableHead>
              <TableHead>Credited</TableHead>
              <TableHead>Review</TableHead>
              <TableHead>Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rides.map((ride) => {
              const timing = rideTiming(ride),
                credit = reviews.find((c) => c.rideId === ride.id);
              return (
                <TableRow key={ride.id}>
                  <TableCell>
                    <button
                      className="text-link mono"
                      onClick={() => navigate('rides', ride.id)}
                    >
                      {ride.id}
                    </button>
                    <small>{date(ride.scheduledAt)}</small>
                  </TableCell>
                  {state.role === 'admin' && (
                    <TableCell>
                      {ride.driverSnapshot?.name ??
                        state.drivers.find((d) => d.id === ride.driverId)
                          ?.name ??
                        'Unassigned'}
                    </TableCell>
                  )}
                  <TableCell className="mono">
                    {ride.arrivedAt ? time(ride.arrivedAt) : '—'} →{' '}
                    {ride.completedAt ? time(ride.completedAt) : '—'}
                  </TableCell>
                  <TableCell>{durationLabel(timing.wait)}</TableCell>
                  <TableCell>
                    {durationLabel(timing.service)}
                    {timing.suggested === null && (
                      <small>Missing timestamp</small>
                    )}
                  </TableCell>
                  <TableCell>
                    <strong className="mono">
                      {credit ? `${(credit.minutes / 60).toFixed(2)} hr` : '—'}
                    </strong>
                  </TableCell>
                  <TableCell>
                    <ReviewLabel value={credit?.status ?? 'pending'} />
                    {credit && <small>{credit.reviewedBy}</small>}
                  </TableCell>
                  <TableCell>
                    {state.role === 'admin' ? (
                      <button
                        className="btn small"
                        onClick={() => setSelected(ride.id)}
                      >
                        {credit ? 'Amend' : 'Review'}
                      </button>
                    ) : (
                      <button
                        className="icon-btn"
                        aria-label={`Open ${ride.id}`}
                        onClick={() => navigate('rides', ride.id)}
                      >
                        <ArrowUpRight size={17} />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {!rides.length && (
        <div className="plain-empty">
          <strong>No completed rides in this view</strong>
          <p>Change the filters to see other records.</p>
        </div>
      )}
      <p className="ledger-note">
        Only approved credit appears in service-hour totals. Adjustments keep
        their review history. Date filters use the scheduled pickup date in
        Central Time.
      </p>
      {selectedRide && (
        <CreditDialog
          key={selectedRide.id}
          ride={selectedRide}
          credit={state.credits.find((c) => c.rideId === selectedRide.id)}
          state={state}
          close={() => setSelected(undefined)}
          commit={commit}
        />
      )}
    </>
  );
}
export async function downloadReport(state: State, filters: ReportFilters) {
  const params = new URLSearchParams({
    mode: state.demo ? 'practice' : 'pilot',
  });
  for (const [key, value] of Object.entries(filters))
    if (value && value !== 'all') params.set(key, value);
  const res = await fetch('/api/reports?' + params, {
    headers: { 'x-ky-role': state.role },
  });
  if (!res.ok) {
    const error = (await res.json()) as { error?: string };
    throw new Error(error.error ?? 'The export could not be prepared.');
  }
  const url = URL.createObjectURL(await res.blob()),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'kinetic-youth-records.xlsx';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export function RideLedger({ state, open, navigate }: ViewProps) {
  const [filters, setFilters] = useState<ReportFilters>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const rides = filterRides(state, filters);
  return (
    <>
      <Heading
        title="Ride ledger"
        description="Schedule, actual timings, assignments, and service credit."
      >
        <button
          className="btn"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await downloadReport(state, filters);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download />
          {busy ? 'Preparing…' : 'Export Excel'}
        </button>
        <button className="btn primary" onClick={() => open({ kind: 'ride' })}>
          <Plus />
          Schedule ride
        </button>
      </Heading>
      <Filters state={state} value={filters} onChange={setFilters} />
      <div className="ledger-search">
        <SearchBox
          value={filters.query ?? ''}
          onChange={(query) => setFilters({ ...filters, query })}
          placeholder="Search ride ID, driver, student, activity"
        />
        <span>{rides.length} records</span>
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="table-panel">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Ride / pickup time</TableHead>
              <TableHead>Student & route</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Arrival / drop-off</TableHead>
              <TableHead>Service time</TableHead>
              <TableHead>Credit</TableHead>
              <TableHead>Open</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rides.map((ride) => {
              const credit = state.credits.find((c) => c.rideId === ride.id),
                timing = rideTiming(ride);
              return (
                <TableRow key={ride.id}>
                  <TableCell>
                    <strong>
                      {date(ride.scheduledAt)} · {time(ride.scheduledAt)}
                    </strong>
                    <small className="mono">{ride.id}</small>
                  </TableCell>
                  <TableCell>
                    <strong>
                      {ride.familySnapshot?.student ??
                        state.families.find((f) => f.id === ride.familyId)
                          ?.student}
                    </strong>
                    <small>
                      {ride.pickupSnapshot?.name ??
                        state.anchors.find((a) => a.id === ride.pickupId)?.name}
                      <br />→{' '}
                      {ride.dropoffSnapshot?.name ??
                        state.anchors.find((a) => a.id === ride.dropoffId)
                          ?.name}
                    </small>
                  </TableCell>
                  <TableCell>
                    {ride.driverSnapshot?.name ??
                      state.drivers.find((d) => d.id === ride.driverId)?.name ??
                      'Unassigned'}
                  </TableCell>
                  <TableCell>
                    <Badge value={ride.status} />
                  </TableCell>
                  <TableCell>
                    <span className="mono">
                      {ride.arrivedAt ? time(ride.arrivedAt) : '—'}
                    </span>
                    <small>
                      {ride.completedAt ? time(ride.completedAt) : '—'}
                    </small>
                  </TableCell>
                  <TableCell>{durationLabel(timing.service)}</TableCell>
                  <TableCell>
                    <ReviewLabel value={creditState(ride, credit)} />
                    {credit && (
                      <small>{(credit.minutes / 60).toFixed(2)} hr</small>
                    )}
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
      {!rides.length && (
        <div className="plain-empty">
          <strong>No matching rides</strong>
          <p>Adjust the date, driver, or status filters.</p>
        </div>
      )}
      <p className="ledger-note">
        All times are Central Time. Open a ride for addresses, contacts,
        verification events, notes, and full timestamps.
      </p>
    </>
  );
}
