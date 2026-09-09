import { ApiError, db, now, type Context } from '../runtime';
import { requireRole } from '../auth';
import { txt, phone, bool, number } from '../validation';
import { record, audit } from '../repository';
import { driverReady } from '../eligibility';
import { type Driver, type Ride, type Settings } from '../../types';
export async function operationsCommand(
  c: Context,
  body: Record<string, unknown>,
) {
  const op = txt(body.op, 1, 30);
  if (op === 'location') {
    requireRole(c, 'driver');
    const { data: r } = await record<Ride>(c, 'rides', txt(body.id));
    if (
      r.driverId !== c.recordId ||
      !['accepted', 'arrived', 'in_progress'].includes(r.status)
    )
      throw new ApiError(
        403,
        'Location sharing is restricted to your active ride.',
      );
    const { data: driver, version: driverVersion } = await record<Driver>(
      c,
      'drivers',
      c.recordId!,
    );
    driverReady(driver);
    if (body.source === 'simulation' && !c.demo)
      throw new ApiError(
        403,
        'Simulated locations are limited to practice mode.',
      );
    if (
      body.source !== undefined &&
      body.source !== 'device' &&
      body.source !== 'simulation'
    )
      throw new ApiError(400, 'Unknown location source.');
    const captured = Date.parse(txt(body.capturedAt, 20, 40));
    if (
      !Number.isFinite(captured) ||
      captured < Date.now() - 30000 ||
      captured > Date.now() + 10000
    )
      throw new ApiError(
        400,
        'Location is too old or its device clock is incorrect. Acquire a fresh GPS fix.',
      );
    const lat = number(body.lat, -90, 90),
      lng = number(body.lng, -180, 180),
      accuracy = number(body.accuracy, 0, 100000);
    const source = body.source === 'simulation' ? 'simulation' : 'device';
    c.writes.push(
      db()
        .prepare(`INSERT INTO ride_locations (workspace,ride_id,lat,lng,accuracy,captured_at,received_at,source)
      SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM records WHERE workspace=? AND kind='rides' AND id=? AND json_extract(data,'$.driverId')=? AND json_extract(data,'$.status') IN ('accepted','arrived','in_progress'))
      AND EXISTS (SELECT 1 FROM records WHERE workspace=? AND kind='drivers' AND id=? AND version=?)
      ON CONFLICT(workspace,ride_id) DO UPDATE SET lat=excluded.lat,lng=excluded.lng,accuracy=excluded.accuracy,captured_at=excluded.captured_at,received_at=excluded.received_at,source=excluded.source
      WHERE excluded.captured_at>ride_locations.captured_at`)
        .bind(
          c.workspace,
          r.id,
          lat,
          lng,
          accuracy,
          new Date(captured).toISOString(),
          now(),
          source,
          c.workspace,
          r.id,
          c.recordId,
          c.workspace,
          driver.id,
          driverVersion,
        ),
    );
    return { message: 'Location shared.' };
  }
  if (op === 'event.resolve') {
    requireRole(c, 'admin');
    c.entityKind = 'events';
    c.entityId = txt(body.id);
    const note = txt(body.note, 4, 500);
    const alert = await db()
      .prepare(
        "SELECT ride_id,resolved FROM events WHERE workspace=? AND id=? AND kind='sos'",
      )
      .bind(c.workspace, c.entityId)
      .first<{ ride_id: string | null; resolved: number }>();
    if (!alert) throw new ApiError(404, 'Help request not found.');
    if (alert.resolved)
      throw new ApiError(409, 'This help request is already resolved.');
    c.writes.push(
      db()
        .prepare(
          "UPDATE events SET resolved=1,note=? WHERE workspace=? AND id=? AND kind='sos' AND resolved=0",
        )
        .bind(`${c.name}: ${note}`, c.workspace, txt(body.id)),
    );
    await audit(
      c,
      `${c.name} resolved help request ${txt(body.id)}: ${note}`,
      'safety',
      alert.ride_id ?? undefined,
    );
    return { message: 'Help request resolved.' };
  }
  if (op === 'settings') {
    requireRole(c, 'admin');
    c.entityKind = 'workspaces';
    c.entityId = c.workspace;
    const s: Settings = {
      coordinator: txt(body.coordinator, 2, 100),
      contactPhone: phone(body.contactPhone, true),
      pilotName: txt(body.pilotName, 2, 100),
      smsConsent: bool(body.smsConsent),
    };
    c.writes.push(
      db()
        .prepare('UPDATE workspaces SET settings=? WHERE id=?')
        .bind(JSON.stringify(s), c.workspace),
    );
    await audit(c, `${c.name} updated pilot settings.`, 'settings');
    return { message: 'Pilot settings saved.' };
  }
  throw new ApiError(400, 'Unknown operation.');
}
