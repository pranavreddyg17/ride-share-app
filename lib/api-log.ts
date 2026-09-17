import { env, waitUntil } from 'cloudflare:workers';
import { getAuthenticatedUser } from '@/app/identity';

type Identity = {
  workspace: string | null;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
};
const traces = new WeakMap<Request, { id: string; identity: Identity }>();
export function traceIdentity(req: Request, identity: Identity) {
  const trace = traces.get(req);
  if (trace) trace.identity = identity;
}
export const traceId = (req: Request) =>
  traces.get(req)?.id ?? crypto.randomUUID();

// Request metadata only: never log bodies, query strings, OTPs, credentials or GPS.
export function withApiLog(handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const id = crypto.randomUUID(),
      started = Date.now();
    const trace = {
      id,
      identity: {
        workspace: null,
        actorId: null,
        actorEmail: null,
        actorRole: null,
      } as Identity,
    };
    traces.set(req, trace);
    let response: Response;
    try {
      const user = await getAuthenticatedUser();
      const mode = new URL(req.url).searchParams.get('mode');
      if (user)
        trace.identity = {
          workspace:
            mode === 'practice'
              ? 'practice:' + user.userId
              : !mode || mode === 'pilot'
                ? 'pilot'
                : null,
          actorId: user.userId,
          actorEmail: user.email,
          actorRole: null,
        };
      response = await handler(req);
    } catch {
      response = Response.json(
        { error: 'The request could not be completed.', requestId: id },
        { status: 500, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const entry = {
      requestId: id,
      method: req.method,
      path: new URL(req.url).pathname,
      status: response.status,
      durationMs: Date.now() - started,
      ...trace.identity,
      createdAt: new Date().toISOString(),
    };
    // Console output supports platform log collection even if D1 is unavailable.
    console.info(
      JSON.stringify({ type: 'api_request', ...entry, actorEmail: undefined }),
    );
    waitUntil(
      (async () => {
        try {
          await env.DB.prepare(
            'INSERT INTO request_logs (id,workspace,created_at,actor_id,actor_email,actor_role,method,path,status,duration_ms) VALUES (?,?,?,?,?,?,?,?,?,?)',
          )
            .bind(
              id,
              entry.workspace,
              entry.createdAt,
              entry.actorId,
              entry.actorEmail,
              entry.actorRole,
              entry.method,
              entry.path,
              entry.status,
              entry.durationMs,
            )
            .run();
        } catch {
          console.error(
            JSON.stringify({ type: 'request_log_write_failed', requestId: id }),
          );
        }
      })(),
    );
    traces.delete(req);
    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', id);
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Cache-Control', 'private, no-store');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}

export const methodNotAllowed = (allowed: string[]) =>
  withApiLog(async () =>
    Response.json(
      { error: 'Method not allowed.' },
      { status: 405, headers: { Allow: allowed.join(', ') } },
    ),
  );
