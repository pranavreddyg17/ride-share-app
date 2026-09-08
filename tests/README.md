# Verification

## Provider and client contracts

```sh
npm run test:unit
```

Tests inject fake provider responses; no paid requests or texts are sent. They cover provider selection, geometry validation, missing configuration, public-versus-secret map tokens, SMS acceptance/delivery/failure/ambiguity, and stable client request keys across network/server retries.

Service-time tests cover arrival-to-drop-off including waiting, rounding, missing/reversed timestamps, daylight-saving transitions, Central-date filters and approved-only totals.

## Compiled Worker and D1

The integration runner refuses non-loopback URLs and injects database faults into **`../api-hardening-state`**. The Worker and runner must both use this dedicated test directory. Do not share it with development, another run, or operational data. Run one suite at a time.

```sh
npm run build
npx wrangler d1 migrations apply DB --local --config wrangler.local.json --persist-to ../api-hardening-state
npx wrangler dev --config dist/server/wrangler.json --ip 127.0.0.1 --port 3001 --persist-to ../api-hardening-state --var KY_BOOTSTRAP_ADMIN_EMAIL:admin@ky-test.example
# In a second terminal, from the project directory:
npm run test:api
```

The runner mimics the trusted hosting gateway with distinct coordinator, driver, guardian and unknown-user headers. The deployed Sites gateway must own and sanitize identity headers; the direct test Worker must remain local.

Keep the compiled output unchanged during the run. Stop the development server before building/testing, or copy `dist` into a separate test directory with the same `server` and `client` layout and point Wrangler at that copy. Continue to use the absolute path of the original `../api-hardening-state` for persistence. The Node harness closes each HTTP connection because its synchronous Wrangler SQL checks can block the event loop beyond a pooled socket's keep-alive timeout.

Coverage includes membership initialization/revocation, role escalation, record scope, review and consent, transitions, immutable meeting points, booking/assignment races, decline, expired/locked/replayed codes, GPS propagation/order/proximity/accuracy, concurrent GPS and arrival, unresolved-alert visibility, redacted exports, idempotent replay and recovery after an injected database failure. Server-rendered responses are checked without browser interaction.

`credit-checks.mjs` exercises admin-only credit approval, validation, idempotent replay, conflicting revisions, exclusions, immutable timestamps and complete decision history. It also parses the actual Excel API response, checking numeric totals, timestamp cells, plain-text notes, role restrictions, filtering and all seven admin sheets.

SQL backdating tests expiry without a fifteen-minute wait. A temporary trigger makes outbox insertion fail; assertions verify that the ride, activity, notification and receipt all roll back. The trigger is removed in `finally`. If forcibly interrupted, remove only that trigger from the isolated database:

```sh
npx wrangler d1 execute DB --local --config wrangler.local.json --persist-to ../api-hardening-state --command 'DROP TRIGGER IF EXISTS ky_test_outbox_failure'
```

Credit tests also inject `ky_test_credit_history_failure` and remove it in `finally`. If forcibly interrupted, drop that named trigger from this isolated test database before rerunning. It deliberately prevents credit history writes so rollback can be verified.

External OSRM availability is optional and is not counted as passing when unavailable:

```sh
KY_TEST_EXTERNAL_ROUTES=1 npm run test:api
```

This suite does not establish physical GPS/background behavior, carrier delivery, paid Mapbox access, browser layout, hosted gateway behavior, production recovery or operational readiness. Follow the trial runbook for those checks.
