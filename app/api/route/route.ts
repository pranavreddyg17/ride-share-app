import { withApiLog, methodNotAllowed } from '@/lib/api-log';
import { ApiError, context, record, canSeeRide } from '@/lib/server';
import type { Anchor, Ride } from '@/lib/types';
import { env } from 'cloudflare:workers';
import { directions } from '@/lib/providers';
import { rateLimit } from '@/lib/reliability';
export const dynamic = 'force-dynamic';
export const GET = withApiLog(async function GET(req: Request) {
  try {
    const c = await context(req);
    await rateLimit(c, 'route', 30);
    const url = new URL(req.url),
      id = url.searchParams.get('id');
    let pickupId = url.searchParams.get('pickup');
    let dropoffId = url.searchParams.get('dropoff');
    let ride: Ride | null = null;
    if (id) {
      const result = await record<Ride>(c, 'rides', id);
      ride = result.data;
      if (!canSeeRide(c, ride))
        throw new ApiError(403, 'You cannot access this route.');
      pickupId = ride.pickupId;
      dropoffId = ride.dropoffId;
    }
    if (!pickupId || !dropoffId || pickupId === dropoffId)
      throw new ApiError(
        400,
        'Choose different pickup and destination locations.',
      );
    const [{ data: pickup }, { data: dropoff }] = await Promise.all([
      ride?.pickupSnapshot
        ? { data: ride.pickupSnapshot }
        : record<Anchor>(c, 'anchors', pickupId),
      ride?.dropoffSnapshot
        ? { data: ride.dropoffSnapshot }
        : record<Anchor>(c, 'anchors', dropoffId),
    ]);
    const current = url.searchParams.get('leg') === 'current';
    if (
      url.searchParams.has('leg') &&
      !['current', 'full'].includes(url.searchParams.get('leg')!)
    )
      throw new ApiError(400, 'Unknown route leg.');
    if (!ride && (!pickup.active || !dropoff.active))
      throw new ApiError(409, 'Choose active pickup locations.');
    if (
      current &&
      (!ride ||
        !['accepted', 'arrived', 'in_progress'].includes(ride.status) ||
        ride.lat === null ||
        ride.lng === null ||
        !ride.locationAt ||
        Date.parse(ride.locationAt) < Date.now() - 45000)
    )
      throw new ApiError(
        409,
        'A current driver position is needed for this estimate.',
      );
    const a = current ? { lat: ride!.lat!, lng: ride!.lng! } : pickup;
    const b = current && ride!.status !== 'in_progress' ? pickup : dropoff;
    let route;
    try {
      route = await directions(a, b, env.MAPBOX_ACCESS_TOKEN, c.demo);
    } catch (e) {
      throw new ApiError(
        503,
        e instanceof Error ? e.message : 'Road directions unavailable.',
      );
    }
    return Response.json(route, {
      headers: {
        'Cache-Control': current ? 'private, no-store' : 'private, max-age=300',
      },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ApiError
            ? e.message
            : 'Road directions are temporarily unavailable.',
      },
      {
        status: e instanceof ApiError ? e.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
});

const rejectMethod = methodNotAllowed(['GET', 'HEAD']);
export const POST = rejectMethod;
export const PUT = rejectMethod;
export const PATCH = rejectMethod;
export const DELETE = rejectMethod;
export const OPTIONS = rejectMethod;
