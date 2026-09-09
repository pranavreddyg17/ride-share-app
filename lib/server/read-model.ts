import { db, now, type Context } from './runtime';
import { canSeeRide } from './auth';
import { approvedMinutes } from '../service-hours';
import type {
  State,
  Role,
  Ride,
  Driver,
  Family,
  Anchor,
  ServiceCredit,
} from '../types';
import { mergeLocation, type LocationRow } from './locations';
export async function state(c: Context): Promise<State> {
  // Read related records together so a report cannot mix old credits with new rides.
  const rows = await db()
    .prepare(
      "SELECT kind,data,version FROM records WHERE workspace=? AND kind IN ('drivers','families','rides','anchors','credits')",
    )
    .bind(c.workspace)
    .all<{ kind: string; data: string; version: number }>();
  const records = <T>(kind: string): T[] =>
    rows.results
      .filter((r) => r.kind === kind)
      .map((r) => ({
        ...JSON.parse(r.data),
        ...(['drivers', 'families', 'anchors'].includes(kind)
          ? { version: r.version }
          : {}),
      }));
  const credits = records<ServiceCredit>('credits');
  const drivers = records<Driver>('drivers'),
    families = records<Family>('families'),
    rides = records<Ride>('rides'),
    anchors = records<Anchor>('anchors');
  const [eventResult, ws, memberResult] = await Promise.all([
    db()
      .prepare(
        "SELECT * FROM events WHERE workspace=? AND (id IN (SELECT id FROM events WHERE workspace=? ORDER BY created_at DESC LIMIT 100) OR (kind='sos' AND resolved=0)) ORDER BY created_at DESC",
      )
      .bind(c.workspace, c.workspace)
      .all<{
        id: string;
        ride_id: string | null;
        kind: string;
        message: string;
        created_at: string;
        resolved: number;
        note: string;
        actor_id: string | null;
        actor_email: string | null;
        actor_role: string | null;
        action: string | null;
        request_id: string | null;
        entity_kind: string | null;
        entity_id: string | null;
      }>(),
    db()
      .prepare('SELECT settings FROM workspaces WHERE id=?')
      .bind(c.workspace)
      .first<{ settings: string }>(),
    c.role === 'admin' && !c.demo
      ? db().prepare('SELECT email,role,record_id,name FROM members').all<{
          email: string;
          role: Role;
          record_id: string | null;
          name: string;
        }>()
      : Promise.resolve({ results: [] }),
  ]);
  const locations = await db()
    .prepare('SELECT * FROM ride_locations WHERE workspace=?')
    .bind(c.workspace)
    .all<LocationRow>();
  const visibleRides = rides
    .filter((r) => canSeeRide(c, r))
    .map((r) =>
      mergeLocation(
        c,
        r,
        locations.results.find((l) => l.ride_id === r.id),
      ),
    );
  const driverIds = new Set(visibleRides.map((r) => r.driverId));
  const contactableDrivers = new Set(
    visibleRides
      .filter((r) => ['accepted', 'arrived', 'in_progress'].includes(r.status))
      .map((r) => r.driverId),
  );
  const familyIds = new Set(visibleRides.map((r) => r.familyId));
  const contactableFamilies = new Set(
    visibleRides
      .filter(
        (r) =>
          r.driverId === c.recordId &&
          ['accepted', 'arrived', 'in_progress'].includes(r.status),
      )
      .map((r) => r.familyId),
  );
  const visibleDrivers = drivers
    .filter(
      (d) =>
        c.role === 'admin' ||
        (c.role === 'driver' ? d.id === c.recordId : driverIds.has(d.id)),
    )
    .map((d) => {
      const completed = rides.filter(
        (r) => r.driverId === d.id && r.status === 'completed',
      );
      const rated = completed.filter((r) => r.rating);
      const summary = {
        ...d,
        creditedHours: approvedMinutes(credits, d.id) / 60,
        rides: completed.length,
        hours: completed.reduce(
          (n, r) =>
            n +
            (r.completedAt && r.startedAt
              ? (Date.parse(r.completedAt) - Date.parse(r.startedAt)) / 3600000
              : 0),
          0,
        ),
        rating: rated.length
          ? rated.reduce((n, r) => n + (r.rating ?? 0), 0) / rated.length
          : 0,
      };
      if (c.role === 'family')
        return {
          ...summary,
          creditedHours: undefined,
          dob: '',
          email: '',
          phone: contactableDrivers.has(d.id) ? d.phone : '',
          licenseExpiry: '',
          insuranceExpiry: '',
          notes: '',
          availability: [],
        };
      return summary;
    });
  return {
    demo: c.demo,
    role: c.role,
    recordId: c.recordId,
    name: c.name,
    email: c.email,
    credits: credits.filter(
      (credit) =>
        c.role === 'admin' ||
        (c.role === 'driver' && credit.driverId === c.recordId),
    ),
    drivers: visibleDrivers,
    families: families
      .filter(
        (f) =>
          c.role === 'admin' ||
          (c.role === 'family' ? f.id === c.recordId : familyIds.has(f.id)),
      )
      .map((f) =>
        c.role === 'driver'
          ? {
              ...f,
              email: '',
              notes: '',
              emergency: '',
              phone: contactableFamilies.has(f.id) ? f.phone : '',
            }
          : f,
      ),
    rides: visibleRides
      .map((r) => ({
        ...r,
        completion: c.role === 'admin' ? r.completion : undefined,
        otp:
          c.role === 'family' &&
          r.status === 'arrived' &&
          r.otpExpiresAt &&
          r.otpExpiresAt > now()
            ? r.otp
            : null,
        otpAttempts: c.role === 'driver' ? r.otpAttempts : 0,
      }))
      .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    anchors,
    events: eventResult.results
      .filter(
        (e) =>
          c.role === 'admin' ||
          (e.ride_id &&
            visibleRides.some((r) => r.id === e.ride_id) &&
            !(e.kind === 'service_credit' && c.role === 'family')),
      )
      .map((e) => ({
        id: e.id,
        rideId: e.ride_id,
        kind: e.kind,
        message: e.message,
        createdAt: e.created_at,
        resolved: !!e.resolved,
        note: e.note,
        ...(c.role === 'admin'
          ? {
              actorId: e.actor_id,
              actorEmail: e.actor_email,
              actorRole: e.actor_role,
              action: e.action,
              requestId: e.request_id,
              entityKind: e.entity_kind,
              entityId: e.entity_id,
            }
          : {}),
      })),
    members: memberResult.results.map((m) => ({
      email: m.email,
      role: m.role,
      recordId: m.record_id,
      name: m.name,
    })),
    settings: JSON.parse(ws!.settings),
    serverTime: now(),
  };
}
