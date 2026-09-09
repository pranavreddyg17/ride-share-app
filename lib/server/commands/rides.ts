import { ApiError, now, uid, type Context } from '../runtime';
import { requireRole, canSeeRide } from '../auth';
import { txt, number } from '../validation';
import { record, save, saveRide, audit } from '../repository';
import { familySnapshot } from '../eligibility';
import { type Family, type Anchor, type Ride } from '../../types';
import { clearLocation, distance } from '../locations';
import { completionTime, parseInstant } from '../../ride-completion';
export async function ridesCommand(c: Context, body: Record<string, unknown>) {
  const op = txt(body.op, 1, 30);
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
    const scheduledAt = txt(body.scheduledAt);
    if (!parseInstant(scheduledAt))
      throw new ApiError(400, 'Pickup time must include its timezone.');
    const ts = Date.parse(scheduledAt);
    if (
      !Number.isFinite(ts) ||
      ts < Date.now() + 29 * 60000 ||
      ts > Date.now() + 7 * 86400000
    )
      throw new ApiError(400, 'Choose a pickup 30 minutes to 7 days from now.');
    const r: Ride = {
      id: 'KY-' + uid().slice(0, 8).toUpperCase(),
      familyId,
      familySnapshot: familySnapshot(f),
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
      completionMethod: null,
      acceptedAt: null,
      arrivedAt: null,
      cancelledAt: null,
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
      message: 'Ride requested.',
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
      r.acceptedAt = null;
      clearLocation(c, r);
      message = 'Driver assigned. Their confirmation is needed.';
    } else if (action === 'decline') {
      requireRole(c, 'driver');
      if (!['pending', 'accepted'].includes(r.status))
        throw new ApiError(409, 'Only unstarted requests can be declined.');
      const reason = txt(body.reason, 4, 500);
      r.driverId = null;
      r.driverSnapshot = null;
      r.acceptedAt = null;
      r.status = 'pending';
      clearLocation(c, r);
      message = `Driver declined: ${reason}. Coordinator reassignment is needed.`;
    } else if (action === 'accept') {
      requireRole(c, 'driver');
      if (r.status !== 'pending')
        throw new ApiError(409, 'This ride is not awaiting confirmation.');
      r.status = 'accepted';
      r.acceptedAt = now();
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
      r.arrivedAt = now();
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
      const recordedAt = now();
      let confirmedAt: string;
      try {
        confirmedAt = completionTime(r, recordedAt, recordedAt);
      } catch (error) {
        throw new ApiError(409, (error as Error).message);
      }
      const gps = c.demo ? undefined : await requireProximity(c, r, 'dropoff');
      r.status = 'completed';
      r.completedAt = confirmedAt;
      r.completionMethod = c.demo ? 'practice' : 'driver_gps';
      r.completion = { recordedAt, recordedBy: c.email, gps };
      message = 'Drop-off confirmed. Ride completed.';
    } else if (action === 'admin-complete') {
      requireRole(c, 'admin');
      if (r.status !== 'in_progress' || !r.startedAt)
        throw new ApiError(
          409,
          'Only an in-progress, pickup-verified ride can be closed by a coordinator.',
        );
      const reason = txt(body.reason, 10, 500);
      const verifiedWith = txt(body.verifiedWith);
      if (
        !['driver', 'guardian', 'in_person'].includes(verifiedWith) ||
        body.confirmed !== true
      )
        throw new ApiError(
          400,
          'Record who verified drop-off and confirm the student arrived.',
        );
      const recordedAt = now();
      let completedAt: string;
      try {
        completedAt = completionTime(r, body.completedAt, recordedAt);
      } catch (error) {
        throw new ApiError(400, (error as Error).message);
      }
      r.status = 'completed';
      r.completedAt = completedAt;
      r.completionMethod = 'coordinator_verified';
      r.completion = {
        recordedAt,
        recordedBy: c.email,
        verifiedWith: verifiedWith as 'driver' | 'guardian' | 'in_person',
        reason,
      };
      message = `Coordinator verified drop-off at ${r.completedAt} (${verifiedWith}): ${reason}`;
    } else if (action === 'cancel') {
      requireRole(c, 'admin', 'driver', 'family');
      if (['in_progress', 'completed', 'cancelled'].includes(r.status))
        throw new ApiError(409, 'This ride can no longer be cancelled.');
      r.cancelReason = txt(body.reason, 4, 500);
      r.status = 'cancelled';
      r.cancelledAt = now();
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
    return {
      message:
        action === 'admin-complete'
          ? 'Verified drop-off recorded. Service credit is ready for review.'
          : message,
    };
  }
  throw new ApiError(400, 'Unknown operation.');
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
  return {
    capturedAt: r.locationAt,
    accuracy: r.accuracy!,
    distanceMeters: Math.round(distance(r.lat, r.lng, a.lat, a.lng)),
  };
}
