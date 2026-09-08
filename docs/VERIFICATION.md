# Release verification — September 8, 2026

This records local verification of the backend hardening and admin/service-record redesign. The user requested no publishing; the existing public URL was not updated.

| Check | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Application lint | Passed |
| Production Worker/browser build | Passed |
| Both D1 migrations on isolated test database | Passed |
| Compiled Worker integration suite | Passed; 190 successful checks recorded in the test log |
| Provider, client retry, GPS and service-time unit tests | 21 tests passed |
| Excel response validation | Seven admin sheets, three driver sheets, typed time/numeric cells, scoped filters, complete review history and plain-text notes passed |
| Service credit | Admin-only review, stale/concurrent rejection, retry idempotency, exclusion and replacement totals passed |
| Credit history failure | Current decision, history, audit and receipt rolled back; same request recovered |
| Production dependency audit | No known vulnerabilities reported by npm audit --omit=dev |
| Injected database failure | Ride, activity, outbox and request receipt rolled back together; retry recovered |
| Concurrent booking/assignment | Exactly one conflicting operation accepted |
| Concurrent GPS/arrival | Both persisted without overwriting one another |
| Cross-account tracking | Separate guardian and admin identities received the driver's stored coordinates |
| Unresolved help history | Old open alert retained beyond the recent-activity limit |

The integration suite supplies device coordinates through the API on a compiled local Worker. Excel checks parse actual authenticated API responses with ExcelJS. The GPS unit test uses a fake browser geolocation object. Neither substitutes for physical-device testing. Provider tests use controlled responses; no live SMS was sent. External OSRM availability was excluded from the deterministic suite rather than reported as passing.

The test harness now closes pooled HTTP connections around its synchronous Wrangler fault-injection calls. Two preliminary runs were interrupted by stale local HTTP sockets; the completed run recorded 190 PASS checks. Its summary counter undercounted callbacks during an awaited helper; the counter has been corrected without changing the executed assertions. Source typecheck, lint, format checks and the production build passed. Visual browser/interaction testing was not performed.

## Not verified or completed

- Publishing: intentionally withheld for this redesign. Earlier attempts also found a Sites account/workspace mismatch; resolve ownership before a separately authorized deployment.
- Live Mapbox tokens/tiles/directions and Twilio carrier delivery: no provider accounts supplied.
- Unattended notification processing through the production hosting access gateway.
- Production bootstrap/environment configuration and participant onboarding on the live Site.
- Browser interaction/visual QA, moving-device GPS, screen lock, backgrounding and network-loss behavior on real phones.
- Production database backup access and recovery rehearsal, load/capacity testing and independent security assessment.

See [SERVICE_RECORDS.md](SERVICE_RECORDS.md) for the admin workflow and [TRIAL_RUNBOOK.md](TRIAL_RUNBOOK.md) for setup and release gates. Preserve the existing Site and database; do not publish this redesign without a new user request.
