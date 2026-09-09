# Local verification — September 9, 2026

This records verification of the prepared architecture, completion, IAM, navigation and reporting update. It does not describe a deployed release. The current Sites connection cannot find the existing project and returns no editable sites; publication requires access to the correct account/workspace.

## Automated verification

| Check                                  | Result                                                                                                                                                     |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript, lint and production build  | Passed                                                                                                                                                     |
| Fresh D1 installation                  | All three existing migrations applied to a separate test database; no schema changes in this update                                                        |
| Full compiled Worker integration suite | 448 checks passed; successful summary and PASS-line count agree                                                                                            |
| Unit tests                             | 29 passed: providers, retry, foreground GPS, service time, reporting facts, completion validation and streaming body limits                                |
| API coverage                           | All nine routes; supported operations, authentication, role scope, unsupported methods, HEAD, invalid inputs and unavailable providers                     |
| Account lifecycle                      | Bound identity, revocation, regrant, receipt isolation and authorization changes during commit                                                             |
| Data integrity                         | Version guards, concurrent duplicate-driver/booking protection, contact edits, renewed screening and inactive meeting points                               |
| Transaction faults                     | Outbox/history failures and authorization changes roll back the related writes                                                                             |
| Record history                         | Assignment identity/vehicle snapshots, arrival, pickup verification, drop-off and credit revisions survive later register edits                            |
| Completion evidence                    | GPS quality retained; practice labeled; coordinator verification requires source, reason, attestation and valid actual times; duplicate completion guarded |
| Tracking and privacy                   | Cross-account persisted positions; guardian and driver contacts only during accepted/active relationships; detailed completion evidence admin-only         |
| Excel                                  | Ten admin sheets, three driver sheets; typed durations, scoped registers/history, formula-like notes stored as text, consistent current credit totals      |
| Analysis                               | One row per ride; monthly, driver and daily totals reconcile; credit revisions never counted twice                                                         |
| Logs                                   | Actor/action/record/request correlation, failures, pagination, private metadata, practice isolation and retention                                          |
| Browser boundaries                     | Cross-site write rejection, pilot role-spoof rejection, response security headers                                                                          |
| Dependencies                           | Production dependency audit reported zero known advisories                                                                                                 |

The suite runs a compiled local Worker with persistent D1 and simulated trusted gateway identities. It parses actual authenticated XLSX responses. SQL faults are injected only into a dedicated test database and removed in finally blocks. A synthetic secret submitted in the body and query string is absent from stored request logs. Separate Worker and SQL discovery registries prevent test operations from disturbing the server. No production data is used.

The final run passed 448 integration checks against a fresh migrated database and the final compiled build. It includes native download errors and practice-query/pilot-membership boundary checks. External routing availability was intentionally excluded from the deterministic run; provider contracts and unavailable-provider behavior were tested.

## Browser workflows

The existing practice workspace was tested at desktop and phone widths, including 390 px. Navigation, role switching, filters, service-hour totals and review history were exercised. Phone screens had no page-level horizontal overflow. The current browser console check returned no errors.

The earlier rehearsal **KY-E07D4980** exercised family booking, admin assignment, driver acceptance/arrival, family pickup code, verified pickup, explicit simulated GPS, driver completion and a five-minute credit approval. This update amended its review without increasing the approved total: the value remained 0.08 hours.

The new rehearsal **KY-0AFB364C** was created through the scheduling form, accepted by the driver, checked in at pickup and started using the family's code. The 75-second practice route displayed changing stored positions. The admin then used the separate drop-off exception dialog. Submission stayed disabled until a verification source and arrival attestation were provided. The completed record retained arrival, pickup and drop-off times, two minutes of suggested service, recorder, guardian verification source and reason. Credit remained pending for a separate review.

The first Excel download method did not produce a saved file in the embedded browser. Native authenticated delivery fixed this: the browser emitted a download event, and the newly saved workbook was opened with ExcelJS. It contained all ten sheets, **KY-0AFB364C**, and the exact coordinator verification reason. A second browser download from the driver view contained three sheets, the current ride, and no private coordinator reason. These checks confirm the downloaded files were current, rather than an older workbook left in Downloads.

These workflows verify the practice transport path and local browser behavior. They do not establish moving-device GPS accuracy, background tracking or carrier delivery.

## Remaining release work

- **Hosting access:** reconnect Sites to the account/workspace containing the existing Kinetic Youth project. The published site has not received this update.
- **Providers:** configure Mapbox and Twilio; verify routing/tiles, carrier delivery and unattended notification processing through the hosting gateway. No live SMS was sent. Real-pilot maps do not silently fall back to practice routing.
- **Gateway:** confirm hosted identity-header sanitization and the intended audience. Public site access does not grant application membership. Local simulated headers cannot validate the hosted identity boundary.
- **Physical phones:** rehearse real driver and guardian devices, permissions, movement, screen lock and reconnection. Foreground browser tracking is not continuous native background location.
- **Operations:** connect external logs/alerts, rehearse database recovery and measure capacity. Business audit writes are transactional; request logging is best effort. Full workspace reads and five-second polling need measurement before expansion.
- **Proxy behavior:** an earlier cancelled oversized-upload test reproduced a transient local Miniflare error with a minimal Worker outside the app. Hosted behavior remains unverified. Client retries retain the same idempotency key.

See [ARCHITECTURE_REVIEW.md](ARCHITECTURE_REVIEW.md), [IAM_AND_AUDIT.md](IAM_AND_AUDIT.md), [SERVICE_RECORDS.md](SERVICE_RECORDS.md) and [TRIAL_RUNBOOK.md](TRIAL_RUNBOOK.md). These checks support a supervised pilot implementation; they do not establish production parity with Uber or Lyft.
