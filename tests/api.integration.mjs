import assert from 'node:assert/strict';
const base = process.env.KY_TEST_URL ?? 'http://127.0.0.1:3001';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(base).hostname))
  throw new Error(
    'Integration tests are restricted to an isolated localhost Worker.',
  );
const run = Date.now().toString(36);
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
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(user
        ? {
            'oai-authenticated-user-id': user.id,
            'oai-authenticated-user-email': user.email,
          }
        : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
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
await read(admin);
expect(await req(stranger), 403, 'unregistered live account denied');
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
await post(
  driverUser,
  { op: 'ride.action', id, action: 'complete' },
  409,
  'drop-off cannot skip pickup verification',
);
await post(driverUser, { op: 'ride.action', id, action: 'arrive' });
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
for (let i = 0; i < 5; i++)
  await post(
    driverUser,
    {
      op: 'ride.action',
      id,
      action: 'verify',
      otp: code === '000000' ? '111111' : '000000',
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
  'drop-off without GPS denied',
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
expect(
  await req(stranger, `/api/route?mode=practice&pickup=marcus&dropoff=cac`),
  200,
  'prebooking road preview',
);
expect(
  await req(
    stranger,
    `/api/route?mode=practice&id=${practiceRide.id}&leg=current`,
    undefined,
    { 'x-ky-role': 'family' },
  ),
  200,
  'fresh driver location produces road ETA',
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
