import { ApiError, context, state, mutate } from '@/lib/server';
export const dynamic = 'force-dynamic';
function response(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie, oai-authenticated-user-id, x-ky-role',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
export async function GET(req: Request) {
  try {
    return response(await state(await context(req)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    const origin = req.headers.get('origin');
    if (origin && origin !== new URL(req.url).origin)
      throw new ApiError(403, 'Cross-origin changes are not allowed.');
    if (!req.headers.get('content-type')?.startsWith('application/json'))
      throw new ApiError(415, 'JSON is required.');
    if (Number(req.headers.get('content-length') ?? 0) > 20000)
      throw new ApiError(413, 'Request too large.');
    const raw = await req.text();
    if (raw.length > 20000) throw new ApiError(413, 'Request too large.');
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ApiError(400, 'Invalid request.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body))
      throw new ApiError(400, 'Invalid request.');
    return response(await mutate(await context(req), body));
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  if (e instanceof ApiError) return response({ error: e.message }, e.status);
  console.error('Pilot API error', e instanceof Error ? e.message : 'Unknown');
  return response(
    { error: 'We could not save or load that record. Please try again.' },
    500,
  );
}
