import { ApiError, db, now, uid, type Context } from '../runtime';
import { requireRole } from '../auth';
import {
  txt,
  email,
  phone,
  bool,
  details,
  day,
  number,
  checkVersion,
} from '../validation';
import { record, list, save, audit } from '../repository';
import { driverReady, inAvailability } from '../eligibility';
import {
  DEFAULT_SLOTS,
  dateKey,
  type Driver,
  type Family,
  type Anchor,
  type Ride,
} from '../../types';
export async function registersCommand(
  c: Context,
  body: Record<string, unknown>,
) {
  const op = txt(body.op, 1, 30);
  if (op === 'driver.save') {
    requireRole(c, 'admin', 'driver');
    const input = details(body.data);
    const id = body.id ? txt(body.id) : uid();
    if (c.role === 'driver' && id !== c.recordId)
      throw new ApiError(403, 'You can update only your own profile.');
    const old = body.id ? await record<Driver>(c, 'drivers', id) : null;
    checkVersion(body, old);
    const dob = day(input.dob);
    const today = dateKey(now());
    const age =
      Number(today.slice(0, 4)) -
      Number(dob.slice(0, 4)) -
      (today.slice(5) < dob.slice(5) ? 1 : 0);
    if (age < 16 || age > 100)
      throw new ApiError(
        400,
        'Drivers must be at least 16. Eligibility still requires coordinator review.',
      );
    const d: Driver = {
      id,
      name: txt(input.name, 2, 100),
      email: email(input.email),
      phone: phone(input.phone),
      smsConsent: bool(input.smsConsent),
      school: txt(input.school, 2, 100),
      dob,
      vehicle: txt(input.vehicle, 4, 100),
      plate: txt(input.plate, 2, 15).toUpperCase(),
      licenseExpiry: day(input.licenseExpiry),
      insuranceExpiry: day(input.insuranceExpiry),
      status: old?.data.status ?? 'review',
      licenseChecked:
        c.role === 'admin'
          ? bool(input.licenseChecked)
          : (old?.data.licenseChecked ?? false),
      insuranceChecked:
        c.role === 'admin'
          ? bool(input.insuranceChecked)
          : (old?.data.insuranceChecked ?? false),
      guardianConsent:
        c.role === 'admin'
          ? bool(input.guardianConsent)
          : (old?.data.guardianConsent ?? false),
      screeningChecked:
        c.role === 'admin'
          ? bool(input.screeningChecked)
          : (old?.data.screeningChecked ?? false),
      notes:
        c.role === 'admin'
          ? txt(input.notes ?? '', 0, 1000)
          : (old?.data.notes ?? ''),
      availability: old?.data.availability ?? DEFAULT_SLOTS,
      createdAt: old?.data.createdAt ?? now(),
      hours: 0,
      rides: 0,
      rating: 0,
    };
    const eligibilityChanged =
      old &&
      (
        [
          'name',
          'dob',
          'vehicle',
          'plate',
          'licenseExpiry',
          'insuranceExpiry',
        ] as const
      ).some((key) => d[key] !== old.data[key]);
    if (eligibilityChanged) {
      if (d.status !== 'suspended') d.status = 'review';
      d.licenseChecked = false;
      d.insuranceChecked = false;
      d.guardianConsent = false;
      d.screeningChecked = false;
    }
    const duplicate = await db()
      .prepare(
        "SELECT id FROM records WHERE workspace=? AND kind='drivers' AND id<>? AND lower(json_extract(data,'$.email'))=?",
      )
      .bind(c.workspace, id, d.email)
      .first();
    if (duplicate)
      throw new ApiError(
        409,
        'A driver with this contact email is already registered. Update the existing record.',
      );
    if (d.status === 'approved') {
      try {
        driverReady(d);
      } catch {
        d.status = 'review';
      }
    }
    const activeRides = (await list<Ride>(c, 'rides')).filter(
      (r) => r.driverId === id && ['arrived', 'in_progress'].includes(r.status),
    );
    if (activeRides.length && d.status !== 'approved')
      throw new ApiError(
        409,
        'Resolve the active trip before changing this driver’s approval.',
      );
    await save(
      c,
      'drivers',
      id,
      d,
      old?.version ?? null,
      "NOT EXISTS (SELECT 1 FROM records d WHERE d.workspace=? AND d.kind='drivers' AND d.id<>? AND lower(json_extract(d.data,'$.email'))=?)" +
        (d.status === 'approved'
          ? ''
          : " AND NOT EXISTS (SELECT 1 FROM records r WHERE r.workspace=? AND r.kind='rides' AND json_extract(r.data,'$.driverId')=? AND json_extract(r.data,'$.status') IN ('arrived','in_progress'))"),
      [
        c.workspace,
        id,
        d.email,
        ...(d.status === 'approved' ? [] : [c.workspace, id]),
      ],
    );
    await audit(
      c,
      `${c.name} ${old ? 'updated' : 'registered'} driver ${d.name}.`,
      'driver',
    );
    return {
      message: eligibilityChanged
        ? 'Driver details saved. Eligibility changed; screening and approval must be reviewed again.'
        : old
          ? 'Driver profile saved.'
          : 'Driver added to the review queue.',
    };
  }
  if (op === 'driver.status') {
    requireRole(c, 'admin');
    const { data: d, version } = await record<Driver>(
      c,
      'drivers',
      txt(body.id),
    );
    checkVersion(body, { version });
    const status = txt(body.status);
    if (!['approved', 'review', 'suspended'].includes(status))
      throw new ApiError(400, 'Invalid driver status.');
    const reason = txt(body.reason, 4, 500);
    if (status === 'approved') driverReady({ ...d, status: 'approved' });
    if (
      status !== 'approved' &&
      (await list<Ride>(c, 'rides')).some(
        (r) =>
          r.driverId === d.id && ['arrived', 'in_progress'].includes(r.status),
      )
    )
      throw new ApiError(
        409,
        'Resolve the active trip before suspending this driver.',
      );
    d.status = status as Driver['status'];
    await save(
      c,
      'drivers',
      d.id,
      d,
      version,
      d.status === 'approved'
        ? ''
        : "NOT EXISTS (SELECT 1 FROM records r WHERE r.workspace=? AND r.kind='rides' AND json_extract(r.data,'$.driverId')=? AND json_extract(r.data,'$.status') IN ('arrived','in_progress'))",
      d.status === 'approved' ? [] : [c.workspace, d.id],
    );
    await audit(c, `${c.name} marked ${d.name} ${status}: ${reason}`, 'driver');
    return { message: 'Driver status updated.' };
  }
  if (op === 'family.save') {
    requireRole(c, 'admin', 'family');
    const input = details(body.data);
    const id = body.id ? txt(body.id) : uid();
    if (c.role === 'family' && id !== c.recordId)
      throw new ApiError(403, 'You can update only your own family.');
    const old = body.id ? await record<Family>(c, 'families', id) : null;
    checkVersion(body, old);
    const f: Family = {
      id,
      guardian: txt(input.guardian, 2, 100),
      student: txt(input.student, 2, 100),
      email: email(input.email),
      phone: phone(input.phone),
      smsConsent: bool(input.smsConsent),
      school: txt(input.school, 2, 100),
      consent: bool(input.consent),
      emergency: phone(input.emergency),
      notes: txt(input.notes ?? '', 0, 1000),
      createdAt: old?.data.createdAt ?? now(),
    };
    if (
      !f.consent &&
      (await list<Ride>(c, 'rides')).some(
        (r) =>
          r.familyId === id && !['completed', 'cancelled'].includes(r.status),
      )
    )
      throw new ApiError(
        409,
        'Cancel or complete scheduled rides before withdrawing consent.',
      );
    await save(
      c,
      'families',
      id,
      f,
      old?.version ?? null,
      f.consent
        ? ''
        : "NOT EXISTS (SELECT 1 FROM records r WHERE r.workspace=? AND r.kind='rides' AND json_extract(r.data,'$.familyId')=? AND json_extract(r.data,'$.status') NOT IN ('completed','cancelled'))",
      f.consent ? [] : [c.workspace, id],
    );
    await audit(
      c,
      `${c.name} ${old ? 'updated' : 'registered'} ${f.student}’s household.`,
      'family',
    );
    return { message: 'Family details saved.' };
  }
  if (op === 'anchor.save') {
    requireRole(c, 'admin');
    const input = details(body.data);
    const id = body.id ? txt(body.id) : uid();
    const old = body.id ? await record<Anchor>(c, 'anchors', id) : null;
    checkVersion(body, old);
    const a: Anchor = {
      id,
      name: txt(input.name, 2, 100),
      address: txt(input.address, 5, 250),
      lat: number(input.lat, -90, 90),
      lng: number(input.lng, -180, 180),
      category: txt(input.category, 2, 50),
      notes: txt(input.notes ?? '', 0, 500),
      active:
        input.active === undefined
          ? (old?.data.active ?? true)
          : bool(input.active),
    };
    await save(c, 'anchors', id, a, old?.version ?? null);
    await audit(c, `${c.name} saved anchor location ${a.name}.`);
    return { message: 'Anchor location saved.' };
  }
  if (op === 'availability') {
    requireRole(c, 'driver');
    const { data: d, version } = await record<Driver>(
      c,
      'drivers',
      c.recordId!,
    );
    driverReady(d);
    checkVersion(body, { version });
    const workspaceVersion = await db()
      .prepare('SELECT revision FROM workspaces WHERE id=?')
      .bind(c.workspace)
      .first<{ revision: number }>();
    const slots = body.slots;
    if (!Array.isArray(slots) || slots.length !== 7)
      throw new ApiError(400, 'Set all seven days.');
    d.availability = slots.map((s, i) => {
      if (
        !s ||
        typeof s !== 'object' ||
        s.day !== i ||
        typeof s.enabled !== 'boolean' ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.start) ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.end) ||
        (s.enabled && s.start >= s.end)
      )
        throw new ApiError(
          400,
          'Availability needs valid start and end times.',
        );
      return { day: i, enabled: s.enabled, start: s.start, end: s.end };
    });
    for (const r of await list<Ride>(c, 'rides'))
      if (
        r.driverId === d.id &&
        !['completed', 'cancelled', 'in_progress', 'arrived'].includes(r.status)
      )
        inAvailability(d, r.scheduledAt);
    await save(
      c,
      'drivers',
      d.id,
      d,
      version,
      'EXISTS (SELECT 1 FROM workspaces WHERE id=? AND revision=?)',
      [c.workspace, workspaceVersion!.revision],
    );
    await audit(c, `${c.name} updated driver availability.`, 'driver');
    return {
      message: 'Your weekly availability is saved.',
      version: version + 1,
    };
  }
  throw new ApiError(400, 'Unknown operation.');
}
