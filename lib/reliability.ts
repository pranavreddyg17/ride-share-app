import { ApiError, db, mutate, type Context } from './server';

export async function rateLimit(c: Context, lane: string, limit: number) {
  const minute = Math.floor(Date.now() / 60000);
  const bucket = `${c.workspace}:${c.email}:${lane}:${minute}`;
  const row = await db()
    .prepare(`INSERT INTO rate_limits(bucket,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(bucket) DO UPDATE SET count=count+1 RETURNING count`)
    .bind(bucket, (minute + 2) * 60000)
    .first<{ count: number }>();
  if ((row?.count ?? 0) > limit)
    throw new ApiError(429, 'Too many requests. Wait a minute and try again.');
}
export async function executeMutation(
  c: Context,
  body: Record<string, unknown>,
  requestId: string,
) {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(requestId))
    throw new ApiError(
      400,
      'A valid Idempotency-Key is required. Refresh the app and retry.',
    );
  const actor = `${c.userId}:${c.email}:${c.role}:${c.recordId ?? ''}:${c.grantId}`;
  const operations = [
    'driver.save',
    'driver.status',
    'family.save',
    'anchor.save',
    'availability',
    'ride.create',
    'ride.action',
    'credit.review',
    'location',
    'event.resolve',
    'settings',
    'member.add',
    'member.remove',
  ];
  const actions = [
    'assign',
    'decline',
    'accept',
    'arrive',
    'refresh-code',
    'verify',
    'complete',
    'admin-complete',
    'cancel',
    'sos',
    'rating',
  ];
  c.action = operations.includes(String(body.op))
    ? body.op === 'ride.action' && actions.includes(String(body.action))
      ? 'ride.' + body.action
      : String(body.op)
    : 'unknown';
  const digest = Array.from(
    new Uint8Array(
      await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(body)),
      ),
    ),
  )
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  async function replay() {
    const old = await db()
      .prepare(
        'SELECT digest,response,status FROM mutation_receipts WHERE workspace=? AND actor=? AND request_id=?',
      )
      .bind(c.workspace, actor, requestId)
      .first<{ digest: string; response: string; status: number }>();
    if (!old) return null;
    if (old.digest !== digest)
      throw new ApiError(
        409,
        'This request key was already used for a different operation.',
      );
    return {
      body: JSON.parse(old.response),
      status: old.status,
      replayed: true,
    };
  }
  const old = await replay();
  if (old) return old;
  await rateLimit(
    c,
    body.op === 'location' ? 'gps' : 'write',
    body.op === 'location' ? 60 : 120,
  );
  let result: unknown;
  let status = 200;
  try {
    result = await mutate(c, body);
  } catch (e) {
    const saved = await replay();
    if (saved) return saved;
    // Wrong PIN attempts are deliberate writes even when the result is rejected.
    if (
      !(e instanceof ApiError) ||
      !c.writes.length ||
      body.op !== 'ride.action' ||
      body.action !== 'verify' ||
      e.status !== 400
    )
      throw e;
    result = { error: e.message };
    status = e.status;
  }
  if (c.writes.length !== 1)
    throw new Error('Mutation must have exactly one guarded primary write');
  const receipt = db()
    .prepare(
      `INSERT INTO mutation_receipts(workspace,actor,request_id,digest,response,status,applied,created_at) VALUES (?,?,?,?,?,?,CASE WHEN ?=1 OR EXISTS (SELECT 1 FROM members WHERE email=? AND role=? AND record_id IS ? AND user_id=? AND grant_id=?) THEN changes() ELSE 0 END,?)`,
    )
    .bind(
      c.workspace,
      actor,
      requestId,
      digest,
      JSON.stringify(result),
      status,
      c.demo ? 1 : 0,
      c.email,
      c.role,
      c.recordId,
      c.userId,
      c.grantId,
      Date.now(),
    );
  try {
    // A failed CAS writes zero rows; the receipt CHECK then aborts the entire batch.
    await db().batch([c.writes[0], receipt, ...c.after]);
  } catch (e) {
    const saved = await replay();
    if (saved) return saved;
    if (
      e instanceof Error &&
      /mutation_applied|UNIQUE constraint/.test(e.message)
    )
      throw new ApiError(
        409,
        'The record changed or conflicts with another ride. Refresh and try again.',
      );
    throw e;
  }
  return { body: result, status, replayed: false };
}
