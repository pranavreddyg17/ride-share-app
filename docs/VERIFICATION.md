# Local verification — September 8, 2026

This records the endpoint, IAM, audit and service-record hardening release. The user requested no publishing; the existing public Site was not updated.

| Check                                                                    | Result                                                                                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, application lint and production build                        | Passed                                                                                                                                               |
| Fresh D1 installation                                                    | All three migrations passed on an isolated database                                                                                                  |
| Existing local database upgrade                                          | Migration 0002 applied successfully; existing records retained                                                                                       |
| Full compiled Worker integration suite                                   | 401 integration checks passed; successful summary and PASS-line count agree                                                                          |
| Focused endpoint/IAM suite                                               | 210 checks passed against the compiled Worker and persistent D1                                                                                      |
| Provider, retry, foreground GPS, service-time and body-reader unit tests | 24 tests passed                                                                                                                                      |
| API coverage                                                             | All nine routes; supported operations, authentication, role scope, unsupported methods, HEAD, invalid input and provider-unavailable behavior        |
| Account lifecycle                                                        | Bound identity, revocation, new/same-identity regrant, receipt isolation and authorization changes during commit passed                              |
| Record integrity                                                         | Required versions, stale-edit rejection, concurrent duplicate-driver protection, contact edits, renewed screening and inactive meeting points passed |
| Historical records                                                       | Ride identities/vehicle and actual timing survive later register edits; Excel preserves typed elapsed minutes and current credit decisions           |
| Excel export                                                             | Seven admin sheets, three driver sheets, scoped data, complete credit revisions, plain-text notes and linked help-resolution metadata passed         |
| Business and request logs                                                | Verified actor/action/record/request correlation, failed requests, pagination, private metadata, practice isolation and retention passed             |
| Database fault injection                                                 | Outbox and credit-history failures roll back related writes; authorization changes during commit roll back driver/grant changes                      |
| Concurrent booking/assignment                                            | Exactly one conflicting operation accepted                                                                                                           |
| Concurrent GPS/arrival                                                   | Both persist without overwriting one another                                                                                                         |
| Cross-account tracking                                                   | Guardian and admin identities receive the driver's stored position                                                                                   |
| Dependency audit                                                         | npm audit --omit=dev: zero known vulnerabilities reported                                                                                            |

The suite uses a compiled local Worker and separate simulated trusted gateway identities. Excel checks parse real authenticated XLSX responses. SQL faults are injected only into a dedicated test database and removed in finally blocks. Request metadata is read back from D1; a synthetic secret submitted in a body and query string is absent from the stored log.

Three extra body-reader tests verify an exact byte limit, split UTF-8 and stopping a chunked stream without trusting Content-Length. State mutations now enforce a 20,000-byte streaming limit. The 20,001-byte API rejection is followed by another request to verify normal handling continues.

Earlier runs stopped at two test comparisons that incorrectly included the new per-request trace ID. They now compare status/business data separately from HTTP identity. The local test server also reloaded when Wrangler SQL subprocesses used its discovery registry. The final setup separates the server and SQL registries, runs from a compiled copy and keeps development hot reload stopped during the suite. Interrupted runs are not counted as successful verification.

## Remaining verification and operational work

- **No deployment.** The earlier Sites account/workspace mismatch remains unresolved. Local verification does not update or certify the public version.
- **Live providers.** Mapbox credentials, paid routing/tiles, Twilio carrier delivery and unattended notification processing through the hosting gateway remain unverified. No live SMS was sent; provider unit tests use controlled responses. External OSRM availability is outside the deterministic suite.
- **Hosted HTTP and identity boundary.** Confirm that the hosting gateway sanitizes identity headers and applies the intended audience. Also test oversized/aborted uploads: after cancelling a 100 KB body, the local Miniflare proxy produced a transient 500 on the following request. This was reproduced with a minimal Worker outside this app; the equivalent hosted behavior has not been verified. The app client retries server/network errors with one idempotency key.
- **Physical phones and UI.** API-injected coordinates and a fake geolocation object do not establish moving-device, screen-lock or background behavior. Server-rendered pages were checked over HTTP; browser interaction/visual QA was not performed in this audit.
- **Operations.** Configure external log collection and alerts, verify production secrets/onboarding, rehearse database recovery, measure capacity and complete the adult device trial. D1 request logging is best effort; business audit writes are transactional. There is no external monitoring provider connected by this release.

See [IAM_AND_AUDIT.md](IAM_AND_AUDIT.md), [SERVICE_RECORDS.md](SERVICE_RECORDS.md) and [TRIAL_RUNBOOK.md](TRIAL_RUNBOOK.md). These results support a supervised pilot implementation; they do not establish production parity with Uber or Lyft.
