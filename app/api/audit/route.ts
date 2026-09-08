import { ApiError, context, db, requireRole } from '@/lib/server';
import { rateLimit } from '@/lib/reliability';
import { withApiLog, methodNotAllowed } from '@/lib/api-log';
export const dynamic = 'force-dynamic';
export const GET = withApiLog(async function GET(req: Request) {
  try {
    const c = await context(req);
    requireRole(c, 'admin');
    await rateLimit(c, 'audit', 30);
    const params = new URL(req.url).searchParams;
    const result = params.get('result') ?? 'all',
      actor = params.get('actor')?.trim().toLowerCase() ?? '';
    if (!['all', 'errors'].includes(result) || actor.length > 200)
      throw new ApiError(400, 'Invalid audit filter.');
    const where = [
      c.demo ? 'workspace=?' : '(workspace=? OR workspace IS NULL)',
    ];
    const args: unknown[] = [c.workspace];
    if (result === 'errors') where.push('status>=400');
    if (actor) {
      where.push('lower(actor_email)=?');
      args.push(actor);
    }
    const cursor = params.get('cursor');
    if (cursor) {
      try {
        const value: unknown = JSON.parse(atob(cursor));
        if (
          !Array.isArray(value) ||
          value.length !== 2 ||
          typeof value[0] !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T/.test(value[0]) ||
          !Number.isFinite(Date.parse(value[0])) ||
          typeof value[1] !== 'string' ||
          !/^[0-9a-f-]{36}$/.test(value[1])
        )
          throw new Error();
        where.push('(created_at<? OR (created_at=? AND id<?))');
        args.push(value[0], value[0], value[1]);
      } catch {
        throw new ApiError(400, 'Invalid audit cursor.');
      }
    }
    const rows = await db()
      .prepare(
        'SELECT id,created_at,actor_email,actor_role,method,path,status,duration_ms FROM request_logs WHERE ' +
          where.join(' AND ') +
          ' ORDER BY created_at DESC,id DESC LIMIT 101',
      )
      .bind(...args)
      .all<{
        id: string;
        created_at: string;
        actor_email: string | null;
        actor_role: string | null;
        method: string;
        path: string;
        status: number;
        duration_ms: number;
      }>();
    const entries = rows.results.slice(0, 100),
      last = entries.at(-1);
    return Response.json({
      entries,
      nextCursor:
        rows.results.length > 100 && last
          ? btoa(JSON.stringify([last.created_at, last.id]))
          : null,
      retentionDays: 7,
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ApiError ? e.message : 'Audit records are unavailable.',
      },
      { status: e instanceof ApiError ? e.status : 503 },
    );
  }
});

const rejectMethod = methodNotAllowed(['GET', 'HEAD']);
export const POST = rejectMethod;
export const PUT = rejectMethod;
export const PATCH = rejectMethod;
export const DELETE = rejectMethod;
export const OPTIONS = rejectMethod;
