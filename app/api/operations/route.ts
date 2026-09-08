import { env } from 'cloudflare:workers';
import { ApiError, context, requireRole, db, state } from '@/lib/server';
import { smsConfigured } from '@/lib/notifications';
import { rateLimit } from '@/lib/reliability';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const c = await context(req);
    requireRole(c, 'admin');
    await rateLimit(c, 'operations', 20);
    const snapshot = await state(c);
    const notificationRows = await db()
      .prepare(
        'SELECT id,ride_id,status,error,created_at,updated_at,recipient_role FROM notification_outbox WHERE workspace=? ORDER BY created_at DESC LIMIT 50',
      )
      .bind(c.workspace)
      .all();
    const job = await db()
      .prepare(
        "SELECT data FROM records WHERE workspace=? AND kind='health' AND id='notifications'",
      )
      .bind(c.workspace)
      .first<{ data: string }>();
    const lastJob = job ? JSON.parse(job.data).lastRun : null;
    const active = snapshot.rides.filter((r) =>
      ['accepted', 'arrived', 'in_progress'].includes(r.status),
    );
    const checks = [
      { name: 'Database', ok: true, detail: 'Live database query succeeded.' },
      {
        name: 'Admin initialization',
        ok: !!env.KY_BOOTSTRAP_ADMIN_EMAIL,
        detail: 'Only the configured owner can initialize pilot access.',
      },
      {
        name: 'Coordinator contact',
        ok: !!snapshot.settings.contactPhone,
        detail: 'A reachable coordinator phone is required.',
      },
      {
        name: 'Approved drivers',
        ok: snapshot.drivers.some(
          (d) =>
            d.status === 'approved' &&
            d.licenseExpiry >= new Date().toISOString().slice(0, 10) &&
            d.insuranceExpiry >= new Date().toISOString().slice(0, 10),
        ),
        detail: 'Register and review current drivers.',
      },
      {
        name: 'Family consent',
        ok: snapshot.families.some((f) => f.consent),
        detail: 'Register a family with reviewed consent.',
      },
      {
        name: 'Meeting points',
        ok: snapshot.anchors.filter((a) => a.active).length >= 2,
        detail: 'Confirm at least two pickup and drop-off locations.',
      },
      {
        name: 'SMS provider',
        ok: smsConfigured(),
        detail: smsConfigured()
          ? 'Twilio credentials are configured; carrier delivery still requires a real test.'
          : 'Twilio is not configured. No texts are sent.',
      },
      {
        name: 'Scheduled notification worker',
        ok: !!lastJob && Date.parse(lastJob) > Date.now() - 180000,
        detail: lastJob
          ? `Last scheduled check: ${lastJob}`
          : 'No scheduled worker check-in yet. Configure the protected job endpoint.',
      },
      {
        name: 'Production maps',
        ok:
          !!env.MAPBOX_ACCESS_TOKEN &&
          !!env.MAPBOX_PUBLIC_TOKEN?.startsWith('pk.'),
        detail:
          env.MAPBOX_ACCESS_TOKEN && env.MAPBOX_PUBLIC_TOKEN?.startsWith('pk.')
            ? 'Mapbox tiles and directions configured; verify provider access.'
            : 'Production maps need separate server directions and browser map tokens.',
      },
    ];
    return Response.json(
      {
        checks,
        configured: checks.every((x) => x.ok),
        lastJob,
        notifications: notificationRows.results,
        staleRides: active
          .filter(
            (r) =>
              !r.locationAt || Date.parse(r.locationAt) < Date.now() - 45000,
          )
          .map((r) => ({
            id: r.id,
            status: r.status,
            locationAt: r.locationAt,
          })),
        unresolvedHelp: snapshot.events.filter(
          (e) => e.kind === 'sos' && !e.resolved,
        ).length,
        serverTime: new Date().toISOString(),
        foregroundGpsOnly: true,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof ApiError ? e.message : 'Operations status unavailable',
      },
      {
        status: e instanceof ApiError ? e.status : 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
