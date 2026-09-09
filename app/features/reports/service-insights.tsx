'use client';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import { reportFacts, summarizeFacts, groupFacts } from '@/lib/service-hours';
import type { Ride, State } from '@/lib/types';

export function ServiceInsights({
  state,
  rides,
}: {
  state: State;
  rides: Ride[];
}) {
  const facts = reportFacts(state, rides);
  const summary = summarizeFacts(facts);
  const months = groupFacts(facts, 'month').slice(-6);
  const drivers = groupFacts(facts, 'driverId').sort(
    (a, b) =>
      b.approvedMinutes - a.approvedMinutes || a.label.localeCompare(b.label),
  );
  const max = Math.max(...months.map((m) => m.approvedMinutes), 1);
  if (!rides.length) return null;
  return (
    <section className="service-insights" aria-label="Service hour analysis">
      <div className="service-trend">
        <div className="section-head">
          <h2>Approved hours by month</h2>
          <span>Selected records · latest 6 months with rides</span>
        </div>
        <div className="trend-rows">
          {months.map((m) => (
            <div className="trend-row" key={m.key}>
              <span>
                {new Intl.DateTimeFormat('en-US', {
                  month: 'short',
                  year: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(m.key + '-15T12:00:00Z'))}
              </span>
              <span className="trend-track" aria-hidden="true">
                <span
                  style={{ width: (m.approvedMinutes / max) * 100 + '%' }}
                />
              </span>
              <strong className="mono">{m.approvedHours.toFixed(2)} hr</strong>
            </div>
          ))}
        </div>
        <div className="record-quality">
          <div>
            <strong>{summary.missingServiceTime}</strong>
            <span>Missing arrival or drop-off time</span>
          </div>
          <div>
            <strong>{summary.coordinatorCompletion}</strong>
            <span>Coordinator drop-off exceptions</span>
          </div>
        </div>
      </div>
      {state.role === 'admin' && (
        <div className="driver-timesheet">
          <div className="section-head">
            <h2>Driver timesheet</h2>
            <span>Current approved credit</span>
          </div>
          <Table className="data-table">
            <TableHeader>
              <TableRow>
                <TableHead>Driver</TableHead>
                <TableHead>Completed</TableHead>
                <TableHead>Needs review</TableHead>
                <TableHead>Hours</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => (
                <TableRow key={d.key}>
                  <TableCell>{d.label}</TableCell>
                  <TableCell>{d.completed}</TableCell>
                  <TableCell>{d.needsReview}</TableCell>
                  <TableCell className="mono">
                    <strong>{d.approvedHours.toFixed(2)}</strong>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
