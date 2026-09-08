import test from 'node:test';
import assert from 'node:assert/strict';
import { directions, mapConfiguration } from '../lib/providers.ts';
import { sendSms, readSms } from '../lib/sms-provider.ts';
import { postMutation } from '../lib/client-api.ts';
const a = { lat: 33, lng: -97 },
  b = { lat: 33.1, lng: -97.1 };
const route = {
  code: 'Ok',
  routes: [
    {
      geometry: {
        coordinates: [
          [-97, 33],
          [-97.1, 33.1],
        ],
      },
      distance: 10000,
      duration: 700,
    },
  ],
};
const credentials = {
  account: 'AC' + '0'.repeat(32),
  token: 'test-only',
  service: 'MG' + '1'.repeat(32),
};
const sid = 'SM' + '2'.repeat(32);
test('live directions fail closed without provider configuration', async () => {
  await assert.rejects(
    directions(a, b, undefined, false, () =>
      assert.fail('must not use public fallback'),
    ),
    /not configured/,
  );
});
test('traffic directions use Mapbox and preserve road geometry and units', async () => {
  const result = await directions(
    a,
    b,
    'server-test-token',
    false,
    async (url) => {
      assert.match(
        url,
        /api.mapbox.com\/directions\/v5\/mapbox\/driving-traffic\/-97,33;-97.1,33.1/,
      );
      return Response.json(route);
    },
  );
  assert.equal(result.trafficAware, true);
  assert.equal(result.duration, 700);
  assert.deepEqual(result.coordinates, route.routes[0].geometry.coordinates);
});
test('practice directions explicitly use OSRM without traffic claims', async () => {
  const result = await directions(a, b, 'do-not-leak', true, async (url) => {
    assert.match(url, /router.project-osrm.org/);
    assert.ok(!url.includes('do-not-leak'));
    return Response.json(route);
  });
  assert.equal(result.trafficAware, false);
});
test('unavailable, malformed and out-of-range routes never fabricate geometry', async () => {
  for (const response of [
    new Response('', { status: 503 }),
    Response.json({ code: 'NoRoute' }),
    Response.json({
      ...route,
      routes: [{ ...route.routes[0], geometry: { coordinates: [[500, 90]] } }],
    }),
  ])
    await assert.rejects(directions(a, b, 'test', false, async () => response));
});
test('browser map configuration refuses secret or missing tokens', () => {
  assert.throws(() => mapConfiguration(false), /not configured/);
  assert.throws(() => mapConfiguration(false, 'sk.secret'), /not configured/);
  assert.match(
    mapConfiguration(false, 'pk.public').url,
    /mapbox.*access_token=pk.public/,
  );
  assert.match(mapConfiguration(true, 'sk.secret').url, /openstreetmap/);
});
test('SMS acceptance is not presented as delivery and carries consented destination', async () => {
  const result = await sendSms(
    credentials,
    '+12145550111',
    'Ride update',
    async (url, options) => {
      assert.ok(url.endsWith('/Messages.json'));
      assert.equal(options.method, 'POST');
      assert.equal(options.body.get('To'), '+12145550111');
      assert.equal(options.body.get('ValidityPeriod'), '900');
      assert.equal(
        options.body.get('MessagingServiceSid'),
        credentials.service,
      );
      return Response.json({ sid, status: 'queued' }, { status: 201 });
    },
  );
  assert.deepEqual(result, { status: 'accepted', providerId: sid, error: '' });
});
test('definitive provider rejection becomes failed', async () => {
  assert.equal(
    (
      await sendSms(credentials, '+12145550111', 'x', async () =>
        Response.json({ code: 21610 }, { status: 400 }),
      )
    ).status,
    'failed',
  );
});
test('ambiguous provider errors never claim success or automatically resend', async () => {
  for (const send of [
    async () => {
      throw new Error('timeout');
    },
    async () => new Response('', { status: 503 }),
    async () => Response.json({ sid: 'invalid' }),
  ]) {
    let calls = 0;
    const result = await sendSms(
      credentials,
      '+12145550111',
      'x',
      async (...args) => {
        calls++;
        return send(...args);
      },
    );
    assert.equal(result.status, 'unknown');
    assert.equal(calls, 1);
  }
});
test('delivery reconciliation distinguishes delivered and undelivered', async () => {
  assert.equal(
    (
      await readSms(credentials, sid, async () =>
        Response.json({ status: 'delivered' }),
      )
    ).status,
    'delivered',
  );
  assert.deepEqual(
    await readSms(credentials, sid, async () =>
      Response.json({ status: 'undelivered', error_code: 30003 }),
    ),
    { status: 'undelivered', error: 'Provider error 30003' },
  );
  await assert.rejects(
    readSms(credentials, sid, async () =>
      Response.json({ status: 'invented' }),
    ),
  );
});
test('client retries network and server failures with one idempotency key', async () => {
  const original = globalThis.fetch,
    keys = [];
  globalThis.fetch = async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    if (keys.length === 1) throw new TypeError('connection lost');
    if (keys.length === 2)
      return Response.json({ error: 'temporary' }, { status: 503 });
    return Response.json({ message: 'Saved', id: 'original-ride' });
  };
  try {
    assert.equal(
      (await postMutation(false, 'family', { op: 'ride.create' })).id,
      'original-ride',
    );
    assert.equal(keys.length, 3);
    assert.equal(new Set(keys).size, 1);
  } finally {
    globalThis.fetch = original;
  }
});
test('client never retries rejected permissions or business validation', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return Response.json({ error: 'Denied' }, { status: 403 });
  };
  try {
    await assert.rejects(postMutation(false, 'driver', {}), /Denied/);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
  }
});
