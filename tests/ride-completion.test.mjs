import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseInstant,
  completionTime,
  completionLabel,
} from '../lib/ride-completion.ts';
const pickup = {
  arrivedAt: '2026-09-09T12:00:00Z',
  startedAt: '2026-09-09T12:05:00Z',
};
const now = '2026-09-09T13:00:00.000Z';
test('only real calendar instants with explicit timezones are accepted', () => {
  for (const value of [
    '2026-02-30T12:00:00Z',
    '2026-09-09T24:00:00Z',
    '2026-09-09T12:60:00Z',
    '2026-09-09T12:00:60Z',
    '2026-09-09T12:00:00',
    '',
    null,
    '2026-09-09T12:00:00+25:00',
  ])
    assert.equal(parseInstant(value), null, String(value));
  assert.equal(
    parseInstant('2024-02-29T12:00:00-06:00'),
    '2024-02-29T18:00:00.000Z',
  );
});
test('coordinator time preserves verified drop-off and rejects future instants without grace', () => {
  assert.equal(
    completionTime(pickup, '2026-09-09T07:30:00-05:00', now),
    '2026-09-09T12:30:00.000Z',
  );
  assert.throws(
    () => completionTime(pickup, '2026-09-09T13:00:00.001Z', now),
    /future/,
  );
  assert.throws(
    () => completionTime(pickup, '2026-09-09T12:04:59Z', now),
    /pickup verification/,
  );
});
test('missing, invalid or out-of-order pickup records cannot be silently completed', () => {
  for (const ride of [
    {},
    { arrivedAt: 'bad', startedAt: pickup.startedAt },
    { arrivedAt: pickup.startedAt, startedAt: pickup.arrivedAt },
  ])
    assert.throws(() => completionTime(ride, now, now), /pickup record/);
});
test('completion evidence distinguishes actual GPS, exceptions, practice, historical, and open rides', () => {
  assert.equal(completionLabel({ status: 'pending' }), 'Not completed');
  assert.equal(
    completionLabel({ status: 'completed', completionMethod: 'practice' }),
    'Practice confirmation',
  );
  assert.equal(
    completionLabel({ status: 'completed', completionMethod: 'driver_gps' }),
    'Driver device GPS',
  );
  assert.match(
    completionLabel({
      status: 'completed',
      completionMethod: 'coordinator_verified',
    }),
    /exception/,
  );
  assert.match(completionLabel({ status: 'completed' }), /Historical/);
});
