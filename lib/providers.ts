export type Coordinates = { lat: number; lng: number };
export function mapConfiguration(demo: boolean, publicToken?: string) {
  const osm =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  if (demo)
    return {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: osm,
    };
  if (!publicToken?.startsWith('pk.'))
    throw new Error(
      'Production maps are not configured. Ask the coordinator to finish map setup.',
    );
  return {
    url: `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(publicToken)}`,
    attribution: `&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> | ${osm} | <a href="https://apps.mapbox.com/feedback/">Improve this map</a>`,
  };
}
export async function directions(
  a: Coordinates,
  b: Coordinates,
  token: string | undefined,
  demo: boolean,
  send: typeof fetch = fetch,
) {
  if (!demo && !token)
    throw new Error(
      'Production directions are not configured. Ask the coordinator to finish map setup.',
    );
  const coordinates = `${a.lng},${a.lat};${b.lng},${b.lat}`;
  const endpoint =
    token && !demo
      ? `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordinates}?overview=full&geometries=geojson&access_token=${encodeURIComponent(token)}`
      : `https://router.project-osrm.org/route/v1/driving/${coordinates}?overview=full&geometries=geojson`;
  const response = await send(endpoint, { signal: AbortSignal.timeout(8000) });
  if (!response.ok)
    throw new Error('Road directions are temporarily unavailable.');
  const data = (await response.json()) as {
    code: string;
    routes?: {
      geometry?: { coordinates: number[][] };
      duration: number;
      distance: number;
    }[];
  };
  const route = data.routes?.[0];
  if (
    data.code !== 'Ok' ||
    !route ||
    !route.geometry?.coordinates?.length ||
    !Number.isFinite(route.duration) ||
    !Number.isFinite(route.distance) ||
    route.duration < 0 ||
    route.distance < 0 ||
    !route.geometry.coordinates.every(
      (p) =>
        p.length >= 2 &&
        Number.isFinite(p[0]) &&
        Number.isFinite(p[1]) &&
        Math.abs(p[0]) <= 180 &&
        Math.abs(p[1]) <= 90,
    )
  )
    throw new Error('A usable road route could not be found.');
  return {
    coordinates: route.geometry.coordinates,
    duration: route.duration,
    distance: route.distance,
    provider: token && !demo ? 'mapbox' : 'osrm',
    trafficAware: !!token && !demo,
  };
}
