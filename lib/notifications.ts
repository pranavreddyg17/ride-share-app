import { env } from 'cloudflare:workers';
import { sendSms, readSms } from './sms-provider';
export const smsConfigured = () =>
  !!(
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    env.TWILIO_MESSAGING_SERVICE_SID &&
    env.KY_PUBLIC_ORIGIN
  );
export function notificationStatements(
  workspace: string,
  rideId: string,
  kind: string,
): D1PreparedStatement[] {
  const origin = env.KY_PUBLIC_ORIGIN ?? '';
  const body = `Kinetic Youth: ride ${rideId} ${kind === 'sos' ? 'needs coordinator help' : 'has an update'}. Open your secure ride view: ${origin}/rides/${rideId}?mode=pilot`;
  const at = new Date().toISOString();
  const result = ['family', 'driver'].map((role) =>
    env.DB.prepare(`INSERT INTO notification_outbox(id,workspace,ride_id,recipient_role,recipient_id,phone,body,status,created_at,updated_at)
    SELECT ?,?,r.id,?,p.id,json_extract(p.data,'$.phone'),?,CASE WHEN json_extract(p.data,'$.smsConsent')=1 THEN 'pending' ELSE 'opted_out' END,?,?
    FROM records r JOIN records p ON p.workspace=r.workspace AND p.kind=? AND p.id=json_extract(r.data,?)
    WHERE r.workspace=? AND r.kind='rides' AND r.id=?`).bind(
      crypto.randomUUID(),
      workspace,
      role,
      body,
      at,
      at,
      role === 'family' ? 'families' : 'drivers',
      role === 'family' ? '$.familyId' : '$.driverId',
      workspace,
      rideId,
    ),
  );
  if (kind === 'sos' || kind === 'ride')
    result.push(
      env.DB.prepare(`INSERT INTO notification_outbox(id,workspace,ride_id,recipient_role,recipient_id,phone,body,status,created_at,updated_at)
    SELECT ?,?,?,'admin','coordinator',json_extract(settings,'$.contactPhone'),?,CASE WHEN json_extract(settings,'$.smsConsent')=1 THEN 'pending' ELSE 'opted_out' END,?,? FROM workspaces WHERE id=? AND json_extract(settings,'$.contactPhone')<>''`).bind(
        crypto.randomUUID(),
        workspace,
        rideId,
        body,
        at,
        at,
        workspace,
      ),
    );
  return result;
}
type Outbox = {
  id: string;
  phone: string;
  body: string;
  status: string;
  provider_id: string | null;
  recipient_role: string;
  recipient_id: string;
  workspace: string;
  created_at: string;
  updated_at: string;
};
export async function processNotifications() {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM rate_limits WHERE expires_at<?').bind(
      Date.now(),
    ),
    env.DB.prepare('DELETE FROM mutation_receipts WHERE created_at<?').bind(
      Date.now() - 86400000,
    ),
    env.DB.prepare('DELETE FROM notification_outbox WHERE created_at<?').bind(
      new Date(Date.now() - 30 * 86400000).toISOString(),
    ),
    env.DB.prepare(
      "DELETE FROM ride_locations WHERE received_at<? AND EXISTS (SELECT 1 FROM records r WHERE r.workspace=ride_locations.workspace AND r.id=ride_locations.ride_id AND r.kind='rides' AND json_extract(r.data,'$.status') IN ('completed','cancelled'))",
    ).bind(new Date(Date.now() - 86400000).toISOString()),
  ]);
  if (!smsConfigured()) return { configured: false, processed: 0 };
  // A crashed sender is ambiguous: never blindly resend a potentially delivered message.
  await env.DB.prepare(
    "UPDATE notification_outbox SET status='unknown',error='Delivery attempt interrupted; check the provider before retrying.' WHERE status='sending' AND updated_at<?",
  )
    .bind(new Date(Date.now() - 120000).toISOString())
    .run();
  const credentials = {
    account: env.TWILIO_ACCOUNT_SID!,
    token: env.TWILIO_AUTH_TOKEN!,
    service: env.TWILIO_MESSAGING_SERVICE_SID!,
  };
  // Separate budgets prevent old delivery receipts from starving new alerts.
  const [pending, reconcile] = await Promise.all([
    env.DB.prepare(
      "SELECT * FROM notification_outbox WHERE status='pending' AND attempts<3 ORDER BY created_at LIMIT 8",
    ).all<Outbox>(),
    env.DB.prepare(
      "SELECT * FROM notification_outbox WHERE status IN ('accepted','queued','sent') AND updated_at<? ORDER BY updated_at LIMIT 4",
    )
      .bind(new Date(Date.now() - 30000).toISOString())
      .all<Outbox>(),
  ]);
  let processed = 0;
  await Promise.all(
    [...pending.results, ...reconcile.results].map(async (row) => {
      const at = new Date().toISOString();
      if (row.status !== 'pending' && row.provider_id) {
        const lease = await env.DB.prepare(
          'UPDATE notification_outbox SET updated_at=? WHERE id=? AND updated_at=? AND status=?',
        )
          .bind(at, row.id, row.updated_at, row.status)
          .run();
        if (!lease.meta.changes) return;
        try {
          const v = await readSms(credentials, row.provider_id);
          await env.DB.prepare(
            'UPDATE notification_outbox SET status=?,error=?,updated_at=? WHERE id=? AND updated_at=?',
          )
            .bind(v.status, v.error, new Date().toISOString(), row.id, at)
            .run();
        } catch {
          /* Keep the last known state for the next reconciliation. */
        }
        return;
      }
      if (Date.parse(row.created_at) < Date.now() - 15 * 60000) {
        await env.DB.prepare(
          "UPDATE notification_outbox SET status='expired',updated_at=? WHERE id=? AND status='pending'",
        )
          .bind(at, row.id)
          .run();
        return;
      }
      const target =
        row.recipient_role === 'admin'
          ? await env.DB.prepare(
              'SELECT settings AS data FROM workspaces WHERE id=?',
            )
              .bind(row.workspace)
              .first<{ data: string }>()
          : await env.DB.prepare(
              'SELECT data FROM records WHERE workspace=? AND kind=? AND id=?',
            )
              .bind(
                row.workspace,
                row.recipient_role === 'family' ? 'families' : 'drivers',
                row.recipient_id,
              )
              .first<{ data: string }>();
      const person = target ? JSON.parse(target.data) : null;
      if (
        !person?.smsConsent ||
        (person.phone ?? person.contactPhone) !== row.phone
      ) {
        await env.DB.prepare(
          "UPDATE notification_outbox SET status='opted_out',updated_at=? WHERE id=? AND status='pending'",
        )
          .bind(at, row.id)
          .run();
        return;
      }
      const claim = await env.DB.prepare(
        "UPDATE notification_outbox SET status='sending',attempts=attempts+1,updated_at=? WHERE id=? AND status='pending'",
      )
        .bind(at, row.id)
        .run();
      if (!claim.meta.changes) return;
      const v = await sendSms(credentials, row.phone, row.body);
      await env.DB.prepare(
        'UPDATE notification_outbox SET status=?,provider_id=?,error=?,updated_at=? WHERE id=?',
      )
        .bind(v.status, v.providerId, v.error, new Date().toISOString(), row.id)
        .run();
      processed++;
    }),
  );
  return { configured: true, processed };
}
