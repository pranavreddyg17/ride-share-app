import { ApiError, context, state } from '@/lib/server';
import { executeMutation, rateLimit } from '@/lib/reliability';
import { processNotifications } from '@/lib/notifications';
import { waitUntil } from 'cloudflare:workers';
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
    const c = await context(req);
    await rateLimit(c, 'read', 120);
    return response(await state(c));
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
    const c = await context(req);
    const result = await executeMutation(
      c,
      body,
      req.headers.get('Idempotency-Key') ?? '',
    );
    if (!c.demo && body.op !== 'location')
      waitUntil(
        processNotifications().catch(() =>
          console.error('Notification processing interrupted'),
        ),
      );
    return response(result.body, result.status);
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
