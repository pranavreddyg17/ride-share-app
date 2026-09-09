import { ApiError, db, uid, type Context } from '../runtime';
import { requireRole } from '../auth';
import { txt, email } from '../validation';
import { record, audit } from '../repository';

import { env } from 'cloudflare:workers';
export async function accessCommand(c: Context, body: Record<string, unknown>) {
  const op = txt(body.op, 1, 30);
  if (op === 'member.remove') {
    requireRole(c, 'admin');
    if (c.demo)
      throw new ApiError(
        400,
        'Manage account access in the real pilot workspace.',
      );
    const e = email(body.email);
    c.entityKind = 'members';
    c.entityId = e;
    if (e === c.email)
      throw new ApiError(
        409,
        'You cannot remove your own coordinator account.',
      );
    const reason = txt(body.reason, 4, 500);
    if (e === env.KY_BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase())
      throw new ApiError(
        409,
        'The initial owner account cannot be revoked here.',
      );
    const target = await db()
      .prepare('SELECT grant_id FROM members WHERE email=?')
      .bind(e)
      .first<{ grant_id: string }>();
    if (!target) throw new ApiError(404, 'This account no longer has access.');
    c.writes.push(
      db()
        .prepare('DELETE FROM members WHERE email=? AND grant_id=?')
        .bind(e, target.grant_id),
    );
    await audit(
      c,
      `${c.name} revoked pilot access for ${e}: ${reason}`,
      'access',
    );
    return {
      message:
        'Pilot access revoked. Registered driver and family records are retained.',
    };
  }
  if (op === 'member.add') {
    requireRole(c, 'admin');
    if (c.demo)
      throw new ApiError(
        400,
        'Account access is managed in the real pilot workspace.',
      );
    const e = email(body.email);
    c.entityKind = 'members';
    c.entityId = e;
    const role = txt(body.role);
    if (!['admin', 'driver', 'family'].includes(role))
      throw new ApiError(400, 'Choose a valid role.');
    let recordId: string | null = null;
    if (role !== 'admin') {
      recordId = txt(body.recordId);
      await record(c, role === 'driver' ? 'drivers' : 'families', recordId);
    }
    if (
      role === 'driver' &&
      (await db()
        .prepare(
          "SELECT email FROM members WHERE role='driver' AND record_id=?",
        )
        .bind(recordId)
        .first())
    )
      throw new ApiError(
        409,
        'This driver already has a sign-in account. Revoke the old account before linking a replacement.',
      );
    const exists = await db()
      .prepare('SELECT email FROM members WHERE email=?')
      .bind(e)
      .first();
    if (exists) throw new ApiError(409, 'This email already has pilot access.');
    c.writes.push(
      db()
        .prepare(
          "INSERT OR IGNORE INTO members (email,role,record_id,name,grant_id) SELECT ?,?,?,?,? WHERE ?<>'driver' OR NOT EXISTS (SELECT 1 FROM members WHERE role='driver' AND record_id=?)",
        )
        .bind(e, role, recordId, txt(body.name, 2, 100), uid(), role, recordId),
    );
    await audit(c, `${c.name} granted ${role} access to ${e}.`, 'access');
    return {
      message:
        'Account added to the access register. Share the site link with this person.',
    };
  }
  throw new ApiError(400, 'Unknown operation.');
}
