# Identity, permissions and audit records

This is the local pilot implementation. No hosting settings or deployed resources were changed by this release.

## Identity and account lifecycle

The Sites authentication gateway supplies the verified user ID and email. The app does not accept phone numbers, profile emails, role headers or UI selections as proof of identity. A directly accessible Worker accepting these headers is unsafe: production must retain the trusted gateway, and the local test Worker must remain on loopback. Hosted header sanitization still requires deployment verification.

The configured bootstrap owner can initialize access only when the membership register is empty. That initial grant is audited atomically. All subsequent grants require an existing admin. A successful first sign-in binds the approved email to its verified user ID. Another user ID using that email is denied.

Each grant has a unique `grant_id`. Revocation deletes that grant while preserving participant, ride and service records. Re-adding an email creates a new grant, allowing an explicitly reviewed identity replacement. Old grant receipts cannot replay under the new grant. The transaction checks the caller's user ID, email, role, linked record and grant before accepting a mutation. If authorization changes during the commit, the primary write, receipt, event and outbox roll back together.

One driver record has one linked account. A family record can have multiple approved guardians. Contact-email edits do not change sign-in access. Admins cannot revoke themselves or the configured bootstrap owner through the app. No self-registration or self-promotion exists in the real pilot. Invalid roles or missing linked participant records fail closed.

Practice data belongs to `practice:<verified user ID>`. Role switching operates only in that workspace and never grants pilot access. Practice logs and records are scoped to that same user.

## API permissions

| Endpoint                  | Methods         | Access and scope                                                               |
| ------------------------- | --------------- | ------------------------------------------------------------------------------ |
| `/api/state`              | GET, HEAD, POST | Approved members; records and mutations scoped to role and linked participant  |
| `/api/credits`            | GET, HEAD       | Admin or the assigned driver; full decision history for one ride               |
| `/api/reports`            | GET, HEAD       | Admin or own-driver workbook; family denied                                    |
| `/api/export`             | GET, HEAD       | Admin only; operational records, business events, memberships and settings     |
| `/api/operations`         | GET, HEAD       | Admin only; provider/job health                                                |
| `/api/audit`              | GET, HEAD       | Admin only; paginated request metadata, actor and error filters                |
| `/api/map-config`         | GET, HEAD       | Approved members; only public map configuration                                |
| `/api/route`              | GET, HEAD       | Approved members; active meeting-point preview or a visible ride's saved route |
| `/api/jobs/notifications` | POST            | Configured job bearer secret; service identity                                 |

Unsupported methods return 405. Pilot role overrides are ignored. State POST rejects cross-origin changes, non-JSON/oversized input, malformed bodies and missing idempotency keys. Its streaming body reader caps actual bytes at 20,000, including requests without Content-Length, and cancels excess input. Reads, writes, GPS, reports and audit requests have separate rate limits. Register forms use optimistic versions; ride and credit rules have transactional conflict guards.

## Business audit

Successful record mutations append events in the same transaction as the primary write. New events include UTC time, verified actor ID/email, actual role, action, record type/ID and a request ID. Failed event writes fail the mutation. Credit amendments additionally preserve complete immutable decision snapshots with reviewer, minutes, status and reason. Event resolution retains the original event and appends the resolving action.

Admin Safety & activity shows recent events plus all unresolved help. The operational JSON export contains all business events; Excel contains the events for its filtered rides. Old events without actor metadata are labeled as legacy, rather than assigning a guessed actor. Families and drivers do not receive the new internal actor or request metadata in their activity feed. GPS updates have request metadata but do not append a business event or route history for every coordinate.

These records are application-audited, not tamper-proof against an operator with database credentials. Database administrators can modify stored data. Independent archival and controlled operational access are deployment responsibilities.

## Request logging and diagnosis

Every API handler, including rejected methods and denied requests, returns `X-Request-Id`. The same ID accompanies a structured platform log and a best-effort D1 request record. Admin → Request logs filters exact account email and failed responses, with cursor pagination of 100 rows. Records include UTC time, actor, HTTP method, path, status and elapsed milliseconds. The UI displays Central Time.

Request logs exclude query strings, bodies, PINs, bearer tokens, credentials and GPS payloads. They are metadata, not session recordings. Error logs avoid raw provider or database messages that could contain user input. A D1 logging failure emits `request_log_write_failed` with its request ID; it does not prevent a successful read or already-committed mutation. Business audit failure remains fatal to its mutation.

The notification/maintenance processor removes request metadata older than seven days. It must run regularly even without configured SMS. Business events and service-credit history have no automatic expiry. Define retention for participant records, exports and provider records separately.

Before operational use, configure platform log collection and alerts for repeated 5xx responses, `state_failure`, `request_log_write_failed`, stale job health and notification failures. Verify retention/access with the hosting owner and test an alert to the responsible coordinator. There is no external monitoring or alerting account connected by this local release. Request IDs make failures traceable; they do not replace operational monitoring, backups or a recovery rehearsal.
