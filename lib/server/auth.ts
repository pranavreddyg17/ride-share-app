import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { sampleData } from '../seed';
import { traceIdentity, traceId } from '../api-log';
import type { Role, Settings, Ride } from '../types';
import { ApiError, db, now, uid, type Context } from './runtime';
export async function context(req: Request): Promise<Context> {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError(401, 'Sign in to access your pilot workspace.');
  const mode = new URL(req.url).searchParams.get('mode');
  if (mode && !['practice', 'pilot'].includes(mode))
    throw new ApiError(400, 'Unknown workspace mode.');
  const demo = mode === 'practice';
  traceIdentity(req, {
    workspace: demo ? 'practice:' + user.userId : 'pilot',
    actorId: user.userId,
    actorEmail: user.email,
    actorRole: null,
  });
  if (demo) {
    const workspace = 'practice:' + user.userId;
    await initialize(workspace, true);
    // Native downloads cannot add a role header. This preference is honored only
    // inside the caller's isolated practice workspace, never in the real pilot.
    const requested =
      req.headers.get('x-ky-role') ??
      new URL(req.url).searchParams.get('viewAs');
    const role: Role =
      requested === 'driver'
        ? 'driver'
        : requested === 'family'
          ? 'family'
          : 'admin';
    traceIdentity(req, {
      workspace,
      actorId: user.userId,
      actorEmail: user.email,
      actorRole: role,
    });
    return {
      userId: user.userId,
      grantId: workspace,
      requestId: traceId(req),
      workspace,
      demo,
      writes: [],
      after: [],
      role,
      recordId: role === 'driver' ? 'd1' : role === 'family' ? 'f1' : null,
      name:
        role === 'driver'
          ? 'Aiden Mitchell'
          : role === 'family'
            ? 'Sarah Wilson'
            : 'Alex Morgan',
      email: user.email,
    };
  }
  await initialize('pilot', false);
  // Only the configured owner may initialize access, regardless of site audience.
  const owner = env.KY_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (owner && user.email.toLowerCase() === owner) {
    await db().batch([
      db()
        .prepare(
          "INSERT OR IGNORE INTO members (email,user_id,role,record_id,name,grant_id) SELECT ?,?,'admin',NULL,?,? WHERE NOT EXISTS (SELECT 1 FROM members)",
        )
        .bind(owner, user.userId, user.fullName ?? user.email, uid()),
      db()
        .prepare(
          "INSERT INTO events (workspace,id,kind,message,created_at,actor_id,actor_email,actor_role,action,request_id,entity_kind,entity_id) SELECT 'pilot',?,'access','Initial coordinator access created.',?,?,?,'admin','member.bootstrap',?,'members',? WHERE changes()=1",
        )
        .bind(uid(), now(), user.userId, owner, traceId(req), owner),
    ]);
  }
  const member = await db()
    .prepare(
      'SELECT email,user_id,role,record_id,name,grant_id FROM members WHERE email=?',
    )
    .bind(user.email.toLowerCase())
    .first<{
      email: string;
      user_id: string | null;
      role: Role;
      record_id: string | null;
      name: string;
      grant_id: string;
    }>();
  if (!member)
    throw new ApiError(
      403,
      'Your account is not on the pilot register yet. Ask the coordinator to add your sign-in email.',
    );
  if (member.user_id && member.user_id !== user.userId)
    throw new ApiError(403, 'This account needs coordinator review.');
  const bound = await db()
    .prepare(
      'UPDATE members SET user_id=? WHERE email=? AND grant_id=? AND (user_id IS NULL OR user_id=?) RETURNING user_id',
    )
    .bind(user.userId, member.email, member.grant_id, user.userId)
    .first();
  if (!bound) throw new ApiError(403, 'This account needs coordinator review.');
  if (
    !member.grant_id ||
    !['admin', 'driver', 'family'].includes(member.role) ||
    (member.role === 'admin' ? member.record_id !== null : !member.record_id)
  )
    throw new ApiError(403, 'This account needs coordinator review.');
  if (member.role !== 'admin') {
    const linked = await db()
      .prepare(
        "SELECT id FROM records WHERE workspace='pilot' AND kind=? AND id=?",
      )
      .bind(member.role === 'driver' ? 'drivers' : 'families', member.record_id)
      .first();
    if (!linked)
      throw new ApiError(403, 'This account needs coordinator review.');
  }
  traceIdentity(req, {
    workspace: 'pilot',
    actorId: user.userId,
    actorEmail: member.email,
    actorRole: member.role,
  });
  return {
    userId: user.userId,
    grantId: member.grant_id,
    requestId: traceId(req),
    workspace: 'pilot',
    writes: [],
    after: [],
    demo: false,
    role: member.role,
    recordId: member.record_id,
    name: member.name,
    email: member.email,
  };
}
async function initialize(workspace: string, demo: boolean) {
  const found = await db()
    .prepare('SELECT id FROM workspaces WHERE id=?')
    .bind(workspace)
    .first();
  if (found) return;
  const settings: Settings = {
    coordinator: demo ? 'Alex Morgan' : 'Pilot coordinator',
    contactPhone: '',
    pilotName: 'North Texas pilot',
  };
  const ops = [
    db()
      .prepare(
        'INSERT OR IGNORE INTO workspaces (id,settings,created_at) VALUES (?,?,?)',
      )
      .bind(workspace, JSON.stringify(settings), now()),
  ];
  if (demo) {
    const data = sampleData();
    for (const [kind, items] of Object.entries(data))
      for (const item of items)
        ops.push(
          db()
            .prepare(
              'INSERT OR IGNORE INTO records (workspace,kind,id,data) VALUES (?,?,?,?)',
            )
            .bind(workspace, kind, item.id, JSON.stringify(item)),
        );
    ops.push(
      db()
        .prepare(
          "INSERT OR IGNORE INTO events (workspace,id,kind,message,created_at) VALUES (?,'welcome','info','Practice workspace ready. All people and ride records here are fictional.',?)",
        )
        .bind(workspace, now()),
    );
  }
  await db().batch(ops);
}
export function requireRole(c: Context, ...roles: Role[]) {
  if (!roles.includes(c.role))
    throw new ApiError(403, 'You do not have permission to do this.');
}
export function canSeeRide(c: Context, r: Ride) {
  return (
    c.role === 'admin' ||
    (c.role === 'family' && c.recordId === r.familyId) ||
    (c.role === 'driver' && c.recordId === r.driverId)
  );
}
