import { withApiLog, methodNotAllowed, traceId } from '@/lib/api-log';
import { ApiError, context, state } from '@/lib/server';
import { executeMutation, rateLimit } from '@/lib/reliability';
import { processNotifications } from '@/lib/notifications';
import { waitUntil } from 'cloudflare:workers';
import { readLimitedBody } from '@/lib/request-body';
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
export const GET = withApiLog(async function GET(req: Request) {
  try {
    const c = await context(req);
    await rateLimit(c, 'read', 120);
    return response(await state(c));
  } catch (e) {
    return failure(e, req);
  }
});
export const POST = withApiLog(async function POST(req: Request) {
  try {
    const raw = await readLimitedBody(req);
    if (raw === null) throw new ApiError(413, 'Request too large.');
    const origin = req.headers.get('origin');
    if (
      req.headers.get('sec-fetch-site') === 'cross-site' ||
      (origin && origin !== new URL(req.url).origin)
    )
      throw new ApiError(403, 'Cross-origin changes are not allowed.');
    if (!req.headers.get('content-type')?.startsWith('application/json'))
      throw new ApiError(415, 'JSON is required.');
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
    return failure(e, req);
  }
});
function failure(e: unknown, req: Request) {
  if (e instanceof ApiError) return response({ error: e.message }, e.status);
  console.error(
    JSON.stringify({ type: 'state_failure', requestId: traceId(req) }),
  );
  return response(
    { error: 'We could not save or load that record. Please try again.' },
    500,
  );
}

const rejectMethod = methodNotAllowed(['GET', 'POST', 'HEAD']);
export const PUT = rejectMethod;
export const PATCH = rejectMethod;
export const DELETE = rejectMethod;
export const OPTIONS = rejectMethod;
