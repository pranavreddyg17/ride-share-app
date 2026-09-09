import type { Ride, ServiceCredit, State } from './types';
export function elapsedMinutes(
  start?: string | null,
  end?: string | null,
): number | null {
  if (!start || !end) return null;
  const difference = Date.parse(end) - Date.parse(start);
  return Number.isFinite(difference) && difference >= 0
    ? difference / 60000
    : null;
}
export function rideTiming(ride: Ride) {
  const service = elapsedMinutes(ride.arrivedAt, ride.completedAt);
  return {
    wait: elapsedMinutes(ride.arrivedAt, ride.startedAt),
    driving: elapsedMinutes(ride.startedAt, ride.completedAt),
    service,
    suggested:
      ride.status === 'completed' && service !== null
        ? Math.round(service)
        : null,
  };
}
export const durationLabel = (minutes: number | null | undefined) => {
  if (minutes == null) return '—';
  const rounded = Math.round(minutes);
  return rounded >= 60
    ? `${Math.floor(rounded / 60)}h ${rounded % 60}m`
    : `${rounded}m`;
};
export const approvedMinutes = (credits: ServiceCredit[], driverId?: string) =>
  credits
    .filter(
      (c) => c.status === 'approved' && (!driverId || c.driverId === driverId),
    )
    .reduce((n, c) => n + c.minutes, 0);
export function creditState(ride: Ride, credit?: ServiceCredit) {
  return ride.status !== 'completed'
    ? 'not_eligible'
    : (credit?.status ?? 'pending');
}
export type ReportFilters = {
  from?: string;
  to?: string;
  driver?: string;
  status?: string;
  review?: string;
  query?: string;
};
export function filterRides(state: State, filters: ReportFilters) {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return state.rides
    .filter((r) => {
      const date = day.format(new Date(r.scheduledAt));
      const credit = state.credits.find((c) => c.rideId === r.id);
      const driver =
        r.driverSnapshot ?? state.drivers.find((d) => d.id === r.driverId);
      const family =
        r.familySnapshot ?? state.families.find((f) => f.id === r.familyId);
      return (
        (!filters.from || date >= filters.from) &&
        (!filters.to || date <= filters.to) &&
        (!filters.driver ||
          filters.driver === 'all' ||
          r.driverId === filters.driver) &&
        (!filters.status ||
          filters.status === 'all' ||
          r.status === filters.status) &&
        (!filters.review ||
          filters.review === 'all' ||
          creditState(r, credit) === filters.review) &&
        (!filters.query ||
          `${r.id} ${driver?.name ?? ''} ${family?.student ?? ''} ${r.activity}`
            .toLowerCase()
            .includes(filters.query.toLowerCase()))
      );
    })
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
}

export type ReportFact = {
  rideId: string;
  date: string;
  month: string;
  driverId: string;
  driver: string;
  school: string;
  status: Ride['status'];
  completed: number;
  cancelled: number;
  needsReview: number;
  excluded: number;
  missingServiceTime: number;
  coordinatorCompletion: number;
  waitingMinutes: number | null;
  drivingMinutes: number | null;
  serviceMinutes: number | null;
  approvedMinutes: number;
  approvedHours: number;
};

/** One row per ride; review revisions never multiply approved service totals. */
export function reportFacts(state: State, rides: Ride[]): ReportFact[] {
  const dates = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const credits = new Map(state.credits.map((c) => [c.rideId, c]));
  const drivers = new Map(state.drivers.map((d) => [d.id, d]));
  return rides.map((ride) => {
    const completed = ride.status === 'completed';
    const credit = completed ? credits.get(ride.id) : undefined;
    const driver = ride.driverSnapshot ?? drivers.get(ride.driverId ?? '');
    const timing = rideTiming(ride);
    const date = dates.format(new Date(ride.scheduledAt));
    const approved = credit?.status === 'approved' ? credit.minutes : 0;
    return {
      rideId: ride.id,
      date,
      month: date.slice(0, 7),
      driverId: ride.driverId ?? '',
      driver: driver?.name ?? 'Unassigned',
      school: driver?.school ?? '',
      status: ride.status,
      completed: Number(completed),
      cancelled: Number(ride.status === 'cancelled'),
      needsReview: Number(completed && !credit),
      excluded: Number(credit?.status === 'excluded'),
      missingServiceTime: Number(completed && timing.service === null),
      coordinatorCompletion: Number(
        completed && ride.completionMethod === 'coordinator_verified',
      ),
      waitingMinutes: completed ? timing.wait : null,
      drivingMinutes: completed ? timing.driving : null,
      serviceMinutes: completed ? timing.service : null,
      approvedMinutes: approved,
      approvedHours: approved / 60,
    };
  });
}

export function summarizeFacts(facts: ReportFact[]) {
  return {
    rides: facts.length,
    completed: facts.reduce((n, f) => n + f.completed, 0),
    cancelled: facts.reduce((n, f) => n + f.cancelled, 0),
    needsReview: facts.reduce((n, f) => n + f.needsReview, 0),
    excluded: facts.reduce((n, f) => n + f.excluded, 0),
    missingServiceTime: facts.reduce((n, f) => n + f.missingServiceTime, 0),
    coordinatorCompletion: facts.reduce(
      (n, f) => n + f.coordinatorCompletion,
      0,
    ),
    waitingMinutes: facts.reduce((n, f) => n + (f.waitingMinutes ?? 0), 0),
    drivingMinutes: facts.reduce((n, f) => n + (f.drivingMinutes ?? 0), 0),
    serviceMinutes: facts.reduce((n, f) => n + (f.serviceMinutes ?? 0), 0),
    approvedMinutes: facts.reduce((n, f) => n + f.approvedMinutes, 0),
    approvedHours: facts.reduce((n, f) => n + f.approvedMinutes, 0) / 60,
  };
}

export function groupFacts(
  facts: ReportFact[],
  dimension: 'date' | 'month' | 'driverId',
) {
  const groups = new Map<string, ReportFact[]>();
  for (const fact of facts) {
    const key = fact[dimension];
    const group = groups.get(key) ?? [];
    group.push(fact);
    groups.set(key, group);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, rows]) => ({
      key,
      label: dimension === 'driverId' ? rows[0].driver : key,
      ...summarizeFacts(rows),
    }));
}
