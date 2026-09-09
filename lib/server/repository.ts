import { ApiError, db, now, uid, type Context } from './runtime';
import type { Driver, Ride } from '../types';
import { notificationStatements } from '../notifications';
import { withLocation } from './locations';
import { driverReady, driverSnapshot, inAvailability } from './eligibility';
export async function list<T>(c: Context, kind: string): Promise<T[]> {
  const result = await db()
    .prepare('SELECT data,version FROM records WHERE workspace=? AND kind=?')
    .bind(c.workspace, kind)
    .all<{ data: string; version: number }>();
  return result.results.map((r) => ({
    ...JSON.parse(r.data),
    ...(['drivers', 'families', 'anchors'].includes(kind)
      ? { version: r.version }
      : {}),
  }));
}
export async function record<T>(c: Context, kind: string, id: string) {
  const row = await db()
    .prepare(
      'SELECT data,version FROM records WHERE workspace=? AND kind=? AND id=?',
    )
    .bind(c.workspace, kind, id)
    .first<{ data: string; version: number }>();
  if (!row) throw new ApiError(404, 'This record could not be found.');
  let data = JSON.parse(row.data) as T;
  if (kind === 'rides') data = (await withLocation(c, data as Ride)) as T;
  return { data, version: row.version };
}
export async function audit(
  c: Context,
  message: string,
  kind = 'info',
  rideId: string | null = null,
) {
  const statement = db()
    .prepare(
      'INSERT INTO events (workspace,id,ride_id,kind,message,created_at,actor_id,actor_email,actor_role,action,request_id,entity_kind,entity_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
    )
    .bind(
      c.workspace,
      uid(),
      rideId,
      kind,
      message,
      now(),
      c.userId,
      c.email,
      c.role,
      c.action ?? null,
      c.requestId,
      c.entityKind ?? (rideId ? 'rides' : null),
      c.entityId ?? rideId,
    );
  (c.writes.length ? c.after : c.writes).push(statement);
  if (rideId && !c.demo && ['ride', 'sos'].includes(kind))
    c.after.push(...notificationStatements(c.workspace, rideId, kind));
}
export async function save(
  c: Context,
  kind: string,
  id: string,
  data: unknown,
  version: number | null,
  guard = '',
  guardValues: unknown[] = [],
) {
  c.entityKind = kind;
  c.entityId = id;
  if (kind === 'rides' && !c.demo) {
    data = {
      ...(data as Ride),
      lat: null,
      lng: null,
      accuracy: null,
      locationAt: null,
      locationReceivedAt: null,
      locationSource: null,
    };
  }
  let statement;
  if (version === null) {
    statement = db()
      .prepare(
        'INSERT INTO records (workspace,kind,id,data) SELECT ?,?,?,?' +
          (guard ? ' WHERE ' + guard : ''),
      )
      .bind(c.workspace, kind, id, JSON.stringify(data), ...guardValues);
  } else {
    statement = db()
      .prepare(
        'UPDATE records SET data=?,version=version+1 WHERE workspace=? AND kind=? AND id=? AND version=?' +
          (guard ? ' AND ' + guard : ''),
      )
      .bind(
        JSON.stringify(data),
        c.workspace,
        kind,
        id,
        version,
        ...guardValues,
      );
  }
  c.writes.push(statement);
}
export async function saveRide(c: Context, r: Ride, version: number | null) {
  const guards: string[] = [];
  const args: unknown[] = [];
  if (!['completed', 'cancelled'].includes(r.status)) {
    guards.push(
      `EXISTS (SELECT 1 FROM records f WHERE f.workspace=? AND f.kind='families' AND f.id=? AND json_extract(f.data,'$.consent')=1)`,
    );
    args.push(c.workspace, r.familyId);
    guards.push(
      `NOT EXISTS (SELECT 1 FROM records other WHERE other.workspace=? AND other.kind='rides' AND other.id<>? AND json_extract(other.data,'$.familyId')=? AND json_extract(other.data,'$.status') NOT IN ('completed','cancelled') AND ABS(julianday(json_extract(other.data,'$.scheduledAt'))-julianday(?))<45.0/1440)`,
    );
    args.push(c.workspace, r.id, r.familyId, r.scheduledAt);
    if (r.driverId) {
      const { data: d, version: driverVersion } = await record<Driver>(
        c,
        'drivers',
        r.driverId,
      );
      driverReady(d, r.scheduledAt);
      driverReady(d);
      if (
        r.status === 'pending' ||
        r.status === 'accepted' ||
        (r.status === 'arrived' && !r.startedAt)
      )
        r.driverSnapshot = driverSnapshot(d);
      if (['pending', 'accepted'].includes(r.status))
        inAvailability(d, r.scheduledAt);
      guards.push(
        `NOT EXISTS (SELECT 1 FROM records other WHERE other.workspace=? AND other.kind='rides' AND other.id<>? AND json_extract(other.data,'$.driverId')=? AND json_extract(other.data,'$.status') NOT IN ('completed','cancelled') AND ABS(julianday(json_extract(other.data,'$.scheduledAt'))-julianday(?))<45.0/1440)`,
      );
      args.push(c.workspace, r.id, r.driverId, r.scheduledAt);
      guards.push(
        `EXISTS (SELECT 1 FROM records d WHERE d.workspace=? AND d.kind='drivers' AND d.id=? AND d.version=?)`,
      );
      args.push(c.workspace, d.id, driverVersion);
      if (['arrived', 'in_progress'].includes(r.status)) {
        guards.push(
          `NOT EXISTS (SELECT 1 FROM records other WHERE other.workspace=? AND other.kind='rides' AND other.id<>? AND (json_extract(other.data,'$.driverId')=? OR json_extract(other.data,'$.familyId')=?) AND json_extract(other.data,'$.status') IN ('arrived','in_progress'))`,
        );
        args.push(c.workspace, r.id, r.driverId, r.familyId);
      }
    }
  }
  await save(
    c,
    'rides',
    r.id,
    c.demo
      ? r
      : {
          ...r,
          lat: null,
          lng: null,
          accuracy: null,
          locationAt: null,
          locationSource: null,
        },
    version,
    guards.join(' AND '),
    args,
  );
  c.after.push(
    db()
      .prepare('UPDATE workspaces SET revision=revision+1 WHERE id=?')
      .bind(c.workspace),
  );
}
