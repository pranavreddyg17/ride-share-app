# Trial launch runbook

This release implements a supervised, approved-participant web pilot. Local tests alone do not establish readiness for transporting students. Finish these hosted and real-device checks before operational rides.

## 1. Hosting and release

The latest admin/service-record redesign is local only, per the user's instruction not to publish. See [SERVICE_RECORDS.md](SERVICE_RECORDS.md) for credit policy, admin review and Excel export details. Publishing must remain a separate, explicitly requested step.

Use the account/workspace that owns the existing Kinetic Youth Site. On September 8, 2026 the current Sites connection returned “project not found” and an empty site list; the hardened release could not be published through that connection. Preserve the existing project and database rather than creating a replacement.

When access is restored and publishing is separately requested, configure runtime values below, publish the validated build with all three generated D1 migrations, and confirm success. Migration `0002_clever_golden_guardian.sql` backfills a unique grant identity for existing memberships and adds audit metadata. Verify `/api/state?mode=pilot` as the owner and then as an unregistered account; the latter must be denied. The previous live version is not evidence that the local changes are deployed.

## 2. Runtime configuration

Use hosting environment/secret controls and redeploy after changes. Never put real credentials in source, Git, screenshots or chat.

| Variable                       | Purpose                                                                      | Handling                                                       |
| ------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `KY_BOOTSTRAP_ADMIN_EMAIL`     | Initial owner's verified email; expected owner is `pranavreddyg17@gmail.com` | Confirm against owning account                                 |
| `KY_PUBLIC_ORIGIN`             | `https://kinetic-youth-pilot.pranavreddyg17.chatgpt.site`                    | Non-secret; no trailing slash                                  |
| `MAPBOX_ACCESS_TOKEN`          | Server-side Directions API access                                            | Store as secret; separate from browser token                   |
| `MAPBOX_PUBLIC_TOKEN`          | Public `pk.` token for map tiles                                             | Restrict to the actual Site origin; browser-readable by design |
| `TWILIO_ACCOUNT_SID`           | Twilio account identifier                                                    | Runtime config                                                 |
| `TWILIO_AUTH_TOKEN`            | Twilio REST authentication                                                   | Secret                                                         |
| `TWILIO_MESSAGING_SERVICE_SID` | Messaging Service with approved sender                                       | Runtime config                                                 |
| `KY_JOBS_TOKEN`                | Random high-entropy job authentication secret                                | Shared only with the scheduler                                 |

