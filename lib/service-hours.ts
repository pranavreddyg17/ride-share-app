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
      const driver = state.drivers.find((d) => d.id === r.driverId);
      const family = state.families.find((f) => f.id === r.familyId);
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
