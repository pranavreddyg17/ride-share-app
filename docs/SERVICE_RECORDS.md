# Driver service records

This local release adds admin dispatch, a full ride ledger, service-credit review, and Excel reporting. It has not been published.

## Time policy

- Suggested service begins when the driver records arrival at pickup and ends when drop-off is confirmed. Waiting at pickup is included.
- Acceptance, scheduled pickup, and driving to pickup do not add suggested minutes.
- Actual timestamps come from the server when each ride transition succeeds. The app retains requested, scheduled, accepted, arrived, pickup verified, completed, and cancelled times where available.
- Suggested credit rounds the total elapsed service time to the nearest whole minute. Recorded waiting and driving durations remain separate. Elapsed time is computed from UTC timestamps, including across daylight-saving changes.
- Existing records without arrival timestamps show unknown service time. The app does not invent or backfill those times from estimates.
- Completed rides require an admin review before appearing in approved service totals. Cancellation does not create credit.

## Admin workflow

1. Use **Dispatch** for the selected date's schedule, active trips, unassigned requests, driver applications, help requests, and credit awaiting review.
2. Open **Rides** for the full searchable ledger. Filter by scheduled pickup date (Central Time), driver and ride status. Open a ride to see contacts, route snapshots and its timing record.
3. Open **Service hours** and choose **Review**. Check the arrival, pickup and drop-off timestamps. Approve the suggested minutes, adjust them, or exclude the ride with zero credit. Every review requires a reason. Allowed credit is 0–1,440 whole minutes per completed ride.
4. Use **Amend** for corrections. **Review history** contains every decision, minutes, reviewer, time and reason. If another admin saves first, close and reopen the review before applying a new decision.
5. **Reports & exports** downloads an Excel workbook using the selected ride filters. The service-hours screen exports completed rides; the full ledger can include all statuses.

Only the latest approved decision for each ride contributes to totals. An amendment replaces its previous value; exclusion removes it. Request retries do not create additional credit or history entries. Current credit, the full immutable review snapshot, audit event and idempotency receipt commit in one D1 transaction. A failed history write rolls the whole review back.

Drivers can view and export their own credited service. They cannot review credits or request another driver's records. Families cannot access the service-credit records or reports.

## Excel workbook

| Sheet | Contents |
| --- | --- |
| Driver summary | Completed rides, pending/excluded reviews, wait/drive/service minutes, missing timestamps, approved minutes and hours |
| Ride ledger | Assignment, route snapshots, student/guardian (admin only), status, actual timestamps, time breakdown, current credit and reviewer |
| Credit reviews | Every saved revision with decision, minutes, reviewer, review timestamp and reason; these rows are history and should not be summed for current totals |
| Activity | Full activity for the filtered rides, including credit changes and help resolution |
| Driver register | Relevant drivers, contact/vehicle details, approval, document review flags and expiry dates |
| Family register | Relevant students/guardians, contacts, consent and emergency contact |
| Meeting points | Relevant location register; the ride ledger separately preserves the agreed route snapshots |

Driver workbooks contain the first three sheets only and omit student and guardian columns. Admin workbooks contain all seven sheets. Register sheets contain participants/locations associated with the filtered rides; use the register screens' CSV exports to include registered people who have no rides.

Excel dates are explicitly encoded as Central wall-clock values, with UTC ISO timestamps also provided for scheduled pickup, arrival and completion. Numeric minutes and hours are numeric cells, suitable for sorting and aggregation. Notes remain plain text, even when starting with `=`. Pickup codes are never exported. Filters and frozen headers are built into the workbook. Exports are capped at 1,000 rides and three requests per minute per account; split larger periods.

The **Driver summary** and **Ride ledger** hold current approved totals. **Credit reviews** preserves revisions, including exclusions and replaced approvals; summing that history would overcount.

## Storage and operational limits

Current decisions use versioned `records` entries of kind `credits`, one per ride. Append-only snapshots use kind `credit_reviews`, keyed by ride and revision, within the existing D1 schema. No new migration is required. Only admin credit mutations write these records. Application revisions are guarded against stale and concurrent writes; completed ride timestamps are not modified by reviews.

The local redesign uses a monochrome console, Geist text and tabular time typography, with a static custom vehicle render on sign-in. It does not change the release prerequisites in [TRIAL_RUNBOOK.md](TRIAL_RUNBOOK.md): provider setup, hosted access, real-device GPS rehearsal and other operational checks remain outstanding. No production-parity claim is made.
