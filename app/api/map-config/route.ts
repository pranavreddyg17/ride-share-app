import { withApiLog, methodNotAllowed } from '@/lib/api-log';
import { env } from 'cloudflare:workers';
import { ApiError, context } from '@/lib/server';
import { mapConfiguration } from '@/lib/providers';
export const dynamic = 'force-dynamic';
export const GET = withApiLog(async function GET(req: Request) {
  try {
    const c = await context(req);
    return Response.json(mapConfiguration(c.demo, env.MAPBOX_PUBLIC_TOKEN), {
      headers: { 'Cache-Control': 'private, no-store' },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof Error ? e.message : 'Map configuration unavailable.',
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
