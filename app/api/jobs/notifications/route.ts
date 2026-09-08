import { env } from 'cloudflare:workers';
import { processNotifications } from '@/lib/notifications';
export const dynamic = 'force-dynamic';
export async function POST(req: Request) {
  if (
    !env.KY_JOBS_TOKEN ||
    req.headers.get('Authorization') !== `Bearer ${env.KY_JOBS_TOKEN}`
  )
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  try {
    const result = await processNotifications();
    await env.DB.prepare(
      "INSERT INTO records(workspace,kind,id,data) SELECT 'pilot','health','notifications',? WHERE EXISTS (SELECT 1 FROM workspaces WHERE id='pilot') ON CONFLICT(workspace,kind,id) DO UPDATE SET data=excluded.data",
    )
      .bind(JSON.stringify({ lastRun: new Date().toISOString(), ...result }))
      .run();
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json(
      { error: 'Notification processing failed' },
      { status: 503 },
    );
  }
}
