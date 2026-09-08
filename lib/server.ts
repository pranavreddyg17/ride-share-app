import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { sampleData } from './seed';
import { notificationStatements } from './notifications';
import {
  DEFAULT_SLOTS,
  type Role,
  type State,
  type Driver,
  type Family,
  type Ride,
  type Anchor,
  type Settings,
} from './types';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const db = () => {
  if (!env.DB)
    throw new ApiError(
      503,
      'The pilot database is unavailable. Please try again.',
    );
  return env.DB;
};
const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
export type Context = {
  writes: D1PreparedStatement[];
  after: D1PreparedStatement[];
  workspace: string;
  demo: boolean;
  role: Role;
  recordId: string | null;
  name: string;
  email: string;
};
export async function context(req: Request): Promise<Context> {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, 'Sign in to access your pilot workspace.');
  const demo = new URL(req.url).searchParams.get('mode') === 'practice';
  if (demo) {
    const workspace = 'practice:' + user.userId;
    await initialize(workspace, true);
    const requested = req.headers.get('x-ky-role');
    const role: Role =
      requested === 'driver'
        ? 'driver'
        : requested === 'family'
          ? 'family'
          : 'admin';
    return {
      workspace,
      demo,
      writes: [],
      after: [],
      role,
      recordId: role === 'driver' ? 'd1' : role === 'family' ? 'f1' : null,
      name:
        role === 'driver'
          ? 'Aiden Mitchell'
          : role === 'family'
            ? 'Sarah Wilson'
            : 'Alex Morgan',
      email: user.email,
    };
  }
  await initialize('pilot', false);
  // Only the configured owner may initialize access, regardless of site audience.
  const owner = env.KY_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (owner && user.email.toLowerCase() === owner) {
    await db()
      .prepare(
        "INSERT OR IGNORE INTO members (email,user_id,role,record_id,name) SELECT ?,?,'admin',NULL,? WHERE NOT EXISTS (SELECT 1 FROM members)",
      )
      .bind(owner, user.userId, user.fullName ?? user.email)
      .run();
  }
  const member = await db()
    .prepare(
      'SELECT email,user_id,role,record_id,name FROM members WHERE email=?',
    )
    .bind(user.email.toLowerCase())
    .first<{
      email: string;
      user_id: string | null;
      role: Role;
      record_id: string | null;
      name: string;
    }>();
  if (!member)
    throw new ApiError(
      403,
      'Your account is not on the pilot register yet. Ask the coordinator to add your sign-in email.',
    );
  if (member.user_id && member.user_id !== user.userId)
    throw new ApiError(403, 'This account needs coordinator review.');
  const bound = await db()
    .prepare(
      'UPDATE members SET user_id=? WHERE email=? AND (user_id IS NULL OR user_id=?) RETURNING user_id',
    )
    .bind(user.userId, member.email, user.userId)
    .first();
  if (!bound) throw new ApiError(403, 'This account needs coordinator review.');
  return {
    workspace: 'pilot',
    writes: [],
    after: [],
    demo: false,
    role: member.role,
    recordId: member.record_id,
    name: member.name,
    email: member.email,
  };
}
async function initialize(workspace: string, demo: boolean) {
  const found = await db()
    .prepare('SELECT id FROM workspaces WHERE id=?')
    .bind(workspace)
    .first();
  if (found) return;
  const settings: Settings = {
    coordinator: demo ? 'Alex Morgan' : 'Pilot coordinator',
    contactPhone: '',
    pilotName: 'North Texas pilot',
  };
  const ops = [
    db()
      .prepare(
        'INSERT OR IGNORE INTO workspaces (id,settings,created_at) VALUES (?,?,?)',
      )
      .bind(workspace, JSON.stringify(settings), now()),
  ];
  if (demo) {
    const data = sampleData();
    for (const [kind, items] of Object.entries(data))
      for (const item of items)
        ops.push(
          db()
            .prepare(
              'INSERT OR IGNORE INTO records (workspace,kind,id,data) VALUES (?,?,?,?)',
            )
            .bind(workspace, kind, item.id, JSON.stringify(item)),
        );
    ops.push(
      db()
        .prepare(
          "INSERT OR IGNORE INTO events (workspace,id,kind,message,created_at) VALUES (?,'welcome','info','Practice workspace ready. All people and ride records here are fictional.',?)",
        )
        .bind(workspace, now()),
    );
  }
  await db().batch(ops);
}
export async function list<T>(c: Context, kind: string): Promise<T[]> {
  const result = await db()
    .prepare('SELECT data FROM records WHERE workspace=? AND kind=?')
    .bind(c.workspace, kind)
    .all<{ data: string }>();
  return result.results.map((r) => JSON.parse(r.data));
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
export function requireRole(c: Context, ...roles: Role[]) {
  if (!roles.includes(c.role))
    throw new ApiError(403, 'You do not have permission to do this.');
}
export function canSeeRide(c: Context, r: Ride) {
  return (
    c.role === 'admin' ||
    (c.role === 'family' && c.recordId === r.familyId) ||
    (c.role === 'driver' && c.recordId === r.driverId)
  );
}
const txt = (v: unknown, min = 1, max = 200) => {
  if (typeof v !== 'string' || v.trim().length < min || v.trim().length > max)
    throw new ApiError(
      400,
      `Please enter ${min}–${max} characters in every required field.`,
    );
  return v.trim();
};
const email = (v: unknown) => {
  const e = txt(v, 5, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
    throw new ApiError(400, 'Enter a valid email address.');
  return e;
};
const phone = (v: unknown, optional = false) => {
  if (optional && !v) return '';
  const p = txt(v, 10, 20).replace(/[\s().-]/g, '');
  if (!/^\+1\d{10}$/.test(p))
    throw new ApiError(
      400,
      'Use a US phone number with country code, such as +12145550123.',
    );
  return p;
};
const bool = (v: unknown) => v === true;
function day(v: unknown) {
  const s = txt(v, 10, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    !Number.isFinite(Date.parse(s)) ||
    new Date(s).toISOString().slice(0, 10) !== s
  )
    throw new ApiError(400, 'Enter a valid date.');
  return s;
}
function number(v: unknown, min: number, max: number) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw new ApiError(400, 'Enter a number within the allowed range.');
  return v;
}
function driverReady(d: Driver, at = now()) {
  if (
    d.status !== 'approved' ||
    !d.licenseChecked ||
    !d.insuranceChecked ||
    !d.guardianConsent ||
    !d.screeningChecked ||
    d.licenseExpiry < at.slice(0, 10) ||
    d.insuranceExpiry < at.slice(0, 10)
  )
    throw new ApiError(
      409,
      'This driver needs current approval, consent, license and insurance reviews before taking rides.',
    );
}
function inAvailability(d: Driver, at: string) {
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
async function audit(
  c: Context,
  message: string,
  kind = 'info',
  rideId: string | null = null,
) {
  const statement = db()
    .prepare(
      'INSERT INTO events (workspace,id,ride_id,kind,message,created_at) VALUES (?,?,?,?,?,?)',
    )
    .bind(c.workspace, uid(), rideId, kind, message, now());
  (c.writes.length ? c.after : c.writes).push(statement);
  if (rideId && !c.demo)
    c.after.push(...notificationStatements(c.workspace, rideId, kind));
}
async function save(
  c: Context,
  kind: string,
  id: string,
  data: unknown,
  version: number | null,
  guard = '',
  guardValues: unknown[] = [],
) {
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
async function saveRide(c: Context, r: Ride, version: number | null) {
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
export async function state(c: Context): Promise<State> {
  const [drivers, families, rides, anchors, eventResult, ws, memberResult] =
    await Promise.all([
      list<Driver>(c, 'drivers'),
      list<Family>(c, 'families'),
      list<Ride>(c, 'rides'),
      list<Anchor>(c, 'anchors'),
      db()
        .prepare(
          "SELECT id,ride_id,kind,message,created_at,resolved,note FROM events WHERE workspace=? AND (id IN (SELECT id FROM events WHERE workspace=? ORDER BY created_at DESC LIMIT 100) OR (kind='sos' AND resolved=0)) ORDER BY created_at DESC",
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
  const familyIds = new Set(visibleRides.map((r) => r.familyId));
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
          dob: '',
          email: '',
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
    drivers: visibleDrivers,
    families: families
      .filter(
        (f) =>
          c.role === 'admin' ||
          (c.role === 'family' ? f.id === c.recordId : familyIds.has(f.id)),
      )
      .map((f) =>
        c.role === 'driver'
          ? { ...f, email: '', notes: '', emergency: '', phone: '' }
          : f,
      ),
    rides: visibleRides
      .map((r) => ({
        ...r,
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
          (e.ride_id && visibleRides.some((r) => r.id === e.ride_id)),
      )
      .map((e) => ({
        id: e.id,
        rideId: e.ride_id,
        kind: e.kind,
        message: e.message,
        createdAt: e.created_at,
        resolved: !!e.resolved,
        note: e.note,
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
export async function mutate(c: Context, body: Record<string, unknown>) {
  const op = txt(body.op, 1, 30);
  if (op === 'driver.save') {
    requireRole(c, 'admin', 'driver');
    const input = body.data as Record<string, unknown>;
    if (!input || typeof input !== 'object')
      throw new ApiError(400, 'Driver details are required.');
    const id = body.id ? txt(body.id) : uid();
    if (c.role === 'driver' && id !== c.recordId)
      throw new ApiError(403, 'You can update only your own profile.');
    const old = body.id ? await record<Driver>(c, 'drivers', id) : null;
    const dob = day(input.dob);
    const age = (Date.now() - Date.parse(dob)) / (365.25 * 86400000);
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
      licenseChecked: c.role === 'admin' ? bool(input.licenseChecked) : false,
      insuranceChecked:
        c.role === 'admin' ? bool(input.insuranceChecked) : false,
      guardianConsent: c.role === 'admin' ? bool(input.guardianConsent) : false,
      screeningChecked:
        c.role === 'admin' ? bool(input.screeningChecked) : false,
      notes: txt(input.notes ?? '', 0, 1000),
      availability: old?.data.availability ?? DEFAULT_SLOTS,
      createdAt: old?.data.createdAt ?? now(),
      hours: 0,
      rides: 0,
      rating: 0,
    };
    if (c.role === 'driver') d.status = 'review';
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
      d.status === 'approved'
        ? ''
        : "NOT EXISTS (SELECT 1 FROM records r WHERE r.workspace=? AND r.kind='rides' AND json_extract(r.data,'$.driverId')=? AND json_extract(r.data,'$.status') IN ('arrived','in_progress'))",
      d.status === 'approved' ? [] : [c.workspace, id],
    );
    await audit(
      c,
      `${c.name} ${old ? 'updated' : 'registered'} driver ${d.name}.`,
      'driver',
    );
    return {
      message: old
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
    const input = body.data as Record<string, unknown>;
    if (!input) throw new ApiError(400, 'Family details are required.');
    const id = body.id ? txt(body.id) : uid();
    if (c.role === 'family' && id !== c.recordId)
      throw new ApiError(403, 'You can update only your own family.');
    const old = body.id ? await record<Family>(c, 'families', id) : null;
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
    const input = body.data as Record<string, unknown>;
    if (!input) throw new ApiError(400, 'Location details are required.');
    const id = body.id ? txt(body.id) : uid();
    const old = body.id ? await record<Anchor>(c, 'anchors', id) : null;
    const a: Anchor = {
      id,
      name: txt(input.name, 2, 100),
      address: txt(input.address, 5, 250),
      lat: number(input.lat, -90, 90),
      lng: number(input.lng, -180, 180),
      category: txt(input.category, 2, 50),
      notes: txt(input.notes ?? '', 0, 500),
      active: true,
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
    return { message: 'Your weekly availability is saved.' };
  }
  if (op === 'ride.create') {
    requireRole(c, 'admin', 'family');
    const familyId = c.role === 'family' ? c.recordId! : txt(body.familyId);
    const { data: f } = await record<Family>(c, 'families', familyId);
    if (!f.consent)
      throw new ApiError(409, 'Guardian consent is required before booking.');
    const pickupId = txt(body.pickupId),
      dropoffId = txt(body.dropoffId);
    if (pickupId === dropoffId)
      throw new ApiError(400, 'Pickup and destination must be different.');
    const { data: pickupSnapshot } = await record<Anchor>(
      c,
      'anchors',
      pickupId,
    );
    const { data: dropoffSnapshot } = await record<Anchor>(
      c,
      'anchors',
      dropoffId,
    );
    if (!pickupSnapshot.active || !dropoffSnapshot.active)
      throw new ApiError(409, 'Choose active pickup locations.');
    const ts = Date.parse(txt(body.scheduledAt));
    if (
      !Number.isFinite(ts) ||
      ts < Date.now() + 29 * 60000 ||
      ts > Date.now() + 7 * 86400000
    )
      throw new ApiError(400, 'Choose a pickup 30 minutes to 7 days from now.');
    const r: Ride = {
      id: 'KY-' + uid().slice(0, 8).toUpperCase(),
      familyId,
      driverId: c.role === 'admin' && body.driverId ? txt(body.driverId) : null,
      pickupId,
      dropoffId,
      pickupSnapshot,
      dropoffSnapshot,
      scheduledAt: new Date(ts).toISOString(),
      status: 'pending',
      activity: txt(body.activity, 2, 100),
      notes: txt(body.notes ?? '', 0, 500),
      createdAt: now(),
      updatedAt: now(),
      startedAt: null,
      completedAt: null,
      otp: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      lat: null,
      lng: null,
      locationAt: null,
      accuracy: null,
      rating: null,
      feedback: '',
      cancelReason: '',
    };
    await saveRide(c, r, null);
    await audit(
      c,
      `${f.student}’s ride requested. ${r.driverId ? 'Assigned to a driver for confirmation.' : 'Coordinator matching is needed.'}`,
      'ride',
      r.id,
    );
    return {
      message: 'Ride requested. You can follow its status in My rides.',
      id: r.id,
    };
  }
  if (op === 'ride.action') {
    const id = txt(body.id);
    const { data: r, version } = await record<Ride>(c, 'rides', id);
    if (!canSeeRide(c, r))
      throw new ApiError(403, 'You cannot access this ride.');
    const action = txt(body.action);
    let message = '';
    if (action === 'assign') {
      requireRole(c, 'admin');
      if (!['pending', 'accepted'].includes(r.status))
        throw new ApiError(409, 'Only unstarted rides can be assigned.');
      r.driverId = txt(body.driverId);
      r.status = 'pending';
      clearLocation(c, r);
      message = 'Driver assigned. Their confirmation is needed.';
    } else if (action === 'decline') {
      requireRole(c, 'driver');
      if (!['pending', 'accepted'].includes(r.status))
        throw new ApiError(409, 'Only unstarted requests can be declined.');
      const reason = txt(body.reason, 4, 500);
      r.driverId = null;
      r.status = 'pending';
      clearLocation(c, r);
      message = `Driver declined: ${reason}. Coordinator reassignment is needed.`;
    } else if (action === 'accept') {
      requireRole(c, 'driver');
      if (r.status !== 'pending')
        throw new ApiError(409, 'This ride is not awaiting confirmation.');
      r.status = 'accepted';
      message = 'Ride confirmed by the driver.';
    } else if (action === 'arrive') {
      requireRole(c, 'driver');
      if (r.status !== 'accepted')
        throw new ApiError(409, 'Confirm the ride before marking arrival.');
      if (!c.demo && Date.parse(r.scheduledAt) - Date.now() > 30 * 60000)
        throw new ApiError(
          409,
          'Pickup check-in opens 30 minutes before the scheduled time.',
        );
      if (!c.demo) await requireProximity(c, r, 'pickup');
      r.status = 'arrived';
      const buffer = new Uint32Array(1);
      crypto.getRandomValues(buffer);
      r.otp = String(buffer[0] % 1000000).padStart(6, '0');
      r.otpExpiresAt = new Date(Date.now() + 15 * 60000).toISOString();
      r.otpAttempts = 0;
      message =
        'Driver is at pickup. A code is ready in the family’s ride view.';
    } else if (action === 'refresh-code') {
      requireRole(c, 'admin');
      if (r.status !== 'arrived')
        throw new ApiError(
          409,
          'A pickup code can only be refreshed while at pickup.',
        );
      const b = new Uint32Array(1);
      crypto.getRandomValues(b);
      r.otp = String(b[0] % 1000000).padStart(6, '0');
      r.otpExpiresAt = new Date(Date.now() + 15 * 60000).toISOString();
      r.otpAttempts = 0;
      message = 'Coordinator issued a new pickup code.';
    } else if (action === 'verify') {
      requireRole(c, 'driver');
      if (r.status !== 'arrived')
        throw new ApiError(409, 'The ride is not waiting for a pickup code.');
      if (r.otpAttempts >= 5)
        throw new ApiError(
          429,
          'Code entry is locked. Ask the coordinator to issue a new code.',
        );
      if (!r.otpExpiresAt || r.otpExpiresAt < now())
        throw new ApiError(
          410,
          'The pickup code expired. Ask the coordinator for a new code.',
        );
      const otp = txt(body.otp, 6, 6);
      r.otpAttempts++;
      if (otp !== r.otp) {
        await save(c, 'rides', id, r, version);
        throw new ApiError(
          400,
          `Incorrect code. ${5 - r.otpAttempts} attempts left.`,
        );
      }
      if (!c.demo) await requireProximity(c, r, 'pickup');
      r.status = 'in_progress';
      r.startedAt = now();
      r.otp = null;
      r.otpExpiresAt = null;
      message = 'Pickup verified. The ride has started.';
    } else if (action === 'complete') {
      requireRole(c, 'driver');
      if (r.status !== 'in_progress')
        throw new ApiError(
          409,
          'The ride must be in progress before completion.',
        );
      if (!c.demo) await requireProximity(c, r, 'dropoff');
      r.status = 'completed';
      r.completedAt = now();
      message = 'Drop-off confirmed. Ride completed.';
    } else if (action === 'cancel') {
      requireRole(c, 'admin', 'driver', 'family');
      if (['in_progress', 'completed', 'cancelled'].includes(r.status))
        throw new ApiError(409, 'This ride can no longer be cancelled.');
      r.cancelReason = txt(body.reason, 4, 500);
      r.status = 'cancelled';
      r.otp = null;
      r.otpExpiresAt = null;
      message = `Ride cancelled by ${c.name}: ${r.cancelReason}`;
    } else if (action === 'sos') {
      if (['completed', 'cancelled'].includes(r.status))
        throw new ApiError(409, 'This ride is closed.');
      await audit(
        c,
        `${c.name} requested help for ride ${r.id}: ${txt(body.reason, 4, 500)}`,
        'sos',
        r.id,
      );
      return {
        message:
          'Help request recorded for the coordinator. For an emergency, call 911 now.',
      };
    } else if (action === 'rating') {
      requireRole(c, 'family');
      if (r.status !== 'completed' || r.rating !== null)
        throw new ApiError(409, 'Only completed, unrated rides can be rated.');
      const rating = number(body.rating, 1, 5);
      if (!Number.isInteger(rating))
        throw new ApiError(400, 'Choose a whole number of stars.');
      r.rating = rating;
      r.feedback = txt(body.feedback ?? '', 0, 500);
      message = 'Ride feedback received. Thank you!';
    } else throw new ApiError(400, 'Unknown ride action.');
    r.updatedAt = now();
    await saveRide(c, r, version);
    await audit(c, message, 'ride', r.id);
    return { message };
  }
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
    const note = txt(body.note, 4, 500);
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
    );
    return { message: 'Help request resolved.' };
  }
  if (op === 'settings') {
    requireRole(c, 'admin');
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
  if (op === 'member.remove') {
    requireRole(c, 'admin');
    if (c.demo)
      throw new ApiError(
        400,
        'Manage account access in the real pilot workspace.',
      );
    const e = email(body.email);
    if (e === c.email)
      throw new ApiError(
        409,
        'You cannot remove your own coordinator account.',
      );
    const reason = txt(body.reason, 4, 500);
    if (e === env.KY_BOOTSTRAP_ADMIN_EMAIL?.toLowerCase())
      throw new ApiError(
        409,
        'The initial owner account cannot be revoked here.',
      );
    c.writes.push(db().prepare('DELETE FROM members WHERE email=?').bind(e));
    await audit(
      c,
      `${c.name} revoked pilot access for ${e}: ${reason}`,
      'access',
    );
    return {
      message:
        'Pilot access revoked. Registered driver and family records are retained.',
    };
  }
  if (op === 'member.add') {
    requireRole(c, 'admin');
    if (c.demo)
      throw new ApiError(
        400,
        'Account access is managed in the real pilot workspace.',
      );
    const e = email(body.email);
    const role = txt(body.role);
    if (!['admin', 'driver', 'family'].includes(role))
      throw new ApiError(400, 'Choose a valid role.');
    let recordId: string | null = null;
    if (role !== 'admin') {
      recordId = txt(body.recordId);
      await record(c, role === 'driver' ? 'drivers' : 'families', recordId);
    }
    const exists = await db()
      .prepare('SELECT email FROM members WHERE email=?')
      .bind(e)
      .first();
    if (exists) throw new ApiError(409, 'This email already has pilot access.');
    c.writes.push(
      db()
        .prepare(
          'INSERT OR IGNORE INTO members (email,role,record_id,name) VALUES (?,?,?,?)',
        )
        .bind(e, role, recordId, txt(body.name, 2, 100)),
    );
    await audit(c, `${c.name} granted ${role} access to ${e}.`, 'access');
    return {
      message:
        'Account added to the access register. Share the site link with this person.',
    };
  }
  throw new ApiError(400, 'Unknown operation.');
}
export function distance(a: number, b: number, c: number, d: number) {
  const rad = (n: number) => (n * Math.PI) / 180;
  const x =
    Math.sin(rad(c - a) / 2) ** 2 +
    Math.cos(rad(a)) * Math.cos(rad(c)) * Math.sin(rad(d - b) / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

type LocationRow = {
  ride_id: string;
  lat: number;
  lng: number;
  accuracy: number;
  captured_at: string;
  received_at: string;
  source: 'device' | 'simulation';
};
function mergeLocation(c: Context, r: Ride, l?: LocationRow | null): Ride {
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
async function withLocation(c: Context, r: Ride) {
  const l = await db()
    .prepare('SELECT * FROM ride_locations WHERE workspace=? AND ride_id=?')
    .bind(c.workspace, r.id)
    .first<LocationRow>();
  return mergeLocation(c, r, l);
}
function clearLocation(c: Context, r: Ride) {
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
async function requireProximity(
  c: Context,
  r: Ride,
  leg: 'pickup' | 'dropoff',
) {
  if (
    r.lat === null ||
    r.lng === null ||
    !r.locationAt ||
    Date.parse(r.locationAt) < Date.now() - 60000 ||
    (r.accuracy ?? 9999) > 100 ||
    r.locationSource !== 'device'
  )
    throw new ApiError(
      409,
      'A fresh device GPS fix within 100 m accuracy is required for pickup and drop-off.',
    );
  const snapshot = leg === 'pickup' ? r.pickupSnapshot : r.dropoffSnapshot;
  const a =
    snapshot ??
    (
      await record<Anchor>(
        c,
        'anchors',
        leg === 'pickup' ? r.pickupId : r.dropoffId,
      )
    ).data;
  if (distance(r.lat, r.lng, a.lat, a.lng) > 200)
    throw new ApiError(
      409,
      `Confirm ${leg} within 200 m of its meeting point.`,
    );
}
