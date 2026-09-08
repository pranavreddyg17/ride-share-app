import { ApiError, context, requireRole, state, db } from '@/lib/server';
import { rateLimit } from '@/lib/reliability';
import { filterRides, type ReportFilters } from '@/lib/service-hours';
import { reportWorkbook } from '@/lib/report-workbook';
import type { ServiceCredit } from '@/lib/types';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const c = await context(req);
    requireRole(c, 'admin', 'driver');
    await rateLimit(c, 'report', 3);
    const params = new URL(req.url).searchParams;
    const filters: ReportFilters = Object.fromEntries(
      ['from', 'to', 'driver', 'status', 'review', 'query'].map((key) => [
        key,
        params.get(key) ?? '',
      ]),
    );
    for (const key of ['from', 'to'] as const)
      if (
        filters[key] &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(filters[key]!) ||
          !Number.isFinite(Date.parse(filters[key]!)) ||
          new Date(filters[key]!).toISOString().slice(0, 10) !== filters[key])
      )
        throw new ApiError(400, 'Use a valid report date.');
    if (filters.from && filters.to && filters.from > filters.to)
      throw new ApiError(400, 'The start date must be before the end date.');
    if (
      c.role === 'driver' &&
      filters.driver &&
      filters.driver !== 'all' &&
      filters.driver !== c.recordId
    )
      throw new ApiError(403, 'You can export only your own service records.');
    const snapshot = await state(c),
      rides = filterRides(snapshot, filters);
    if (rides.length > 1000)
      throw new ApiError(
        413,
        'Limit the date range to 1,000 rides per workbook.',
      );
    if (c.role === 'admin') {
      const rows = await db()
        .prepare(
          'SELECT * FROM events WHERE workspace=? AND ride_id IS NOT NULL ORDER BY created_at',
        )
        .bind(c.workspace)
        .all<{
          id: string;
          ride_id: string;
          kind: string;
          message: string;
          created_at: string;
          resolved: number;
          note: string;
        }>();
      const ids = new Set(rides.map((r) => r.id));
      snapshot.events = rows.results
        .filter((e) => ids.has(e.ride_id))
        .map((e) => ({
          id: e.id,
          rideId: e.ride_id,
          kind: e.kind,
          message: e.message,
          createdAt: e.created_at,
          resolved: !!e.resolved,
          note: e.note,
        }));
    }
    const history = await db()
      .prepare(
        "SELECT data FROM records WHERE workspace=? AND kind='credit_reviews' ORDER BY json_extract(data,'$.reviewedAt'),json_extract(data,'$.revision')",
      )
      .bind(c.workspace)
      .all<{ data: string }>();
    const rideIds = new Set(rides.map((r) => r.id));
    const reviews = history.results
      .map((r) => JSON.parse(r.data) as ServiceCredit)
      .filter((c) => rideIds.has(c.rideId));
    // Preserve current decisions imported from versions that had only an event audit.
    for (const current of snapshot.credits)
      if (
        rideIds.has(current.rideId) &&
        !reviews.some(
          (r) => r.rideId === current.rideId && r.revision === current.revision,
        )
      )
        reviews.push(current);
    const bytes = await reportWorkbook(
      snapshot,
      rides,
      `${filters.from || 'All dates'} – ${filters.to || 'present'}`,
      reviews,
    );
    return new Response(bytes.buffer as ArrayBuffer, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition':
          'attachment; filename="kinetic-youth-records.xlsx"',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ApiError
            ? e.message
            : 'The workbook could not be generated. Try a smaller date range.',
      },
      {
        status: e instanceof ApiError ? e.status : 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
