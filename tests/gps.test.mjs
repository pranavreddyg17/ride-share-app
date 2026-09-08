import test from 'node:test';
import assert from 'node:assert/strict';
import { watchDevicePosition } from '../lib/gps.ts';
test('foreground GPS refreshes stationary positions, preserves timestamps and ignores late callbacks', () => {
  const originalSet = globalThis.setInterval,
    originalClear = globalThis.clearInterval;
  let tick, deliver, clearedWatch, clearedTimer, options;
  const received = [],
    errors = [];
  globalThis.setInterval = (fn, ms) => {
    assert.equal(ms, 15000);
    tick = fn;
    return 7;
  };
  globalThis.clearInterval = (id) => {
    clearedTimer = id;
  };
  const geo = {
    watchPosition: (success, failure, opts) => {
      deliver = success;
      options = opts;
      return 5;
    },
    getCurrentPosition: (success) =>
      success({
        timestamp: 2000,
        coords: { latitude: 33, longitude: -97, accuracy: 8 },
      }),
    clearWatch: (id) => {
      clearedWatch = id;
    },
  };
  try {
    const stop = watchDevicePosition(
      geo,
      (p) => received.push(p),
      (e) => errors.push(e),
    );
    assert.equal(options.maximumAge, 0);
    deliver({ timestamp: 1000, coords: {} });
    tick();
    tick(); // Stationary fix, then a duplicate device timestamp.
    deliver({ timestamp: 1500, coords: {} }); // Older watch callback arrives late.
    assert.deepEqual(
      received.map((p) => p.timestamp),
      [1000, 2000],
    );
    stop();
    deliver({ timestamp: 3000, coords: {} });
    assert.equal(received.length, 2);
    assert.equal(clearedWatch, 5);
    assert.equal(clearedTimer, 7);
    assert.deepEqual(errors, []);
  } finally {
    globalThis.setInterval = originalSet;
    globalThis.clearInterval = originalClear;
  }
});
