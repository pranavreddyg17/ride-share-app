# API integration tests

Tests operate on a compiled Worker and a separate local D1 state directory. They do not use the visible development preview database and never connect to the hosted site.

```sh
npm run build
npx wrangler d1 migrations apply DB --local --config wrangler.local.json --persist-to ../api-test-state
npx wrangler dev --config dist/server/wrangler.json --ip 127.0.0.1 --port 3001 --persist-to ../api-test-state
# In a second terminal:
npm run test:api
```

The test runner mimics the trusted hosting gateway with distinct coordinator, driver, family and unknown-user identity headers. This is possible only because the test Worker is run directly on localhost; the hosted Sites gateway supplies identity and strips untrusted identity headers.

The final local verification passed 102 assertions. Tests cover real membership, role escalation rejection, registration/screening, consent, trip ownership, overlapping bookings, state transitions, five-attempt pickup-code lockout, code privacy/replay, cross-identity GPS propagation, GPS completion constraints, alerts, ratings, revocation, tenant separation, simulated-location rejection in the real pilot, practice location propagation, current-road ETA, prebooking routes, concurrent booking/assignment conflicts, and server-rendered routes. Repeat runs use unique records. Remove the test-state directory only when you intentionally want to reset this isolated test environment.

The suite is not a test of browser GPS permission, screen lock/background behavior, carrier connectivity, SMS, UI layout, or actual student handoff.
