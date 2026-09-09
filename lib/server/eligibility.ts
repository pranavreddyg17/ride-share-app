import { ApiError, now } from './runtime';
import { dateKey, type Driver, type Family, type Ride } from '../types';
export function driverSnapshot(d: Driver): NonNullable<Ride['driverSnapshot']> {
  return {
    id: d.id,
    name: d.name,
    school: d.school,
    vehicle: d.vehicle,
    plate: d.plate,
  };
}
export function familySnapshot(f: Family): NonNullable<Ride['familySnapshot']> {
  return {
    id: f.id,
    student: f.student,
    guardian: f.guardian,
    school: f.school,
  };
}
export function driverReady(d: Driver, at = now()) {
  if (
    d.status !== 'approved' ||
    !d.licenseChecked ||
    !d.insuranceChecked ||
    !d.guardianConsent ||
    !d.screeningChecked ||
    d.licenseExpiry < dateKey(at) ||
    d.insuranceExpiry < dateKey(at)
  )
    throw new ApiError(
      409,
      'This driver needs current approval, consent, license and insurance reviews before taking rides.',
    );
}
export function inAvailability(d: Driver, at: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(at));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    get('weekday'),
  );
  const minutes = Number(get('hour')) * 60 + Number(get('minute'));
  const slot = d.availability.find((s) => s.day === day);
  const asMinutes = (s: string) =>
    Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
  if (
    !slot?.enabled ||
    minutes < asMinutes(slot.start) ||
    minutes + 30 > asMinutes(slot.end)
  )
    throw new ApiError(
      409,
      'The ride must fit within the driver’s availability, including 30 minutes for the trip.',
    );
}
