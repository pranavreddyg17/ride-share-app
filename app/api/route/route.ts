import { ApiError, context, record, canSeeRide } from '@/lib/server';
import type { Anchor, Ride } from '@/lib/types';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const c = await context(req);
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
      record<Anchor>(c, 'anchors', pickupId),
      record<Anchor>(c, 'anchors', dropoffId),
    ]);
    const current = url.searchParams.get('leg') === 'current';
    if (
      current &&
      (!ride ||
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
    const endpoint = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const res = await fetch(endpoint, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'KineticYouthPilot/1.0' },
    });
    if (!res.ok)
      throw new ApiError(503, 'Road directions are temporarily unavailable.');
    const data = (await res.json()) as {
      code: string;
      routes: {
        geometry: { coordinates: number[][] };
        distance: number;
        duration: number;
      }[];
    };
    if (data.code !== 'Ok' || !data.routes?.length)
      throw new ApiError(503, 'A road route could not be found.');
    return Response.json(
      {
        coordinates: data.routes[0].geometry.coordinates,
        distance: data.routes[0].distance,
        duration: data.routes[0].duration,
      },
      {
        headers: {
          'Cache-Control': current
            ? 'private, no-store'
            : 'private, max-age=300',
        },
      },
    );
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
}
