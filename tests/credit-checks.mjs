import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';

export async function creditChecks({
  base,
  req,
  read,
  post,
  sql,
  admin,
  driverUser,
  familyUser,
  driver,
  id,
  forbiddenRide,
}) {
  let checks = 0;
  function check(label, fn) {
    fn();
    checks++;
    console.log('PASS ' + label);
  }
  const review = {
    op: 'credit.review',
    id,
    status: 'approved',
    minutes: 25,
    reason: 'Verified pickup arrival through drop-off',
    revision: 0,
  };
  const beforeRide = (await read(admin)).rides.find((r) => r.id === id);
  check('ride lifecycle records all actual timestamps in order', () => {
    const stamps = [
      beforeRide.acceptedAt,
      beforeRide.arrivedAt,
      beforeRide.startedAt,
      beforeRide.completedAt,
    ].map(Date.parse);
    assert.ok(stamps.every(Number.isFinite));
    assert.deepEqual(
      stamps,
      [...stamps].sort((a, b) => a - b),
    );
  });
  await post(
    driverUser,
    review,
    403,
    'driver cannot approve their own service credit',
  );
  await post(familyUser, review, 403, 'family cannot issue service credit');
  await post(
    admin,
    { ...review, id: forbiddenRide },
    409,
    'cancelled ride is ineligible for service credit',
  );
  for (const invalid of [
    { minutes: -1 },
    { minutes: 1.5 },
    { minutes: 1441 },
    { minutes: '25' },
    { status: 'pending' },
    { status: 'excluded' },
    { reason: 'x' },
  ])
    await post(
      admin,
      { ...review, ...invalid },
      400,
      'invalid credit decision rejected ' + JSON.stringify(invalid),
    );
  const key = crypto.randomUUID();
  const first = await req(
    admin,
    undefined,
    { ...review, reviewedBy: 'forged@example.com' },
    { 'Idempotency-Key': key },
  );
  check('admin credit approval succeeds', () =>
    assert.equal(first.status, 200),
  );
  const retry = await req(
    admin,
    undefined,
    { ...review, reviewedBy: 'forged@example.com' },
    { 'Idempotency-Key': key },
  );
  check(
    'retried approval returns original result with its own request trace',
    () => {
      assert.equal(retry.status, first.status);
      assert.deepEqual(retry.data, first.data);
      assert.notEqual(retry.requestId, first.requestId);
    },
  );
  const credit = (await read(admin)).credits.find((c) => c.rideId === id);
  check('server records reviewer and one current revision', () => {
    assert.equal(credit.reviewedBy, admin.email);
    assert.equal(credit.revision, 1);
    assert.equal(credit.minutes, 25);
    assert.ok(Number.isFinite(Date.parse(credit.reviewedAt)));
  });
  await post(admin, {
    ...review,
    minutes: 30,
    revision: 1,
    reason: 'Corrected review after checking wait time',
  });
  await post(
    admin,
    { ...review, minutes: 99, revision: 1 },
    409,
    'stale admin edit cannot overwrite newer credit',
  );
  const raced = await Promise.all(
    [40, 45].map((minutes) =>
      req(admin, undefined, { ...review, minutes, revision: 2 }),
    ),
  );
  check('simultaneous service-credit amendments permit one winner', () =>
    assert.deepEqual(
      raced.map((r) => r.status).sort((a, b) => a - b),
      [200, 409],
    ),
  );
  const current = (await read(admin)).credits.find((c) => c.rideId === id);
  check('amendment replaces total instead of adding duplicate hours', () => {
    assert.equal(current.revision, 3);
    assert.ok([40, 45].includes(current.minutes));
  });
  const counts = () =>
    sql(
      "SELECT (SELECT COUNT(*) FROM records WHERE kind='credits') AS credits,(SELECT COUNT(*) FROM records WHERE kind='credit_reviews') AS history,(SELECT COUNT(*) FROM events) AS events,(SELECT COUNT(*) FROM mutation_receipts) AS receipts",
    )[0];
  const beforeFault = counts();
  const exclusion = {
    ...review,
    status: 'excluded',
    minutes: 0,
    revision: 3,
    reason: 'Exclude test credit after review',
  };
  const faultKey = crypto.randomUUID();
  sql(
    "CREATE TRIGGER ky_test_credit_history_failure BEFORE INSERT ON records WHEN NEW.kind='credit_reviews' BEGIN SELECT RAISE(ABORT,'injected credit history failure'); END",
  );
  try {
    const result = await req(admin, undefined, exclusion, {
      'Idempotency-Key': faultKey,
    });
    check('history failure rejects credit transaction', () =>
      assert.equal(result.status, 500),
    );
    check('credit and audit rollback together on history failure', () => {
      assert.deepEqual(counts(), beforeFault);
      const persisted = JSON.parse(
        sql(
          "SELECT data FROM records WHERE workspace='pilot' AND kind='credits' AND id='" +
            id +
            "'",
        )[0].data,
      );
      assert.deepEqual(persisted, current);
    });
  } finally {
    sql('DROP TRIGGER IF EXISTS ky_test_credit_history_failure');
  }
  const excluded = await req(admin, undefined, exclusion, {
    'Idempotency-Key': faultKey,
  });
  check('credit transaction can be retried after rollback', () =>
    assert.equal(excluded.status, 200),
  );
  const excludedState = await read(driverUser);
  check('excluded service is removed from approved totals', () => {
    assert.equal(excludedState.drivers[0].creditedHours, 0);
    assert.equal(
      excludedState.credits.find((c) => c.rideId === id).status,
      'excluded',
    );
  });
  const formulaNote = '=HYPERLINK("https://example.invalid","test note")';
  await post(admin, {
    ...review,
    revision: 4,
    minutes: 60,
    reason: formulaNote,
  });
  const finalState = await read(admin);
  check('credit review never rewrites actual trip timestamps', () => {
    const afterRide = finalState.rides.find((r) => r.id === id);
    for (const key of [
      'acceptedAt',
      'arrivedAt',
      'startedAt',
      'completedAt',
      'scheduledAt',
    ])
      assert.equal(afterRide[key], beforeRide[key]);
  });
  const driverState = await read(driverUser),
    familyState = await read(familyUser);
  check('service totals are scoped and private to driver/admin', () => {
    assert.equal(driverState.drivers[0].creditedHours, 1);
    assert.ok(driverState.credits.every((c) => c.driverId === driver.id));
    assert.deepEqual(familyState.credits, []);
    assert.ok(!familyState.events.some((e) => e.kind === 'service_credit'));
    assert.equal(
      familyState.drivers.find((d) => d.id === driver.id).creditedHours,
      undefined,
    );
  });
  const historyPath = '/api/credits?mode=pilot&id=' + id;
  const history = await req(admin, historyPath);
  check(
    'every credit revision keeps its author, decision, minutes and reason',
    () => {
      assert.equal(history.status, 200);
      assert.deepEqual(
        history.data.reviews.map((r) => r.revision),
        [5, 4, 3, 2, 1],
      );
      assert.equal(history.data.reviews[3].minutes, 30);
      assert.ok(
        history.data.reviews.every(
          (r) => r.reviewedBy === admin.email && r.reason,
        ),
      );
    },
  );
  const ownHistory = await req(driverUser, historyPath);
  check('driver can read own complete credit history', () => {
    assert.equal(ownHistory.status, history.status);
    assert.deepEqual(ownHistory.data, history.data);
  });
  const familyHistory = await req(familyUser, historyPath),
    otherHistory = await req(
      driverUser,
      '/api/credits?mode=pilot&id=' + forbiddenRide,
    );
  check('family and unrelated driver cannot read credit history', () => {
    assert.equal(familyHistory.status, 403);
    assert.equal(otherHistory.status, 403);
  });
  async function report(user, query = '') {
    const res = await fetch(base + '/api/reports?mode=pilot' + query, {
      headers: user
        ? {
            'oai-authenticated-user-id': user.id,
            'oai-authenticated-user-email': user.email,
          }
        : {},
    });
    if (res.status !== 200)
      return { status: res.status, error: await res.text() };
    assert.match(res.headers.get('content-type'), /spreadsheetml/);
    assert.match(res.headers.get('cache-control'), /no-store/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(Buffer.from(await res.arrayBuffer()));
    return { status: res.status, workbook };
  }
  const anonymous = await report(null),
    denied = await report(familyUser);
  check('Excel export requires admin or driver authorization', () => {
    assert.equal(anonymous.status, 401);
    assert.equal(denied.status, 403);
  });
  const full = await report(admin);
  check('admin receives a readable seven-sheet Excel workbook', () => {
    assert.equal(full.status, 200, full.error);
    assert.deepEqual(
      full.workbook.worksheets.map((s) => s.name),
      [
        'Driver summary',
        'Ride ledger',
        'Credit reviews',
        'Activity',
        'Driver register',
        'Family register',
        'Meeting points',
      ],
    );
  });
  function rows(workbook, name) {
    const sheet = workbook.getWorksheet(name);
    const headers = sheet.getRow(4).values.slice(1);
    const records = [];
    for (let i = 5; i <= sheet.rowCount; i++)
      records.push(
        Object.fromEntries(
          headers.map((h, j) => [h, sheet.getRow(i).getCell(j + 1).value]),
        ),
      );
    return records;
  }
  const ledgerRow = rows(full.workbook, 'Ride ledger').find(
    (r) => r['Ride ID'] === id,
  );
  check(
    'Excel contains typed credit totals, actual timings and no pickup codes',
    () => {
      assert.equal(ledgerRow['Credited minutes'], 60);
      assert.equal(ledgerRow['Credited hours'], 1);
      assert.ok(ledgerRow['Arrived at pickup (CT)'] instanceof Date);
      assert.equal(ledgerRow['Arrival (UTC ISO)'], beforeRide.arrivedAt);
      assert.equal(ledgerRow['Drop-off (UTC ISO)'], beforeRide.completedAt);
      assert.equal(ledgerRow['Review note'], formulaNote);
      assert.ok(
        !Object.keys(ledgerRow).some((k) => /otp|pickup code/i.test(k)),
      );
      const summary = rows(full.workbook, 'Driver summary').find(
        (r) => r['Driver ID'] === driver.id,
      );
      assert.equal(summary['Approved credit minutes'], 60);
      assert.equal(summary['Approved service hours'], 1);
      assert.equal(
        rows(full.workbook, 'Credit reviews').filter((r) => r['Ride ID'] === id)
          .length,
        5,
      );
    },
  );
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(beforeRide.scheduledAt));
  const filtered = await report(
    admin,
    '&driver=' + driver.id + '&query=' + id + '&from=' + date + '&to=' + date,
  );
  check(
    'workbook filters consistently scope rides, history and registers',
    () => {
      assert.equal(filtered.status, 200, filtered.error);
      assert.deepEqual(
        rows(filtered.workbook, 'Ride ledger').map((r) => r['Ride ID']),
        [id],
      );
      assert.deepEqual(
        rows(filtered.workbook, 'Driver register').map((r) => r['Driver ID']),
        [driver.id],
      );
      assert.ok(
        rows(filtered.workbook, 'Activity').every((r) => r['Ride ID'] === id),
      );
      assert.equal(rows(filtered.workbook, 'Credit reviews').length, 5);
    },
  );
  const invalidDate = await report(admin, '&from=2026-02-31');
  check('Excel rejects impossible calendar dates', () =>
    assert.equal(invalidDate.status, 400),
  );
  const own = await report(driverUser);
  const anotherDriver = await report(driverUser, '&driver=not-your-id');
  check(
    'driver Excel export contains own service records and no family register',
    () => {
      assert.equal(own.status, 200, own.error);
      assert.equal(own.workbook.worksheets.length, 3);
      const records = rows(own.workbook, 'Ride ledger');
      assert.ok(records.length > 0);
      assert.ok(
        records.every(
          (r) =>
            r['Driver ID'] === driver.id &&
            !('Student' in r) &&
            !('Guardian' in r),
        ),
      );
      assert.equal(anotherDriver.status, 403);
    },
  );
  return checks;
}
