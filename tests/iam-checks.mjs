import assert from 'node:assert/strict';

export async function iamChecks({
  req,
  sql,
  run,
  auditAdmin,
  driverUser,
  familyUser,
  profileId,
}) {
  let checks = 0;
  const check = (label, fn) => {
    fn();
    checks++;
    console.log('PASS ' + label);
  };
  const expect = (res, code, label) => {
    check(label, () =>
      assert.equal(res.status, code, JSON.stringify(res.data)),
    );
    return res;
  };
  const post = async (user, body, code = 200, label = body.op, headers) =>
    expect(await req(user, undefined, body, headers), code, label);
  const get = async (
    user,
    path = '/api/state?mode=pilot',
    code = 200,
    label = path,
  ) => expect(await req(user, path), code, label);
  const snapshot = (await get(auditAdmin)).data;
  const profile = snapshot.drivers.find((d) => d.id === profileId);
  const email = 'regrant-' + run + '@ky-test.example';
  const first = { email, id: 'first-' + run },
    replacement = { email, id: 'replacement-' + run };
  await post(auditAdmin, {
    op: 'driver.save',
    data: { ...profile, name: 'IAM Test Driver', email, plate: 'IAMTEST' },
  });
  const record = (await get(auditAdmin)).data.drivers.find(
    (d) => d.email === email,
  );
  const grant = {
    op: 'member.add',
    role: 'driver',
    recordId: record.id,
    email,
    name: 'IAM Test Driver',
  };
  await post(auditAdmin, grant);
  await get(
    first,
    undefined,
    200,
    'first sign-in binds the approved email to its identity',
  );
  await get(
    replacement,
    undefined,
    403,
    'another identity with the same email cannot take over a bound account',
  );
  const key = crypto.randomUUID();
  const body = {
    op: 'driver.save',
    id: record.id,
    version: record.version,
    data: { ...record, phone: '+12145550188' },
  };
  await post(first, body, 200, 'bound driver writes own contact details', {
    'Idempotency-Key': key,
  });
  await post(auditAdmin, {
    op: 'member.remove',
    email,
    reason: 'Replace test identity',
  });
  await get(first, undefined, 403, 'revoked identity loses record access');
  await post(auditAdmin, grant);
  await get(
    replacement,
    undefined,
    200,
    'a new grant can bind a replacement identity',
  );
  await get(
    first,
    undefined,
    403,
    'old identity remains denied after account replacement',
  );
  await post(
    replacement,
    body,
    409,
    'old grant receipts cannot replay under a new grant',
    { 'Idempotency-Key': key },
  );
  const current = (await get(replacement)).data.drivers[0];
  const replacementKey = crypto.randomUUID();
  const replacementBody = {
    ...body,
    version: current.version,
    data: { ...current, phone: '+12145550189' },
  };
  const success = await post(
    replacement,
    replacementBody,
    200,
    'replacement identity saves with current version',
    { 'Idempotency-Key': replacementKey },
  );
  const events = (await get(auditAdmin)).data.events;
  check(
    'business event has verified actor, action, record and request correlation',
    () => {
      const event = events.find((e) => e.requestId === success.requestId);
      assert.ok(event);
      assert.equal(event.actorId, replacement.id);
      assert.equal(event.actorEmail, email);
      assert.equal(event.actorRole, 'driver');
      assert.equal(event.action, 'driver.save');
      assert.equal(event.entityKind, 'drivers');
      assert.equal(event.entityId, record.id);
    },
  );
  await post(auditAdmin, {
    op: 'member.remove',
    email,
    reason: 'Test same-identity regrant',
  });
  await post(auditAdmin, grant);
  await get(
    replacement,
    undefined,
    200,
    'same identity can bind its new reviewed grant',
  );
  await post(
    replacement,
    replacementBody,
    409,
    'regrant invalidates receipts even when the verified user ID is unchanged',
    { 'Idempotency-Key': replacementKey },
  );
  await post(auditAdmin, {
    op: 'member.remove',
    email,
    reason: 'IAM test complete',
  });

  // The trigger changes authorization after the primary write and before its
  // receipt. The whole D1 batch, including that change, must roll back.
  const raceProfile = (await get(driverUser)).data.drivers.find(
    (d) => d.id === profileId,
  );
  const previousGrant = sql(
    "SELECT grant_id FROM members WHERE email='" + driverUser.email + "'",
  )[0].grant_id;
  sql(
    "CREATE TRIGGER ky_test_regrant_race AFTER UPDATE ON records WHEN NEW.workspace='pilot' AND NEW.kind='drivers' AND NEW.id='" +
      profileId +
      "' BEGIN UPDATE members SET grant_id='replaced-during-write' WHERE email='" +
      driverUser.email +
      "'; END",
  );
  try {
    await post(
      driverUser,
      {
        op: 'driver.save',
        id: profileId,
        version: raceProfile.version,
        data: { ...raceProfile, phone: '+12145550187' },
      },
      409,
      'membership change during commit rejects the entire write',
    );
  } finally {
    sql('DROP TRIGGER IF EXISTS ky_test_regrant_race');
  }
  check(
    'rejected write leaves both the driver and access grant unchanged',
    () => {
      const rows = sql(
        "SELECT data,version FROM records WHERE workspace='pilot' AND kind='drivers' AND id='" +
          profileId +
          "'",
      );
      assert.equal(rows[0].version, raceProfile.version);
      assert.equal(JSON.parse(rows[0].data).phone, raceProfile.phone);
      assert.equal(
        sql(
          "SELECT grant_id FROM members WHERE email='" + driverUser.email + "'",
        )[0].grant_id,
        previousGrant,
      );
    },
  );

  await get(
    driverUser,
    '/api/audit?mode=pilot',
    403,
    'driver cannot read system request logs',
  );
  await get(
    familyUser,
    '/api/audit?mode=pilot',
    403,
    'family cannot read system request logs',
  );
  await get(
    auditAdmin,
    '/api/audit?mode=pilot&result=invalid',
    400,
    'invalid log result filter rejected',
  );
  await get(
    auditAdmin,
    '/api/audit?mode=pilot&cursor=invalid',
    400,
    'invalid log cursor rejected',
  );
  const marker = 'DO-NOT-LOG-' + run;
  const rejected = expect(
    await req(auditAdmin, '/api/state?mode=pilot&secret=' + marker, {
      op: 'unknown',
      password: marker,
      otp: marker,
    }),
    400,
    'invalid operation returns a traceable rejection',
  );
  check('every API response has a unique request ID', () => {
    assert.match(rejected.requestId, /^[0-9a-f-]{36}$/);
    assert.notEqual(rejected.requestId, success.requestId);
  });
  let matched;
  for (let i = 0; i < 5 && !matched; i++) {
    const audit = (
      await get(
        auditAdmin,
        '/api/audit?mode=pilot&result=errors&actor=' +
          encodeURIComponent(auditAdmin.email),
      )
    ).data;
    matched = audit.entries.find((e) => e.id === rejected.requestId);
  }
  check(
    'failed requests are searchable by actor and correlated with the response',
    () => {
      assert.ok(matched);
      assert.equal(matched.status, 400);
      assert.equal(matched.actor_role, 'admin');
      assert.equal(matched.path, '/api/state');
      assert.equal(matched.method, 'POST');
      assert.ok(matched.duration_ms >= 0);
      const stored = sql(
        "SELECT * FROM request_logs WHERE id='" + rejected.requestId + "'",
      )[0];
      assert.ok(stored);
      assert.ok(!JSON.stringify(stored).includes(marker));
    },
  );
  const page = (await get(auditAdmin, '/api/audit?mode=pilot')).data;
  check('request-log pages are bounded and explain retention', () => {
    assert.equal(page.entries.length, 100);
    assert.equal(page.retentionDays, 7);
    assert.ok(page.nextCursor);
  });
  const older = (
    await get(
      auditAdmin,
      '/api/audit?mode=pilot&cursor=' + encodeURIComponent(page.nextCursor),
    )
  ).data;
  check('cursor pagination neither repeats nor skips its page boundary', () => {
    assert.ok(older.entries.length > 0);
    assert.ok(
      !older.entries.some((e) => page.entries.some((p) => p.id === e.id)),
    );
    const boundary = page.entries.at(-1),
      next = older.entries[0];
    assert.ok(
      next.created_at < boundary.created_at ||
        (next.created_at === boundary.created_at && next.id < boundary.id),
    );
  });
  check(
    'authorized scheduled jobs are attributed to a service identity',
    () => {
      assert.ok(
        sql(
          "SELECT id FROM request_logs WHERE actor_role='service' AND actor_id='notification-job' AND path='/api/jobs/notifications' AND status=200",
        ).length,
      );
    },
  );
  const familyEvents = (await get(familyUser)).data.events;
  check(
    'family activity omits internal actor identities and request metadata',
    () => {
      assert.ok(familyEvents.length > 0);
      assert.ok(
        familyEvents.every(
          (e) =>
            !('actorEmail' in e) && !('actorId' in e) && !('requestId' in e),
        ),
      );
    },
  );
  const practice = (await get(auditAdmin, '/api/audit?mode=practice')).data;
  check('practice audit logs stay inside the caller workspace', () =>
    assert.ok(!practice.entries.some((e) => e.id === rejected.requestId)),
  );
  return checks;
}
