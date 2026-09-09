# Verification

## Provider and client contracts

```sh
npm run test:unit
```

Tests inject fake provider responses; no paid requests or texts are sent. They cover provider selection, geometry validation, missing configuration, public-versus-secret map tokens, SMS acceptance/delivery/failure/ambiguity, and stable client request keys across network/server retries.

Service-time tests cover arrival-to-drop-off including waiting, rounding, missing/reversed timestamps, daylight-saving transitions, Central-date filters and approved-only totals. Request-body tests cover split UTF-8, exact byte limits and cancellation of oversized chunked streams without trusting Content-Length.

## Compiled Worker and D1

The integration runner refuses non-loopback URLs and injects database faults into a dedicated **`*-state`** directory. The default is `../api-hardening-state`; `KY_TEST_STATE` overrides it. The Worker and runner must both use the same dedicated directory. Do not share it with development, another run, or operational data. Run one suite at a time.

```sh
npm run build
npx wrangler d1 migrations apply DB --local --config wrangler.local.json --persist-to ../endpoint-audit-state
MINIFLARE_REGISTRY_PATH="$PWD/../endpoint-worker-registry" npx wrangler dev --config dist/server/wrangler.json --ip 127.0.0.1 --port 3001 --persist-to ../endpoint-audit-state --var KY_BOOTSTRAP_ADMIN_EMAIL:admin@ky-test.example --var KY_JOBS_TOKEN:ky-local-endpoint-audit-only
# In a second terminal, from the project directory:
KY_TEST_STATE=../endpoint-audit-state npm run test:api
```

The runner mimics the trusted hosting gateway with distinct coordinator, driver, guardian and unknown-user headers. The deployed Sites gateway must own and sanitize identity headers; the direct test Worker must remain local.

Keep the compiled output unchanged during the run. Stop the development server before building/testing, or copy `dist` into a separate test directory with the same `server` and `client` layout and point Wrangler at that copy. Continue to use the absolute path of the original test directory for persistence. The Node harness closes each HTTP connection because its synchronous Wrangler SQL checks can block the event loop beyond a pooled socket's keep-alive timeout. The job token above is an isolated-test constant, never a production credential. `KY_TEST_JOBS_TOKEN` overrides the token used by the harness.

Use the separate Worker registry shown above. The harness puts each local SQL process in `KY_TEST_STATE/sql-registry`; otherwise Wrangler's shared discovery registry can reload the Worker every time a fault-injection query runs. Keep both registry directories outside the compiled server's watched files.

Coverage includes membership initialization/revocation, role escalation, record scope, review and consent, transitions, immutable meeting points, booking/assignment races, decline, expired/locked/replayed codes, GPS propagation/order/proximity/accuracy, concurrent GPS and arrival, admin-only verified drop-off recovery, unresolved-alert visibility, redacted exports, idempotent replay and recovery after an injected database failure. Server-rendered responses are checked without browser interaction.

`credit-checks.mjs` exercises admin-only credit approval, validation, idempotent replay, conflicting revisions, exclusions, immutable timestamps and complete decision history. It also parses the actual Excel API response, checking numeric totals, timestamp cells, plain-text notes, role restrictions, filtering and all seven admin sheets.

`endpoint-checks.mjs` covers all nine API routes, authentication, unsupported methods, HEAD permissions, malformed requests, missing records, invalid filters, register versions, duplicate driver/account conflicts, screening resets, contact edits, anchor deactivation, timestamp validation, historical participant/vehicle snapshots, elapsed time cells, current-credit flags, rate limits, authorized maintenance and retention.

`iam-checks.mjs` checks verified-identity binding, revoke/regrant to a different identity, revoke/regrant to the same identity, old receipt isolation, authorization changes during a commit, transactional actor/action/record/request metadata, private activity fields, request-log search/pagination and practice isolation. It verifies that logged metadata excludes a synthetic secret supplied in a body and query string. Each retry gets a distinct HTTP trace while retaining the same business result.

SQL backdating tests expiry without a fifteen-minute wait. A temporary trigger makes outbox insertion fail; assertions verify that the ride, activity, notification and receipt all roll back. The trigger is removed in `finally`. If forcibly interrupted, remove only that trigger from the isolated database:

```sh
npx wrangler d1 execute DB --local --config wrangler.local.json --persist-to ../endpoint-audit-state --command 'DROP TRIGGER IF EXISTS ky_test_outbox_failure'
```

Credit tests also inject `ky_test_credit_history_failure` and remove it in `finally`. If forcibly interrupted, drop that named trigger from this isolated test database before rerunning. It deliberately prevents credit history writes so rollback can be verified.

IAM tests inject `ky_test_regrant_race`, which changes a grant between the primary write and receipt. They remove it in `finally`; if interrupted, remove that named trigger only from the isolated test database.

External OSRM availability is optional and is not counted as passing when unavailable:

```sh
KY_TEST_EXTERNAL_ROUTES=1 npm run test:api
```

This suite does not establish physical GPS/background behavior, carrier delivery, paid Mapbox access, browser layout, hosted gateway behavior, production recovery or operational readiness. Follow the trial runbook for those checks.
