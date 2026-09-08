import { withApiLog, methodNotAllowed } from '@/lib/api-log';
import { ApiError, context, requireRole, db } from '@/lib/server';
import { rateLimit } from '@/lib/reliability';
export const dynamic = 'force-dynamic';
export const GET = withApiLog(async function GET(req: Request) {
  try {
    const c = await context(req);
    requireRole(c, 'admin');
    await rateLimit(c, 'export', 3);
    const rows = await db().batch([
      db()
        .prepare('SELECT kind,id,data FROM records WHERE workspace=?')
        .bind(c.workspace),
      db()
        .prepare('SELECT * FROM events WHERE workspace=? ORDER BY created_at')
        .bind(c.workspace),
      db()
        .prepare('SELECT email,role,record_id,name FROM members WHERE ?=0')
        .bind(c.demo ? 1 : 0),
      db()
        .prepare('SELECT settings FROM workspaces WHERE id=?')
        .bind(c.workspace),
    ]);
    const recordRows = rows[0].results as {
      kind: string;
      id: string;
      data: string;
    }[];
    const records = recordRows.map((row) => {
      const data = JSON.parse(row.data) as Record<string, unknown>;
      if (row.kind === 'rides') {
        data.otp = null;
        data.otpExpiresAt = null;
      }
      return { kind: row.kind, id: row.id, data };
    });
    return Response.json(
      {
        format: 'kinetic-youth-export-v1',
        exportedAt: new Date().toISOString(),
        workspace: c.workspace,
        records,
        events: rows[1].results,
        members: rows[2].results,
        settings: rows[3].results,
      },
      {
        headers: {
          'Cache-Control': 'private, no-store',
          'Content-Disposition':
            'attachment; filename="kinetic-youth-records.json"',
        },
      },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof ApiError ? e.message : 'Export unavailable' },
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
