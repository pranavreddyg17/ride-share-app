import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  elapsedMinutes,
  rideTiming,
  approvedMinutes,
  filterRides,
  creditState,
} from '../lib/service-hours.ts';

test('suggested service includes waiting from actual pickup arrival through drop-off', () => {
  const ride = {
    status: 'completed',
    acceptedAt: '2026-09-08T14:00:00Z',
    arrivedAt: '2026-09-08T14:10:00Z',
    startedAt: '2026-09-08T14:17:00Z',
    completedAt: '2026-09-08T14:40:00Z',
  };
  assert.deepEqual(rideTiming(ride), {
    wait: 7,
    driving: 23,
    service: 30,
    suggested: 30,
  });
});
test('rounding is applied once to service duration, not to each leg', () => {
  const ride = {
    status: 'completed',
    arrivedAt: '2026-09-08T14:00:00Z',
    startedAt: '2026-09-08T14:00:25Z',
    completedAt: '2026-09-08T14:00:50Z',
  };
  assert.equal(rideTiming(ride).suggested, 1);
  assert.equal(rideTiming(ride).service, 50 / 60);
});
test('historical missing arrival is not replaced with scheduled or pickup time', () => {
  assert.equal(
    rideTiming({
      status: 'completed',
      scheduledAt: '2026-09-08T14:00:00Z',
      startedAt: '2026-09-08T14:10:00Z',
      completedAt: '2026-09-08T14:30:00Z',
    }).suggested,
    null,
  );
});
test('invalid and reversed timestamps remain unknown', () => {
  assert.equal(elapsedMinutes('bad', '2026-09-08T14:30:00Z'), null);
  assert.equal(
    elapsedMinutes('2026-09-08T14:30:00Z', '2026-09-08T14:00:00Z'),
    null,
  );
  assert.equal(elapsedMinutes(null, null), null);
});
test('duration uses elapsed time across the daylight saving boundary', () => {
  assert.equal(
    elapsedMinutes('2026-11-01T01:50:00-05:00', '2026-11-01T01:20:00-06:00'),
    30,
  );
});
test('unfinished rides cannot produce suggested credit', () => {
  assert.equal(
    rideTiming({
      status: 'cancelled',
      arrivedAt: '2026-09-08T14:10:00Z',
      completedAt: '2026-09-08T14:40:00Z',
    }).suggested,
    null,
  );
  assert.equal(creditState({ status: 'in_progress' }), 'not_eligible');
  assert.equal(creditState({ status: 'completed' }), 'pending');
});
test('approved totals exclude excluded credit and unrelated drivers', () => {
  const credits = [
    { driverId: 'a', status: 'approved', minutes: 45 },
    { driverId: 'a', status: 'excluded', minutes: 0 },
    { driverId: 'b', status: 'approved', minutes: 15 },
  ];
  assert.equal(approvedMinutes(credits), 60);
  assert.equal(approvedMinutes(credits, 'a'), 45);
});
test('report date boundaries are scheduled dates in Central Time', () => {
  const rides = [
    {
      id: 'before',
      scheduledAt: '2026-09-08T04:59:59Z',
      status: 'completed',
      driverId: 'a',
    },
    {
      id: 'first',
      scheduledAt: '2026-09-08T05:00:00Z',
      status: 'completed',
      driverId: 'a',
    },
    {
      id: 'last',
      scheduledAt: '2026-09-09T04:59:59Z',
      status: 'completed',
      driverId: 'a',
    },
    {
      id: 'after',
      scheduledAt: '2026-09-09T05:00:00Z',
      status: 'completed',
      driverId: 'b',
    },
  ];
  const state = { rides, credits: [], drivers: [], families: [] };
  assert.deepEqual(
    filterRides(state, { from: '2026-09-08', to: '2026-09-08' }).map(
      (r) => r.id,
    ),
    ['last', 'first'],
  );
});
test('driver, status, credit and text filters intersect without changing stored records', () => {
  const state = {
    rides: [
      {
        id: 'ride-a',
        scheduledAt: '2026-09-08T15:00:00Z',
        status: 'completed',
        driverId: 'a',
        familyId: 'f',
        activity: 'Music',
      },
      {
        id: 'ride-b',
        scheduledAt: '2026-09-08T16:00:00Z',
        status: 'completed',
        driverId: 'b',
      },
    ],
    credits: [{ rideId: 'ride-a', status: 'approved' }],
    drivers: [{ id: 'a', name: 'Sam' }],
    families: [{ id: 'f', student: 'Alex' }],
  };
  assert.deepEqual(
    filterRides(state, {
      driver: 'a',
      status: 'completed',
      review: 'approved',
      query: 'alex',
    }).map((r) => r.id),
    ['ride-a'],
  );
  assert.equal(filterRides(state, { review: 'pending' }).length, 1);
  assert.equal(state.rides.length, 2);
});
