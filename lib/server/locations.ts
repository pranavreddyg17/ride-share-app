import { db, type Context } from './runtime';
import type { Ride } from '../types';
export function distance(a: number, b: number, c: number, d: number) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const x =
    Math.sin(rad(c - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export type LocationRow = {
  ride_id: string;
  lat: number;
  lng: number;
  accuracy: number;
  captured_at: string;
  received_at: string;
  source: 'device' | 'simulation';
};
export function mergeLocation(
  c: Context,
  r: Ride,
  l?: LocationRow | null,
): Ride {
  if (l)
    return {
      ...r,
      lat: l.lat,
      lng: l.lng,
      accuracy: l.accuracy,
      locationAt: l.captured_at,
      locationReceivedAt: l.received_at,
      locationSource: l.source,
    };
  return c.demo
    ? r
    : {
        ...r,
        lat: null,
        lng: null,
        accuracy: null,
        locationAt: null,
        locationSource: null,
      };
}
export async function withLocation(c: Context, r: Ride) {
  const l = await db()
    .prepare('SELECT * FROM ride_locations WHERE workspace=? AND ride_id=?')
    .bind(c.workspace, r.id)
    .first<LocationRow>();
  return mergeLocation(c, r, l);
}
export function clearLocation(c: Context, r: Ride) {
  r.lat = null;
  r.lng = null;
  r.locationAt = null;
  r.accuracy = null;
  r.locationSource = null;
  c.after.push(
    db()
      .prepare('DELETE FROM ride_locations WHERE workspace=? AND ride_id=?')
      .bind(c.workspace, r.id),
  );
}
