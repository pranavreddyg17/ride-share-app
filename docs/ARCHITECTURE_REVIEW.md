# Architecture and workflow review — September 9, 2026

This review concerns the prepared source update, not certification of production operations or a claim that the update is already published.

## Findings addressed

| Finding                                                                                   | Change                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity, persistence, reads and every command shared one large server file.              | A small dispatcher delegates to separate authentication, validation, storage, read-model and domain-command modules.                                                       |
| Coordinator completion accepted invalid calendar dates and a one-minute future allowance. | Strict timezone/calendar validation, no future allowance, valid pickup timeline, verification source and explicit arrival confirmation.                                    |
| Completion reasons existed only in a recent activity feed.                                | Immutable evidence on the ride: verified drop-off, recorded-at time, recorder, source and reason. GPS completion retains fix time, accuracy and distance from destination. |
| Practice completion could claim device GPS.                                               | Distinct practice label. Existing missing timestamps and evidence remain unknown; no invented backfills.                                                                   |
| Families could retain a driver's phone after the ride.                                    | Phone access follows the accepted/active relationship window, matching guardian contact access. Detailed completion evidence stays admin-only.                             |
| An exceptional manual close looked like the main action.                                  | Coordinator recovery sits in a disclosure with a dedicated confirmation dialog. Credit review remains separate.                                                            |
| Tracking counted future accepted rides as active.                                         | Trips underway means arrival or in-progress. Cancelled requests are excluded from today's scheduled count.                                                                 |
| Generic icons and separate route lists made navigation harder to maintain.                | Shared role navigation; operations, registers and settings groups; numbered administrative destinations.                                                                   |
| Custom selectors were nested in native labels.                                            | Labels explicitly reference native inputs; custom controls retain their own accessible names.                                                                              |
| Excel lacked a clean analysis grain.                                                      | One analysis row per ride, daily totals, a guide, monthly trends and a driver timesheet; common filters and current credit decisions.                                      |
| Exports loaded unrelated history into memory.                                             | SQL limits event/review history to selected ride IDs, with the existing 1,000-ride export cap.                                                                             |

## Responsibilities

Native authenticated file delivery replaces unreliable in-memory Excel downloads. Readable error pages preserve HTTP status codes. A role query parameter is honored only inside the caller's isolated practice workspace; pilot permissions always come from membership.

- `lib/server.ts`: public facade and explicit operation dispatch.
- `lib/server/auth.ts`: gateway identity, owner bootstrap, membership binding, role and ride-ownership checks.
- `lib/server/runtime.ts`: context, database binding and API errors.
- `lib/server/validation.ts` and `eligibility.ts`: inputs and driver eligibility.
- `lib/server/repository.ts`: prepared reads, guarded writes, ride conflict guards and business audit.
- `lib/server/locations.ts`: latest location projection and distance.
- `lib/server/read-model.ts`: coherent record snapshot and role-specific redaction.
- `lib/server/commands/`: rides, registers, credits, access grants and operations.
- `lib/reliability.ts`: idempotency, rate limits, atomic commit and authorization revalidation.
- `lib/ride-completion.ts`: pure completion-time validation and evidence labels.
- `lib/service-hours.ts`: durations, filters and reconciled reporting facts.
- `app/features/`: focused completion dialog and reporting components.

Commands prepare one guarded primary write. Reliability batches it with the receipt, audit and dependent history/outbox statements. Failed guards or dependent inserts roll back the batch. UI success follows the committed server result.

## Reporting contract

One analysis row represents one ride. Date and month use scheduled pickup in America/Chicago. Actual service is arrival-to-drop-off elapsed time, including waiting; current approved credit is separate. Missing durations stay blank. Pending and excluded rides contribute zero approved minutes.

Monthly trends, driver timesheets and daily exports aggregate the same facts. Assignment snapshots preserve historical names/schools. Current register sheets cover participants linked to selected rides. Credit reviews are revisions and must not be summed as service totals.

No new charting or 3D dependency was added. Local dimensional vehicle artwork appears at sign-in and the idle driver state; administrative views prioritize records. The [Framer reference](https://www.framer.com/marketplace/components/tags/3d/) informed restrained use of dimensional artwork.

## Security and operational limits

The review used [OWASP authorization guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) and [logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html). This is an implementation review, not a penetration-test certification.

The app denies unknown operations, unauthenticated/unauthorized access, cross-site browser writes, stale edits, invalid transitions and unapproved assignments. Identity headers remain trustworthy only behind the Sites gateway. Public hosting does not grant participant-data access. The production dependency audit reported no known advisories at review time.

Response headers suppress referrers, MIME sniffing, plugins and unneeded camera/microphone permissions. The CSP constrains base URLs, plugins and form destinations. It is not a nonce-based script policy or comprehensive XSS protection.

Browser GPS is not tamper-proof hardware attestation or proof of handoff. Production map/SMS providers, external monitoring, recovery drills and physical-phone tracking still need setup and verification; see the trial runbook.

Versioned JSON records remain for compatibility with existing pilot data and transactional safeguards. The application validates domain fields; the database does not enforce a full relational domain schema. Full workspace reads and five-second polling require capacity measurement before expansion. A larger launch needs indexed domain queries, pagination, archival and stronger monitoring. This update avoids a destructive rewrite of existing records.
