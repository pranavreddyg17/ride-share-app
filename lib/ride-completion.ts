import type { Ride } from './types';

/** Reject calendar normalization (February 30), local times, and 24:00 rollover. */
export function parseInstant(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match =
    /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d{1,3})?(Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.exec(
      value,
    );
  if (!match) return null;
  const calendar = Date.parse(match[1]);
  const instant = Date.parse(value);
  if (
    !Number.isFinite(calendar) ||
    !Number.isFinite(instant) ||
    new Date(calendar).toISOString().slice(0, 10) !== match[1]
  )
    return null;
  return new Date(instant).toISOString();
}

export function completionTime(
  ride: Pick<Ride, 'startedAt' | 'arrivedAt'>,
  value: unknown,
  recordedAt: string,
): string {
  const completed = parseInstant(value);
  const started = parseInstant(ride.startedAt);
  const arrived = parseInstant(ride.arrivedAt);
  if (!started || !arrived || arrived > started)
    throw new Error(
      'This ride has an incomplete or inconsistent pickup record. Review it before closing the ride.',
    );
  if (!completed)
    throw new Error(
      'Enter a valid drop-off date and time, including its timezone.',
    );
  if (completed < started || completed > recordedAt)
    throw new Error(
      'Drop-off time must be after pickup verification and cannot be in the future.',
    );
  return completed;
}

export function completionLabel(
  ride: Pick<Ride, 'status' | 'completionMethod'>,
): string {
  if (ride.status !== 'completed') return 'Not completed';
  if (ride.completionMethod === 'coordinator_verified')
    return 'Coordinator verified exception';
  if (ride.completionMethod === 'driver_gps') return 'Driver device GPS';
  if (ride.completionMethod === 'practice') return 'Practice confirmation';
  return 'Historical record: evidence not captured';
}
