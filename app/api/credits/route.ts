import {
  ApiError,
  context,
  requireRole,
  record,
  canSeeRide,
  db,
} from '@/lib/server';
import { rateLimit } from '@/lib/reliability';
import type { Ride, ServiceCredit } from '@/lib/types';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const c = await context(req);
    requireRole(c, 'admin', 'driver');
    await rateLimit(c, 'credit-history', 60);
    const id = new URL(req.url).searchParams.get('id');
    if (!id || id.length > 200)
      throw new ApiError(400, 'A ride ID is required.');
    const { data: ride } = await record<Ride>(c, 'rides', id);
    if (!canSeeRide(c, ride))
      throw new ApiError(403, 'This ride is not assigned to you.');
    const rows = await db()
      .prepare(
        "SELECT data FROM records WHERE workspace=? AND kind IN ('credit_reviews','credits') AND json_extract(data,'$.rideId')=? ORDER BY json_extract(data,'$.revision') DESC",
      )
      .bind(c.workspace, id)
      .all<{ data: string }>();
    const versions = new Map<number, ServiceCredit>();
    for (const row of rows.results) {
      const review = JSON.parse(row.data) as ServiceCredit;
      versions.set(review.revision, review);
    }
    return Response.json(
      { reviews: [...versions.values()] },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ApiError
            ? e.message
            : 'Review history could not be loaded.',
      },
      {
        status: e instanceof ApiError ? e.status : 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
