import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { iamChecks } from './iam-checks.mjs';

// Only called by the loopback-only harness using the isolated test database.
export async function endpointChecks({
  base,
  run,
  req,
  sql,
  admin,
  driverUser,
  familyUser,
  id,
  driver,
  family,
  a,
  b,
}) {
  let checks = 0;
  const auditAdmin = {
    id: 'audit-' + run,
    email: 'audit-' + run + '@ky-test.example',
  };
  function check(label, fn) {
    fn();
    checks++;
    console.log('PASS ' + label);
  }
  function status(result, expected, label) {
    check(label, () =>
      assert.equal(result.status, expected, JSON.stringify(result.data)),
    );
    return result.data;
  }
  const post = async (user, body, expected = 200, label = body.op) =>
    status(await req(user, undefined, body), expected, label);
  const get = async (
    user,
    path = '/api/state?mode=pilot',
    expected = 200,
    label = path,
  ) => status(await req(user, path), expected, label);
  const snapshot = async (user = auditAdmin) =>
    get(user, undefined, 200, 'audit state read');
  await post(admin, {
    op: 'member.add',
    email: auditAdmin.email,
    name: 'Endpoint audit coordinator',
    role: 'admin',
  });
  const original = await snapshot();
  const ride = original.rides.find((r) => r.id === id),
    profile = original.drivers.find((d) => d.id === driver.id),
    household = original.families.find((f) => f.id === family.id);
  const endpoints = [
    'state',
    'credits',
    'reports',
    'export',
    'operations',
    'map-config',
    'route',
    'audit',
  ];
  for (const path of endpoints) {
    const head = await fetch(base + '/api/' + path + '?mode=pilot', {
      method: 'HEAD',
      headers: { Connection: 'close' },
    });
    check('HEAD enforces authentication at ' + path, () =>
      assert.equal(head.status, 401),
    );
    await get(
      null,
      '/api/' + path + '?mode=pilot',
      401,
      'anonymous denied at ' + path,
    );
    await get(
      {
        id: 'unregistered-' + run,
        email: 'unregistered-' + run + '@ky-test.example',
      },
      '/api/' + path + '?mode=pilot',
      403,
      'unregistered account denied at ' + path,
    );
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].filter(
      (m) => path !== 'state' || m !== 'POST',
    )) {
      const res = await fetch(base + '/api/' + path + '?mode=pilot', {
        method,
        headers: {
          'x-ky-authenticated-user-id': auditAdmin.id,
          'x-ky-authenticated-user-email': auditAdmin.email,
          Connection: 'close',
        },
      });
      check(method + ' rejected at ' + path, () =>
        assert.equal(res.status, 405),
      );
    }
  }
  for (const method of ['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    const jobMethod = await fetch(base + '/api/jobs/notifications', {
      method,
      headers: { Connection: 'close' },
    });
    check('notification job rejects ' + method, () =>
      assert.equal(jobMethod.status, 405),
    );
  }
  await post(null, { op: 'settings' }, 401, 'anonymous write rejected');
  await post(
    {
      id: 'unregistered-write-' + run,
      email: 'unregistered-write-' + run + '@ky-test.example',
    },
    { op: 'settings' },
    403,
    'unregistered write rejected',
  );
  for (const path of ['export', 'reports', 'operations', 'credits']) {
    await get(
      familyUser,
      '/api/' + path + '?mode=pilot',
      403,
      'family denied at ' + path,
    );
  }
  await get(
    driverUser,
    '/api/export?mode=pilot',
    403,
    'driver cannot download entire pilot backup',
  );
  await get(
    auditAdmin,
    '/api/state?mode=typo',
    400,
    'unknown mode cannot accidentally use pilot data',
  );
  for (const [raw, type, expected] of [
    ['{', 'application/json', 400],
    ['[]', 'application/json', 400],
    ['null', 'application/json', 400],
    ['{}', 'text/plain', 415],
    ['x'.repeat(20001), 'application/json', 413],
  ]) {
    const result = await fetch(base + '/api/state?mode=pilot', {
      method: 'POST',
      headers: {
        'x-ky-authenticated-user-id': auditAdmin.id,
        'x-ky-authenticated-user-email': auditAdmin.email,
        'Content-Type': type,
        'Idempotency-Key': crypto.randomUUID(),
        Connection: 'close',
      },
      body: raw,
    });
    check('malformed request rejected ' + type + ' ' + raw.length, () =>
      assert.equal(result.status, expected),
    );
    check('error response is not cacheable', () =>
      assert.match(result.headers.get('cache-control'), /no-store/),
    );
  }
  await post(
    auditAdmin,
    { op: 'not-an-operation' },
    400,
    'unknown mutation rejected',
  );
  for (const op of ['driver.save', 'family.save', 'anchor.save'])
    await post(
      auditAdmin,
      { op, data: [] },
      400,
      'array details rejected for ' + op,
    );
  for (const [user, op] of [
    [driverUser, 'family.save'],
    [familyUser, 'driver.save'],
    [driverUser, 'driver.status'],
    [familyUser, 'anchor.save'],
    [driverUser, 'ride.create'],
    [driverUser, 'event.resolve'],
    [driverUser, 'member.add'],
    [familyUser, 'settings'],
    [auditAdmin, 'availability'],
  ])
    await post(user, { op }, 403, 'role enforced for ' + op);

  await post(
    auditAdmin,
    { op: 'driver.save', id: profile.id, data: profile },
    400,
    'register edit requires its displayed version',
  );
  await post(
    auditAdmin,
    { op: 'driver.save', data: profile },
    409,
    'duplicate driver email rejected',
  );
  const duplicateEmail = 'duplicate-' + run + '@ky-test.example';
  const duplicates = await Promise.all(
    [1, 2].map(() =>
      req(auditAdmin, undefined, {
        op: 'driver.save',
        data: { ...profile, email: duplicateEmail },
      }),
    ),
  );
  check(
    'concurrent duplicate driver registration creates exactly one record',
    () =>
      assert.deepEqual(
        duplicates.map((r) => r.status).sort((a, b) => a - b),
        [200, 409],
      ),
  );
  await post(
    auditAdmin,
    {
      op: 'member.add',
      role: 'driver',
      recordId: profile.id,
      name: 'Duplicate identity',
      email: 'second-driver-' + run + '@ky-test.example',
    },
    409,
    'one driver cannot be linked to two sign-in accounts',
  );
  await post(driverUser, {
    op: 'driver.save',
    id: profile.id,
    version: profile.version,
    data: {
      ...profile,
      phone: '+12145550199',
      smsConsent: true,
      notes: 'Driver cannot overwrite screening notes',
      licenseChecked: false,
    },
  });
  let state = await snapshot();
  const contactUpdate = state.drivers.find((d) => d.id === profile.id);
  check(
    'contact and SMS-consent changes persist without wiping approval or review notes',
    () => {
      assert.equal(contactUpdate.phone, '+12145550199');
      assert.equal(contactUpdate.smsConsent, true);
      assert.equal(contactUpdate.status, 'approved');
      assert.equal(contactUpdate.licenseChecked, true);
      assert.equal(contactUpdate.notes, profile.notes);
    },
  );
  await post(
    auditAdmin,
    {
      op: 'driver.save',
      id: profile.id,
      version: profile.version,
      data: { ...profile, name: 'Stale overwrite' },
    },
    409,
    'stale driver form cannot overwrite a newer contact update',
  );
  await post(
    auditAdmin,
    {
      op: 'driver.status',
      id: profile.id,
      version: profile.version,
      status: 'suspended',
      reason: 'Stale status form',
    },
    409,
    'stale approval form rejected',
  );
  const renamed = {
    ...contactUpdate,
    name: 'Updated Name ' + run,
    vehicle: 'Updated test vehicle',
    plate: 'NEWTEST',
  };
  await post(auditAdmin, {
    op: 'driver.save',
    id: profile.id,
    version: contactUpdate.version,
    data: renamed,
  });
  state = await snapshot();
  const changed = state.drivers.find((d) => d.id === profile.id);
  check(
    'identity or vehicle changes require renewed screening and approval',
    () => {
      assert.equal(changed.status, 'review');
      assert.equal(changed.licenseChecked, false);
      assert.equal(changed.screeningChecked, false);
    },
  );
  await post(
    auditAdmin,
    {
      op: 'driver.status',
      id: profile.id,
      version: changed.version,
      status: 'approved',
      reason: 'Insufficient review',
    },
    409,
    'changed eligibility cannot bypass screening',
  );
  await post(auditAdmin, {
    op: 'driver.save',
    id: profile.id,
    version: changed.version,
    data: {
      ...changed,
      licenseChecked: true,
      insuranceChecked: true,
      guardianConsent: true,
      screeningChecked: true,
    },
  });
  state = await snapshot();
  const checked = state.drivers.find((d) => d.id === profile.id);
  await post(auditAdmin, {
    op: 'driver.status',
    id: profile.id,
    version: checked.version,
    status: 'approved',
    reason: 'New documents reviewed',
  });
  await post(auditAdmin, {
    op: 'family.save',
    id: household.id,
    version: household.version,
    data: {
      ...household,
      student: 'Updated Student ' + run,
      guardian: 'Updated Guardian ' + run,
    },
  });
  await post(
    auditAdmin,
    {
      op: 'family.save',
      id: household.id,
      version: household.version,
      data: household,
    },
    409,
    'stale family form rejected',
  );
  state = await snapshot();
  check(
    'completed ride retains driver, vehicle, household and timing records after register edits',
    () => {
      const after = state.rides.find((r) => r.id === id);
      assert.deepEqual(after.driverSnapshot, ride.driverSnapshot);
      assert.deepEqual(after.familySnapshot, ride.familySnapshot);
      assert.equal(after.driverSnapshot.name, profile.name);
      assert.equal(after.driverSnapshot.vehicle, profile.vehicle);
      assert.equal(after.familySnapshot.student, household.student);
      for (const key of [
        'createdAt',
        'scheduledAt',
        'acceptedAt',
        'arrivedAt',
        'startedAt',
        'completedAt',
      ])
        assert.equal(after[key], ride[key]);
      assert.equal(
        state.drivers.find((d) => d.id === profile.id).creditedHours,
        1,
      );
    },
  );
  const currentDriver = state.drivers.find((d) => d.id === profile.id);
  const slots = currentDriver.availability;
  await post(
    driverUser,
    {
      op: 'availability',
      version: currentDriver.version,
      slots: slots.slice(0, 6),
    },
    400,
    'availability requires all seven days',
  );
  await post(driverUser, {
    op: 'availability',
    version: currentDriver.version,
    slots,
  });
  await post(
    driverUser,
    { op: 'availability', version: currentDriver.version, slots },
    409,
    'stale availability edit rejected',
  );

  const point = state.anchors.find((p) => p.id === a.id);
  await post(auditAdmin, {
    op: 'anchor.save',
    id: point.id,
    version: point.version,
    data: { ...point, active: false },
  });
  await post(
    auditAdmin,
    { op: 'anchor.save', id: point.id, version: point.version, data: point },
    409,
    'stale meeting-point edit rejected',
  );
  const booking = {
    op: 'ride.create',
    familyId: family.id,
    pickupId: a.id,
    dropoffId: b.id,
    scheduledAt: new Date(Date.now() + 4 * 3600000).toISOString(),
    activity: 'Endpoint audit',
  };
  await post(
    familyUser,
    booking,
    409,
    'inactive meeting point cannot be booked',
  );
  await get(
    familyUser,
    '/api/route?mode=pilot&pickup=' + a.id + '&dropoff=' + b.id,
    409,
    'inactive meeting point has no new-route preview',
  );
  await get(
    familyUser,
    '/api/route?mode=pilot&id=' + id,
    503,
    'existing route retains saved meeting points after deactivation',
  );
  await get(
    auditAdmin,
    '/api/route?mode=pilot&id=' + id + '&leg=current',
    409,
    'completed ride cannot show a live ETA',
  );
  await get(
    auditAdmin,
    '/api/route?mode=pilot&id=' + id + '&leg=bogus',
    400,
    'unknown route leg rejected',
  );
  await get(
    auditAdmin,
    '/api/route?mode=pilot',
    400,
    'route requires endpoints',
  );
  await get(
    auditAdmin,
    '/api/route?mode=pilot&id=missing',
    404,
    'missing ride route returns not found',
  );
  await get(
    auditAdmin,
    '/api/credits?mode=pilot',
    400,
    'credit history requires ride ID',
  );
  await get(
    auditAdmin,
    '/api/credits?mode=pilot&id=missing',
    404,
    'missing credit ride returns not found',
  );
  await get(
    auditAdmin,
    '/api/map-config?mode=pilot',
    503,
    'unconfigured production map reports unavailable',
  );
  const practiceMap = await get(auditAdmin, '/api/map-config?mode=practice');
  check('practice map configuration succeeds without production secrets', () =>
    assert.match(practiceMap.url, /openstreetmap/),
  );
  state = await snapshot();
  const inactive = state.anchors.find((p) => p.id === point.id);
  await post(auditAdmin, {
    op: 'anchor.save',
    id: point.id,
    version: inactive.version,
    data: { ...inactive, active: true },
  });
  await post(
    familyUser,
    { ...booking, scheduledAt: new Date().toISOString().slice(0, 19) },
    400,
    'timezone-less pickup time rejected',
  );
  await post(
    familyUser,
    { ...booking, scheduledAt: '2026-09-31T12:00:00Z' },
    400,
    'impossible calendar date rejected',
  );
  await post(
    auditAdmin,
    { op: 'ride.action', id, action: 'complete' },
    403,
    'admin cannot impersonate driver completion',
  );
  await post(
    auditAdmin,
    {
      op: 'ride.action',
      id,
      action: 'admin-complete',
      completedAt: new Date().toISOString(),
      reason: 'Completed rides cannot be closed again.',
    },
    409,
    'coordinator recovery cannot overwrite a completed ride',
  );
  await post(
    driverUser,
    { op: 'ride.action', id, action: 'complete' },
    409,
    'completed ride cannot receive a second completion timestamp',
  );
  await post(
    auditAdmin,
    { op: 'ride.action', id, action: 'not-an-action' },
    400,
    'unknown ride transition rejected',
  );

  await post(auditAdmin, {
    op: 'settings',
    coordinator: 'Test Coordinator',
    contactPhone: '+12145550198',
    pilotName: 'Endpoint audit pilot',
    smsConsent: false,
  });
  const settings = (await snapshot()).settings;
  check('pilot settings persist on a separate read', () =>
    assert.equal(settings.coordinator, 'Test Coordinator'),
  );
  await post(auditAdmin, { op: 'settings', ...original.settings });
  const json = await get(auditAdmin, '/api/export?mode=pilot');
  check(
    'operational JSON retains complete records, history and redacts pickup codes',
    () => {
      assert.ok(
        json.records.some((r) => r.kind === 'drivers' && r.id === profile.id),
      );
      assert.equal(
        json.records.find((r) => r.kind === 'rides' && r.id === id).data.otp,
        null,
      );
      assert.ok(
        json.records.some(
          (r) => r.kind === 'credit_reviews' && r.data.rideId === id,
        ),
      );
    },
  );
  const report = await fetch(base + '/api/reports?mode=pilot&query=' + id, {
    headers: {
      'x-ky-authenticated-user-id': auditAdmin.id,
      'x-ky-authenticated-user-email': auditAdmin.email,
      Connection: 'close',
    },
  });
  check('historical Excel export succeeds after profile edits', () =>
    assert.equal(report.status, 200),
  );
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await report.arrayBuffer()));
  function rows(name) {
    const s = workbook.getWorksheet(name),
      headers = s.getRow(4).values.slice(1);
    return Array.from({ length: s.rowCount - 4 }, (_, i) =>
      Object.fromEntries(
        headers.map((h, j) => [h, s.getRow(i + 5).getCell(j + 1).value]),
      ),
    );
  }
  const ledger = rows('Ride ledger')[0];
  check(
    'Excel includes the actor and request for help resolution on this ride',
    () => {
      const resolution = rows('Activity').find(
        (e) => e.Action === 'event.resolve',
      );
      assert.ok(resolution);
      assert.equal(resolution['Ride ID'], id);
      assert.equal(resolution['Actor email'], admin.email);
      assert.equal(resolution['Record type'], 'events');
      assert.match(resolution['Request ID'], /^[0-9a-f-]{36}$/);
    },
  );
  check(
    'Excel preserves trip identities, typed elapsed time and one current credit decision',
    () => {
      assert.equal(ledger.Driver, profile.name);
      assert.equal(ledger.Student, household.student);
      assert.equal(ledger['Vehicle at assignment'], profile.vehicle);
      assert.equal(
        ledger['Recorded service minutes'],
        (Date.parse(ride.completedAt) - Date.parse(ride.arrivedAt)) / 60000,
      );
      assert.equal(
        ledger['Waiting minutes'],
        (Date.parse(ride.startedAt) - Date.parse(ride.arrivedAt)) / 60000,
      );
      assert.equal(
        ledger['Driving minutes'],
        (Date.parse(ride.completedAt) - Date.parse(ride.startedAt)) / 60000,
      );
      assert.equal(ledger['Participant records'], 'Recorded with ride');
      assert.equal(ledger['Drop-off evidence'], 'Driver device GPS');
      assert.equal(
        rows('Credit reviews').filter((r) => r['Current decision']).length,
        1,
      );
    },
  );
  await get(
    auditAdmin,
    '/api/reports?mode=pilot&status=wrong',
    400,
    'unknown report ride status rejected',
  );
  await get(
    auditAdmin,
    '/api/reports?mode=pilot&review=wrong',
    400,
    'unknown report credit status rejected',
  );
  await get(
    auditAdmin,
    '/api/reports?mode=pilot',
    429,
    'repeated workbook requests are rate limited',
  );

  const expiredBucket = 'endpoint-cleanup-' + run;
  sql(
    "INSERT INTO request_logs(id,workspace,created_at,method,path,status,duration_ms) VALUES ('expired-" +
      run +
      "','pilot','2000-01-01T00:00:00.000Z','GET','/api/state',200,1)",
  );
  sql(
    "INSERT INTO rate_limits(bucket,count,expires_at) VALUES ('" +
      expiredBucket +
      "',1,1)",
  );
  const job = await fetch(base + '/api/jobs/notifications', {
    method: 'POST',
    headers: {
      Authorization:
        'Bearer ' +
        (process.env.KY_TEST_JOBS_TOKEN ?? 'ky-local-endpoint-audit-only'),
      Connection: 'close',
    },
  });
  check(
    'authorized notification job runs without sending unconfigured SMS',
    () => assert.equal(job.status, 200),
  );
  const jobData = await job.json();
  check('disabled SMS is reported honestly', () => {
    assert.equal(jobData.configured, false);
    assert.equal(jobData.processed, 0);
  });
  check('maintenance clears expired request counters', () =>
    assert.equal(
      sql(
        "SELECT count(*) AS n FROM rate_limits WHERE bucket='" +
          expiredBucket +
          "'",
      )[0].n,
      0,
    ),
  );
  check('maintenance removes old request metadata', () =>
    assert.equal(
      sql(
        "SELECT count(*) AS n FROM request_logs WHERE id='expired-" + run + "'",
      )[0].n,
      0,
    ),
  );
  const health = await get(auditAdmin, '/api/operations?mode=pilot');
  check(
    'operations reports stored job health and outstanding providers',
    () => {
      assert.ok(health.lastJob);
      assert.equal(health.configured, false);
      assert.equal(health.foregroundGpsOnly, true);
    },
  );
  const durable = await snapshot();
  check('maintenance preserves driver, ride and service-credit records', () => {
    assert.ok(durable.drivers.some((d) => d.id === profile.id));
    assert.equal(
      durable.rides.find((r) => r.id === id).completedAt,
      ride.completedAt,
    );
    assert.equal(durable.credits.find((c) => c.rideId === id).minutes, 60);
  });
  checks += await iamChecks({
    req,
    sql,
    run,
    auditAdmin,
    driverUser,
    familyUser,
    profileId: profile.id,
  });
  await post(admin, {
    op: 'member.remove',
    email: auditAdmin.email,
    reason: 'Endpoint audit complete',
  });
  await get(
    auditAdmin,
    undefined,
    403,
    'revoked admin loses access immediately',
  );
  return checks;
}