Mapbox: create separate server and browser tokens. Restrict the browser token to the deployed Site and explicitly required test origins, with required read scopes. Verify Streets v12 raster tiles and `driving-traffic` directions on the actual Site. The live app does not fall back to public OSRM. See [Mapbox directions](https://docs.mapbox.com/api/navigation/directions/) and [Static Tiles API](https://docs.mapbox.com/api/maps/static-tiles/).

Twilio: provision the account, Messaging Service and sender, complete applicable provider sender registration, and verify carrier delivery. Record explicit operational-text consent for each guardian, driver and coordinator. SMS contains generic ride updates and a secure link, not student names or pickup codes. Verify the provider's STOP handling and update consent in the register when withdrawn. See [Twilio Message resource](https://www.twilio.com/docs/messaging/api/message-resource).

## 3. Unattended notifications

Successful non-GPS mutations start a best-effort outbox drain. An unattended schedule is needed for reconciliation and cleanup while nobody is using the app.

Configure a scheduler to POST once per minute to `/api/jobs/notifications` with `Authorization: Bearer <KY_JOBS_TOKEN>`. Keep the token in scheduler secrets, use HTTPS and a 30-second timeout, and notify the operator on failures. Expect JSON and HTTP 200; `configured:false` does **not** mean working SMS.

The hosting audience is an additional gateway. An owner-only Site may reject a machine scheduler before the app sees its token. Verify access through a supported hosting authentication mechanism; do not copy personal login cookies. A login redirect means the schedule is not operational. Do not broaden the Site audience just to pass this check. If the platform cannot support unattended authenticated access, move the processor to supported scheduled infrastructure before relying on SMS.

In Admin → Settings → Service status, confirm the worker timestamp advances while the app is closed. Test accepted, delivered and undelivered messages. Unknown sends require checking provider logs before any manual resend. New alerts have a separate budget from delivery checks; pending messages expire after 15 minutes to avoid stale alerts.

## 4. Approved participants

1. Sign in as the configured owner. Enter a reachable coordinator name and phone.
2. Confirm partner coordinates and instructions. Register at least two active meeting points.
3. Review driver eligibility and original documents through the organization's secure process, record attestations/current expiries, and approve the driver. New drivers start in review.
4. Register each guardian/student, reviewed consent and emergency number. One family record represents one student.
5. Link each participant's actual ChatGPT email to the correct record in Account access. Add a backup coordinator. Profile email edits do not change sign-in access.
6. Grant the same people access through the hosting audience controls. Hosting access does not grant app membership; membership does not bypass owner-only hosting.
7. Test separate participant accounts, unrelated-family isolation, driver/admin separation and revocation. The first successful sign-in binds an approved email to a verified account ID. Replacing that identity requires revoking and re-adding the grant. Each driver record can have only one sign-in account; changing a contact email does not replace it.

## 5. Adult device rehearsal

Rehearse with adults before student rides, using the actual iPhone/Android devices and connectivity expected in the trial. A passenger should observe the app; drivers should not interact with it while moving.

| Test                                     | Expected result                                                                                                          |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Request, assign and accept               | One durable ride visible to its guardian, assigned driver and coordinator; retries do not duplicate it                   |
| Decline accepted request                 | Returns to coordinator matching, clears assignment and old GPS                                                           |
| Arrival                                  | Fresh, sufficiently accurate device GPS near the agreed pickup                                                           |
| Pickup code                              | Visible only to assigned guardian; expires after 15 minutes and starts the ride once                                     |
| Moving phone                             | Guardian/coordinator devices receive real GPS updates                                                                    |
| Network loss                             | Failed writes visible; stale GPS warning; reconnect refreshes current state                                              |
| Denied GPS, locked or backgrounded phone | Updates may stop; data becomes stale; reopen and obtain a new fix                                                        |
| Drop-off                                 | Wrong location, old fix and poor accuracy cannot complete the trip                                                       |
| Help                                     | Coordinator sees the alert, older unresolved alerts remain visible, phone fallback works                                 |
| Texts                                    | Consented devices receive messages; provider receipts match admin status                                                 |
| Completion and rating                    | Code consumed, completion once, further tracking denied, rating once                                                     |
| Service-credit review                    | Arrival-to-drop-off suggestion includes waiting; admin reason required; approved minutes visible to the driver           |
| Credit amendment/export                  | Old and new decisions remain in history; only the current approval contributes to totals; Excel matches filtered records |

This web app cannot promise continuous background GPS. Desktop simulation does not test moving-device reliability. Define phone-based fallback and a process for a ride stranded in an active state if GPS fails; there is no unaudited completion bypass. If continuous background tracking is required, finish and test the native app path before student rides.

## 6. Recovery, retention and supervision

Assign a reachable operator to review service status, help requests and stale rides throughout every operating window, with a backup contact. No automated emergency-service dispatch exists.

Save the operational export in approved encrypted storage after trial sessions. It contains personal information, account mappings, settings and activity, with pickup codes removed. It is for review and reconciliation, **not** complete restoration.

Establish full recovery with the hosting owner and rehearse on non-production data. D1 offers provider-managed point-in-time recovery, but access and the effective retention window for this Sites-managed database have not been verified. Confirm the recovery owner, acceptable data-loss window and a tested restore procedure. Never experiment with an in-place live restore. See [D1 Time Travel and backups](https://developers.cloudflare.com/d1/reference/time-travel/).

When the processor runs, it removes request metadata after 7 days, request receipts after 24 hours, notification metadata after 30 days and terminal-ride GPS after 24 hours. Only the latest GPS fix is stored. Participant records and business activity have no automatic deletion. Define retention/deletion for those records, exports and provider records before collecting student information.

Use Admin → Settings → Request logs to investigate denied access and errors. Record the request ID when escalating an issue; match it to the business event and platform log. Follow [IAM_AND_AUDIT.md](IAM_AND_AUDIT.md) to configure external log retention, error alerts and the operational review process. Database request logging is best effort; business audit writes are transactional and fail the mutation if they cannot be recorded.

## Release decision

Real rides require hosting access, verified provider delivery, unattended processing, tested recovery, approved onboarding and completed adult device rehearsal. This is a supervised pilot with manual matching, foreground web tracking, no payments, no phone OTP sign-in, no push service and no uploaded-document verification. Do not claim Uber/Lyft production parity.
