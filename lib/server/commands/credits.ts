import { ApiError, db, now, type Context } from '../runtime';
import { requireRole } from '../auth';
import { txt, number } from '../validation';
import { record, save, audit } from '../repository';
import { type Ride, type ServiceCredit } from '../../types';
export async function creditsCommand(
  c: Context,
  body: Record<string, unknown>,
) {
  const op = txt(body.op, 1, 30);
  if (op === 'credit.review') {
    requireRole(c, 'admin');
    const { data: ride, version: rideVersion } = await record<Ride>(
      c,
      'rides',
      txt(body.id),
    );
    if (ride.status !== 'completed' || !ride.driverId)
      throw new ApiError(
        409,
        'Service credit requires a completed ride with a driver.',
      );
    const status = txt(body.status);
    if (!['approved', 'excluded'].includes(status))
      throw new ApiError(400, 'Choose approve or exclude.');
    const minutes = number(body.minutes, 0, 1440);
    if (!Number.isInteger(minutes) || (status === 'excluded' && minutes !== 0))
      throw new ApiError(
        400,
        'Use whole minutes. Excluded rides must have zero credited minutes.',
      );
    const expected = number(body.revision, 0, 1000000);
    const existing = await db()
      .prepare(
        "SELECT data,version FROM records WHERE workspace=? AND kind='credits' AND id=?",
      )
      .bind(c.workspace, ride.id)
      .first<{ data: string; version: number }>();
    const previous = existing
      ? (JSON.parse(existing.data) as ServiceCredit)
      : null;
    if (expected !== (previous?.revision ?? 0))
      throw new ApiError(
        409,
        'This service credit was reviewed by another coordinator. Refresh before saving.',
      );
    const review: ServiceCredit = {
      id: ride.id,
      rideId: ride.id,
      driverId: ride.driverId,
      minutes,
      status: status as ServiceCredit['status'],
      reason: txt(body.reason, 4, 500),
      reviewedBy: c.email,
      reviewedAt: now(),
      revision: (previous?.revision ?? 0) + 1,
    };
    await save(
      c,
      'credits',
      ride.id,
      review,
      existing?.version ?? null,
      "EXISTS (SELECT 1 FROM records WHERE workspace=? AND kind='rides' AND id=? AND version=? AND json_extract(data,'$.status')='completed' AND json_extract(data,'$.driverId')=?)",
      [c.workspace, ride.id, rideVersion, ride.driverId],
    );
    // Append the complete decision in the same transaction as the current credit.
    c.after.push(
      db()
        .prepare(
          'INSERT INTO records (workspace,kind,id,data) VALUES (?,?,?,?)',
        )
        .bind(
          c.workspace,
          'credit_reviews',
          `${ride.id}:${review.revision}`,
          JSON.stringify(review),
        ),
    );
    await audit(
      c,
      `${c.name} ${previous ? 'revised' : 'reviewed'} service credit: ${previous?.minutes ?? 0} → ${minutes} minutes (${status}). ${review.reason}`,
      'service_credit',
      ride.id,
    );
    return { message: 'Service credit recorded.' };
  }
  throw new ApiError(400, 'Unknown operation.');
}
