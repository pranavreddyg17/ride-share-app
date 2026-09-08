import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const base = process.env.KY_TEST_URL ?? 'http://127.0.0.1:3001';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
  throw new Error(
    'Integration tests are restricted to an isolated localhost Worker.',
  );
const run = Date.now().toString(36);
const persist = '../api-hardening-state';
function sql(command) {
  const output = execFileSync(
    process.execPath,
    [
      resolve('node_modules/wrangler/bin/wrangler.js'),
      'd1',
      'execute',
      'DB',
      '--local',
      '--config',
      'wrangler.local.json',
      '--persist-to',
      persist,
      '--command',
      command,
      '--json',
    ],
    { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 },
  );
  return JSON.parse(output).flatMap((r) => r.results ?? []);
}
let checks = 0;
const admin = { id: 'ky-integration-admin', email: 'admin@ky-test.example' };
const driverUser = {
  id: 'driver-' + run,
  email: `driver-${run}@ky-test.example`,
};
const familyUser = {
  id: 'family-' + run,
  email: `family-${run}@ky-test.example`,
};
const stranger = {
  id: 'stranger-' + run,
  email: `stranger-${run}@ky-test.example`,
};
async function req(user, path = '/api/state?mode=pilot', body, extra = {}) {
  const requestBody =
    body?.op === 'location' && !body.capturedAt
      ? { ...body, capturedAt: new Date().toISOString() }
      : body;
  const res = await fetch(base + path, {
    method: requestBody ? 'POST' : 'GET',
    headers: {
      ...(user
        ? {
            'oai-authenticated-user-id': user.id,
            'oai-authenticated-user-email': user.email,
          }
        : {}),
      ...(requestBody
        ? {
            'Content-Type': 'application/json',
            'Idempotency-Key': crypto.randomUUID(),
          }
        : {}),
      ...extra,
    },
    body: requestBody ? JSON.stringify(requestBody) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data: json };
}
function expect(result, status, label) {
  assert.equal(
    result.status,
    status,
    `${label}: ${JSON.stringify(result.data)}`,
  );
  checks++;
  console.log(`PASS ${label}`);
  return result.data;
}
const read = async (user) =>
  expect(await req(user), 200, 'authenticated state');
const post = async (user, body, status = 200, label = body.op) =>
  expect(await req(user, undefined, body), status, label);
expect(await req(null), 401, 'anonymous request denied');
expect(
  await req(stranger),
  403,
  'first unregistered visitor cannot initialize admin access',
);
await read(admin);
expect(await req(stranger), 403, 'unregistered live account denied');
expect(
  await req(admin, undefined, { op: 'settings' }, { 'Idempotency-Key': '' }),
  400,
  'mutations require an idempotency key',
);
expect(
  await req(
    admin,
    undefined,
    {
      op: 'settings',
      coordinator: 'Bad origin',
      contactPhone: '',
      pilotName: 'Wrong',
    },
    { Origin: 'https://untrusted.example' },
  ),
  403,
  'cross-origin mutation denied',
);
const fullWeek = Array.from({ length: 7 }, (_, day) => ({
  day,
  enabled: true,
  start: '00:00',
  end: '23:59',
}));
const profile = {
  name: 'Test Driver ' + run,
  email: driverUser.email,
  phone: '+12145550111',
  school: 'Test School',
  dob: '2007-01-01',
  vehicle: 'White Test Car',
  plate: 'TEST ' + run.slice(-4),
  licenseExpiry: '2030-01-01',
  insuranceExpiry: '2030-01-01',
  licenseChecked: false,
  insuranceChecked: false,
  guardianConsent: false,
  screeningChecked: false,
  notes: 'Isolated integration test',
};
await post(
  admin,
  { op: 'driver.save', data: { ...profile, dob: '2015-01-01' } },
  400,
  'underage driver rejected',
);
await post(admin, {
  op: 'driver.save',
  data: { ...profile, status: 'approved' },
});
let s = await read(admin);
const driver = s.drivers.find((d) => d.email === driverUser.email);
assert.equal(driver.status, 'review');
checks++;
console.log('PASS client cannot self-set approved status');
await post(
  admin,
  {
    op: 'driver.status',
    id: driver.id,
    status: 'approved',
    reason: 'Test review',
  },
  409,
  'incomplete screening blocks approval',
);
await post(admin, {
  op: 'driver.save',
  id: driver.id,
  data: {
    ...profile,
    licenseChecked: true,
    insuranceChecked: true,
    guardianConsent: true,
    screeningChecked: true,
  },
});
await post(admin, {
  op: 'driver.status',
  id: driver.id,
  status: 'approved',
  reason: 'Review completed in isolated test',
});
const familyData = {
  guardian: 'Test Guardian ' + run,
  student: 'Test Student ' + run,
  email: familyUser.email,
  phone: '+12145550112',
  school: 'Test School',
  consent: false,
  emergency: '+12145550113',
  notes: 'Isolated test',
};
await post(admin, { op: 'family.save', data: familyData });
s = await read(admin);
const family = s.families.find((f) => f.email === familyUser.email);
await post(admin, {
  op: 'member.add',
  email: driverUser.email,
  name: profile.name,
  role: 'driver',
  recordId: driver.id,
});
await post(admin, {
  op: 'member.add',
  email: familyUser.email,
  name: familyData.guardian,
  role: 'family',
  recordId: family.id,
});
let ds = await read(driverUser);
assert.equal(ds.role, 'driver');
assert.deepEqual(
  ds.drivers.map((d) => d.id),
  [driver.id],
);
checks++;
console.log('PASS driver identity is linked to exactly its profile');
await post(driverUser, { op: 'availability', slots: fullWeek });
expect(
  await req(
    driverUser,
    undefined,
    {
      op: 'settings',
      coordinator: 'Attacker',
      contactPhone: '',
      pilotName: 'Bad',
    },
    { 'x-ky-role': 'admin' },
  ),
  403,
  'practice-role header cannot escalate live privileges',
);
await post(
  familyUser,
  {
    op: 'member.add',
    email: 'bad@ky-test.example',
    name: 'Attacker',
    role: 'admin',
  },
  403,
  'family cannot grant admin access',
);
let fs = await read(familyUser);
expect(
  await req(familyUser, '/api/export?mode=pilot'),
  403,
  'family cannot export the pilot',
);
expect(
  await req(driverUser, '/api/operations?mode=pilot'),
  403,
  'driver cannot view admin operations',
);
expect(
  await req(admin, '/api/map-config?mode=pilot'),
  503,
  'unconfigured production map tiles fail explicitly',
);
assert.deepEqual(
  fs.families.map((f) => f.id),
  [family.id],
);
checks++;
console.log('PASS family data scoped to membership');
const anchor1 = {
  name: 'Pickup ' + run,
  address: 'Test pickup, Flower Mound, TX',
  lat: 33.0609,
  lng: -97.0583,
  category: 'School',
  notes: 'Test only',
};
const anchor2 = {
  name: 'Destination ' + run,
  address: 'Test destination, Flower Mound, TX',
  lat: 33.0078,
  lng: -97.0513,
  category: 'Recreation',
  notes: 'Test only',
};
await post(admin, { op: 'anchor.save', data: anchor1 });
await post(admin, { op: 'anchor.save', data: anchor2 });
s = await read(admin);
const a = s.anchors.find((a) => a.name === anchor1.name),
  b = s.anchors.find((a) => a.name === anchor2.name);
const scheduled = () => new Date(Date.now() + 30 * 60000).toISOString();
const booking = {
  op: 'ride.create',
  familyId: family.id,
  pickupId: a.id,
  dropoffId: b.id,
  scheduledAt: scheduled(),
  activity: 'Integration practice',
};
await post(familyUser, booking, 409, 'guardian consent required');
await post(admin, {
  op: 'family.save',
  id: family.id,
  data: { ...familyData, consent: true },
});
await post(
  familyUser,
  { ...booking, scheduledAt: new Date(Date.now() - 60000).toISOString() },
  400,
  'past booking denied',
);
await post(
  familyUser,
  { ...booking, dropoffId: a.id },
  400,
  'identical endpoints denied',
);
const r = await post(familyUser, { ...booking, scheduledAt: scheduled() });
const id = r.id;
const originalPickup = (await read(familyUser)).rides.find(
  (r) => r.id === id,
).pickupSnapshot;
await post(admin, {
  op: 'anchor.save',
  id: a.id,
  data: { ...anchor1, name: 'Updated pickup ' + run, lat: a.lat + 0.01 },
});
assert.deepEqual(
  (await read(familyUser)).rides.find((r) => r.id === id).pickupSnapshot,
  originalPickup,
);
checks++;
console.log(
  'PASS existing ride retains its agreed meeting point after anchor edits',
);
await post(admin, { op: 'anchor.save', id: a.id, data: anchor1 });
expect(
  await req(familyUser, `/api/route?mode=pilot&id=${id}`),
  503,
  'production route never falls back to an unconfigured public provider',
);
await post(
  familyUser,
  { ...booking, scheduledAt: scheduled() },
  409,
  'overlapping student request denied',
);
await post(
  driverUser,
  { op: 'ride.action', id, action: 'accept' },
  403,
  'unassigned driver cannot access ride',
);
await post(
  familyUser,
  { op: 'ride.action', id, action: 'assign', driverId: driver.id },
  403,
  'family cannot assign arbitrary driver',
);
await post(admin, {
  op: 'ride.action',
  id,
  action: 'assign',
  driverId: driver.id,
});
await post(
  driverUser,
  { op: 'ride.action', id, action: 'verify', otp: '123456' },
  409,
  'pickup cannot skip arrival',
);
await post(driverUser, { op: 'ride.action', id, action: 'accept' });
await post(admin, {
  op: 'driver.status',
  id: driver.id,
  status: 'suspended',
  reason: 'Test temporary suspension',
});
await post(
  driverUser,
  { op: 'location', id, lat: a.lat, lng: a.lng, accuracy: 8 },
  409,
  'suspended driver cannot publish GPS',
);
await post(admin, {
  op: 'driver.status',
  id: driver.id,
  status: 'approved',
  reason: 'Test approval restored',
});
await post(driverUser, {
  op: 'ride.action',
  id,
  action: 'decline',
  reason: 'Test request return',
});
const declined = (await read(familyUser)).rides.find((r) => r.id === id);
assert.equal(declined.status, 'pending');
assert.equal(declined.driverId, null);
checks++;
console.log('PASS driver decline returns the request to coordinator matching');
await post(
  driverUser,
  { op: 'location', id, lat: a.lat, lng: a.lng, accuracy: 8 },
  403,
  'unassigned driver loses GPS access immediately',
);
await post(admin, {
  op: 'ride.action',
  id,
  action: 'assign',
  driverId: driver.id,
});
await post(driverUser, { op: 'ride.action', id, action: 'accept' });
await post(
  driverUser,
  { op: 'ride.action', id, action: 'complete' },
  409,
  'drop-off cannot skip pickup verification',
);
await post(driverUser, {
  op: 'location',
  id,
  lat: a.lat,
  lng: a.lng,
  accuracy: 8,
  source: 'device',
});
const concurrentGps = await Promise.all([
  req(driverUser, undefined, { op: 'ride.action', id, action: 'arrive' }),
  req(driverUser, undefined, {
    op: 'location',
    id,
    lat: a.lat,
    lng: a.lng,
    accuracy: 9,
  }),
]);
for (const result of concurrentGps)
  expect(result, 200, 'GPS update and arrival can commit concurrently');
fs = await read(familyUser);
const code = fs.rides.find((r) => r.id === id).otp;
assert.match(code, /^\d{6}$/);
checks++;
console.log('PASS pickup code delivered to linked family');
ds = await read(driverUser);
s = await read(admin);
assert.equal(ds.rides.find((r) => r.id === id).otp, null);
assert.equal(s.rides.find((r) => r.id === id).otp, null);
checks++;
console.log('PASS pickup code hidden from driver and coordinator');
const exported = expect(
  await req(admin, '/api/export?mode=pilot'),
  200,
  'admin can create redacted operational export',
);
assert.equal(
  exported.records.find((record) => record.kind === 'rides' && record.id === id)
    .data.otp,
  null,
);
checks++;
console.log('PASS operational export never includes a pickup code');
const wrongBody = {
  op: 'ride.action',
  id,
  action: 'verify',
  otp: code === '000000' ? '111111' : '000000',
};
const wrongKey = crypto.randomUUID();
expect(
  await req(driverUser, undefined, wrongBody, { 'Idempotency-Key': wrongKey }),
  400,
  'wrong pickup attempt rejected',
);
expect(
  await req(driverUser, undefined, wrongBody, { 'Idempotency-Key': wrongKey }),
  400,
  'retried wrong pickup attempt returns the original rejection',
);
assert.equal(
  sql(
    `SELECT json_extract(data,'$.otpAttempts') AS attempts FROM records WHERE workspace='pilot' AND kind='rides' AND id='${id}'`,
  )[0].attempts,
  1,
);
checks++;
console.log('PASS retry does not consume a second pickup-code attempt');
await post(admin, { op: 'ride.action', id, action: 'refresh-code' });
// Expiry is changed only in the isolated test database, avoiding a fifteen-minute wait.
sql(
  `UPDATE records SET data=json_set(data,'$.otpExpiresAt','2000-01-01T00:00:00.000Z'),version=version+1 WHERE workspace='pilot' AND kind='rides' AND id='${id}'`,
);
await post(
  driverUser,
  { op: 'ride.action', id, action: 'verify', otp: code },
  410,
  'expired pickup code is rejected',
);
await post(admin, { op: 'ride.action', id, action: 'refresh-code' });
const lockoutCode = (await read(familyUser)).rides.find((r) => r.id === id).otp;
for (let i = 0; i < 5; i++)
  await post(
    driverUser,
    {
      op: 'ride.action',
      id,
      action: 'verify',
      otp: lockoutCode === '000000' ? '111111' : '000000',
    },
    400,
    `incorrect pickup code attempt ${i + 1}`,
  );
await post(
  driverUser,
  { op: 'ride.action', id, action: 'verify', otp: code },
  429,
  'pickup code locked after five wrong attempts',
);
await post(admin, { op: 'ride.action', id, action: 'refresh-code' });
fs = await read(familyUser);
const refreshed = fs.rides.find((r) => r.id === id).otp;
await post(driverUser, {
  op: 'ride.action',
  id,
  action: 'verify',
  otp: refreshed,
});
await post(
  driverUser,
  { op: 'ride.action', id, action: 'verify', otp: refreshed },
  409,
  'pickup code cannot be replayed',
);
await post(
  driverUser,
  { op: 'ride.action', id, action: 'complete' },
  409,
  'pickup GPS cannot confirm destination drop-off',
);
await post(
  familyUser,
  { op: 'location', id, lat: a.lat, lng: a.lng, accuracy: 8 },
  403,
  'family cannot publish driver GPS',
);
await post(
  driverUser,
  { op: 'location', id, lat: 1000, lng: 0, accuracy: 8 },
  400,
  'invalid coordinates denied',
);
await post(
  driverUser,
  {
    op: 'location',
    id,
    lat: a.lat,
    lng: a.lng,
    accuracy: 8,
    source: 'simulation',
  },
  403,
  'simulated GPS rejected in real pilot',
);
await post(driverUser, {
  op: 'location',
  id,
  lat: a.lat,
  lng: a.lng,
  accuracy: 8,
});
fs = await read(familyUser);
s = await read(admin);
ds = await read(driverUser);
for (const result of [fs, s, ds]) {
  const rr = result.rides.find((r) => r.id === id);
  assert.equal(rr.lat, a.lat);
  assert.equal(rr.lng, a.lng);
  assert.ok(rr.locationAt);
}
checks++;
console.log(
  'PASS driver GPS persisted and received identically by separate family and admin identities',
);
await post(
  driverUser,
  {
    op: 'location',
    id,
    lat: b.lat,
    lng: b.lng,
    accuracy: 8,
    capturedAt: new Date(
      Date.parse(fs.rides.find((r) => r.id === id).locationAt) - 1,
    ).toISOString(),
  },
  409,
  'out-of-order GPS cannot move the driver backwards',
);
await post(
  driverUser,
  {
    op: 'location',
    id,
    lat: a.lat,
    lng: a.lng,
    accuracy: 8,
    source: 'device',
    capturedAt: new Date(Date.now() - 31000).toISOString(),
  },
  400,
  'stale device GPS is rejected',
);
await post(
  driverUser,
  { op: 'ride.action', id, action: 'complete' },
  409,
  'drop-off far from destination denied',
);
await post(driverUser, {
  op: 'location',
  id,
  lat: b.lat,
  lng: b.lng,
  accuracy: 500,
});
await post(
  driverUser,
  { op: 'ride.action', id, action: 'complete' },
  409,
  'inaccurate GPS cannot confirm drop-off',
);
await post(driverUser, {
  op: 'location',
  id,
  lat: b.lat,
  lng: b.lng,
  accuracy: 8,
});
await post(familyUser, {
  op: 'ride.action',
  id,
  action: 'sos',
  reason: 'Test coordination request',
});
s = await read(admin);
const event = s.events.find((e) => e.rideId === id && e.kind === 'sos');
assert.ok(event);
checks++;
console.log('PASS help request delivered to coordinator');
sql(`INSERT INTO events(workspace,id,ride_id,kind,message,created_at) VALUES('pilot','old-help-${run}','${id}','sos','Unresolved older test help','2000-01-01T00:00:00.000Z');
WITH RECURSIVE n(x) AS (VALUES(1) UNION ALL SELECT x+1 FROM n WHERE x<105)
INSERT INTO events(workspace,id,kind,message,created_at) SELECT 'pilot','filler-${run}-'||x,'info','Test activity','2020-01-01T00:00:00.000Z' FROM n;`);
assert.ok((await read(admin)).events.some((e) => e.id === `old-help-${run}`));
checks++;
console.log(
  'PASS unresolved help stays visible after falling outside recent activity',
);
await post(admin, {
  op: 'event.resolve',
  id: `old-help-${run}`,
  note: 'Old test alert resolved',
});
await post(
  familyUser,
  { op: 'event.resolve', id: event.id, note: 'Unauthorized' },
  403,
  'family cannot resolve coordinator alert',
);
await post(admin, {
  op: 'event.resolve',
  id: event.id,
  note: 'Test request resolved',
});
await post(driverUser, { op: 'ride.action', id, action: 'complete' });
await post(
  driverUser,
  { op: 'location', id, lat: b.lat, lng: b.lng, accuracy: 8 },
  403,
  'completed ride rejects further tracking',
);
await post(familyUser, {
  op: 'ride.action',
  id,
  action: 'rating',
  rating: 5,
  feedback: 'Verified test ride',
});
await post(
  familyUser,
  { op: 'ride.action', id, action: 'rating', rating: 4 },
  409,
  'duplicate rating denied',
);
const otherGuardian = {
  id: 'other-' + run,
  email: `other-${run}@ky-test.example`,
};
await post(admin, {
  op: 'family.save',
  data: {
    ...familyData,
    guardian: 'Other Guardian ' + run,
    student: 'Other Student ' + run,
    email: otherGuardian.email,
    consent: true,
  },
});
s = await read(admin);
const otherFamily = s.families.find((f) => f.email === otherGuardian.email);
await post(admin, {
  op: 'member.add',
  email: otherGuardian.email,
  name: 'Other Guardian',
  role: 'family',
  recordId: otherFamily.id,
});
const otherView = await read(otherGuardian);
assert.ok(!otherView.rides.some((r) => r.id === id));
checks++;
console.log('PASS registered unrelated family cannot see another student ride');
expect(
  await req(otherGuardian, `/api/route?mode=pilot&id=${id}`),
  403,
  'registered unrelated family cannot read trip route',
);
const concurrentBooking = { ...booking, scheduledAt: scheduled() };
const sameStudent = await Promise.all([
  req(familyUser, undefined, concurrentBooking),
  req(familyUser, undefined, concurrentBooking),
]);
assert.deepEqual(
  sameStudent.map((x) => x.status).sort((a, b) => a - b),
  [200, 409],
);
checks++;
console.log(
  'PASS simultaneous duplicate student requests allow exactly one ride',
);
const firstFuture = sameStudent.find((x) => x.status === 200).data.id;
const secondFuture = (
  await post(otherGuardian, { ...concurrentBooking, familyId: otherFamily.id })
).id;
const assignments = await Promise.all([
  req(admin, undefined, {
    op: 'ride.action',
    id: firstFuture,
    action: 'assign',
    driverId: driver.id,
  }),
  req(admin, undefined, {
    op: 'ride.action',
    id: secondFuture,
    action: 'assign',
    driverId: driver.id,
  }),
]);
assert.deepEqual(
  assignments.map((x) => x.status).sort((a, b) => a - b),
  [200, 409],
);
checks++;
console.log(
  'PASS simultaneous driver assignments allow exactly one overlapping booking',
);
const replayBooking = {
  ...booking,
  scheduledAt: new Date(Date.now() + 5 * 3600000).toISOString(),
};
const replayKey = crypto.randomUUID();
const replayed = await Promise.all([
  req(familyUser, undefined, replayBooking, { 'Idempotency-Key': replayKey }),
  req(familyUser, undefined, replayBooking, { 'Idempotency-Key': replayKey }),
]);
assert.equal(replayed[0].status, 200);
assert.equal(replayed[1].status, 200);
assert.equal(replayed[0].data.id, replayed[1].data.id);
checks++;
console.log(
  'PASS retried booking returns the original result without a duplicate ride',
);
expect(
  await req(
    familyUser,
    undefined,
    { ...replayBooking, activity: 'different' },
    { 'Idempotency-Key': replayKey },
  ),
  409,
  'one request key cannot be reused for a different booking',
);
const counts = () =>
  sql(
    "SELECT (SELECT COUNT(*) FROM records WHERE kind='rides') AS rides,(SELECT COUNT(*) FROM events) AS events,(SELECT COUNT(*) FROM notification_outbox) AS alerts,(SELECT COUNT(*) FROM mutation_receipts) AS receipts",
  )[0];
const beforeFault = counts();
sql(
  "CREATE TRIGGER ky_test_outbox_failure BEFORE INSERT ON notification_outbox WHEN NEW.workspace='pilot' BEGIN SELECT RAISE(ABORT,'injected outbox failure'); END",
);
const faultBody = {
  ...booking,
  activity: 'Fault injection',
  scheduledAt: new Date(Date.now() + 6 * 3600000).toISOString(),
};
const faultKey = crypto.randomUUID();
try {
  expect(
    await req(familyUser, undefined, faultBody, {
      'Idempotency-Key': faultKey,
    }),
    500,
    'database fault rejects the whole transaction',
  );
  assert.deepEqual(counts(), beforeFault);
  checks++;
  console.log(
    'PASS injected notification failure rolls back ride, audit, alert and receipt together',
  );
} finally {
  sql('DROP TRIGGER IF EXISTS ky_test_outbox_failure');
}
const recovered = expect(
  await req(familyUser, undefined, faultBody, { 'Idempotency-Key': faultKey }),
  200,
  'same request recovers after a rolled-back failure',
);
await post(admin, {
  op: 'ride.action',
  id: recovered.id,
  action: 'cancel',
  reason: 'Test cleanup',
});
await post(admin, {
  op: 'ride.action',
  id: replayed[0].data.id,
  action: 'cancel',
  reason: 'Test cleanup',
});
await post(admin, {
  op: 'ride.action',
  id: firstFuture,
  action: 'cancel',
  reason: 'Test cleanup',
});
await post(admin, {
  op: 'ride.action',
  id: secondFuture,
  action: 'cancel',
  reason: 'Test cleanup',
});
const strangerPractice = expect(
  await req(stranger, '/api/state?mode=practice'),
  200,
  'new practice namespace',
);
assert.ok(!strangerPractice.rides.some((r) => r.id === id));
checks++;
console.log('PASS practice namespace excludes real ride data');
expect(
  await req(stranger, `/api/route?mode=pilot&id=${id}`),
  403,
  'unregistered account cannot read route',
);
const operations = expect(
  await req(admin, '/api/operations?mode=pilot'),
  200,
  'admin can read operational readiness',
);
assert.equal(
  operations.checks.find((check) => check.name === 'SMS provider').ok,
  false,
);
checks++;
console.log(
  'PASS readiness reports an unconfigured SMS provider as unavailable',
);
expect(
  await req(stranger, '/api/jobs/notifications', {}, {}),
  401,
  'notification processor is protected',
);
const driverPractice = expect(
  await req(stranger, '/api/state?mode=practice', undefined, {
    'x-ky-role': 'driver',
  }),
  200,
  'practice driver view',
);
const practiceRide = driverPractice.rides.find(
  (r) => r.status === 'in_progress',
);
assert.ok(practiceRide);
expect(
  await req(
    stranger,
    '/api/state?mode=practice',
    {
      op: 'location',
      id: practiceRide.id,
      lat: 33.04,
      lng: -97.062,
      accuracy: 8,
      source: 'simulation',
    },
    { 'x-ky-role': 'driver' },
  ),
  200,
  'practice driver publishes explicit simulation',
);
const practiceFamily = expect(
  await req(stranger, '/api/state?mode=practice', undefined, {
    'x-ky-role': 'family',
  }),
  200,
  'practice family tracker',
);
const simulated = practiceFamily.rides.find((r) => r.id === practiceRide.id);
assert.equal(simulated.lat, 33.04);
assert.equal(simulated.locationSource, 'simulation');
checks++;
console.log('PASS simulation reaches family and remains explicitly labeled');
// External availability is a separate optional smoke check; provider contracts are deterministically unit-tested.
if (process.env.KY_TEST_EXTERNAL_ROUTES === '1') {
  expect(
    await req(stranger, '/api/route?mode=practice&pickup=marcus&dropoff=cac'),
    200,
    'external prebooking road preview',
  );
  expect(
    await req(
      stranger,
      `/api/route?mode=practice&id=${practiceRide.id}&leg=current`,
      undefined,
      { 'x-ky-role': 'family' },
    ),
    200,
    'external road ETA',
  );
} else
  console.log(
    'NOT RUN external routing availability (set KY_TEST_EXTERNAL_ROUTES=1)',
  );
await post(
  admin,
  { op: 'member.remove', email: admin.email, reason: 'Self revoke' },
  409,
  'coordinator cannot revoke own access',
);
await post(admin, {
  op: 'member.remove',
  email: driverUser.email,
  reason: 'Test account cleanup',
});
expect(await req(driverUser), 403, 'revocation takes effect on next request');
for (const page of [
  '/login',
  '/?mode=pilot',
  '/rides?mode=pilot',
  `/rides/${id}?mode=pilot`,
]) {
  const res = await fetch(base + page, {
    headers: {
      'oai-authenticated-user-id': admin.id,
      'oai-authenticated-user-email': admin.email,
    },
  });
  assert.equal(res.status, 200, `render ${page}`);
  checks++;
  console.log('PASS server renders ' + page);
}
console.log(
  `\n${checks} integration assertions passed. Isolated test ride: ${id}`,
);
