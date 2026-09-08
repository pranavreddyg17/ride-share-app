# Kinetic Youth

A mobile-friendly application for a coordinator-led, approved-participant transportation pilot. React/Vinext screens call authenticated Worker APIs backed by Cloudflare D1. This is a small supervised pilot implementation, not an Uber-scale service or a native mobile app.

## Implemented

- Admin, driver and family membership bound to verified ChatGPT identities. Only the explicitly configured owner can initialize admin access. Practice personas use a separate per-user workspace.
- Driver/family registers, screening attestations, approval/suspension, guardian consent, emergency contacts, confirmed meeting points, account grants/revocation and CSV exports.
- Ride requests, manual assignment, acceptance, decline back to matching, arrival, pickup verification, completion, cancellation, help requests and ratings.
- Six-digit pickup codes visible only to the assigned family, expiring after 15 minutes, locked after five incorrect attempts, consumed once, and reissued only by a coordinator.
- Atomic ride, activity, notification and idempotency-receipt writes. Concurrent booking/assignment conflicts are rejected. Network retries reuse one key and cannot create duplicate rides. API rate limits bound request volume.
- Separate storage for the latest GPS fix so tracking does not overwrite ride transitions. Only the assigned, currently approved driver can publish device positions. Stale, out-of-order, invalid and simulated real-pilot positions are rejected. Viewers poll every five seconds and mark GPS stale after 45 seconds.
- Pickup and drop-off require device GPS less than 60 seconds old, reported accuracy at most 100 m, within 200 m of the agreed location. Ride snapshots preserve meeting points after anchor edits.
- Mapbox traffic-aware road directions and map tiles for the real pilot; OpenStreetMap/OSRM for practice. Missing or failed providers are shown explicitly, without fabricated routes or ETAs.
- Consent-aware Twilio outbox with send claims, provider delivery reconciliation, expiry and visible failed/unknown states. Acceptance is distinguished from delivery. Ambiguous sends are not blindly retried.
- Admin service status, missing-configuration checks, stale-ride counts, alert history, unresolved help (including older open alerts), and redacted operational JSON export.
- Monochrome dispatch console, searchable ride ledger, driver service-credit reviews and role-scoped Excel workbooks with full amendment history. Suggested credit uses arrival at pickup through drop-off, including waiting; only admin-approved credit contributes to totals. See [service records](docs/SERVICE_RECORDS.md).

## Run locally

Use Node 22.13+ and the existing npm lockfile.

```sh
npm ci
npm run db:local
npm run dev
```

Open the Local URL and select **Practice workspace**. Local sign-in comes from the Sites development plugin, which strips forged identity headers. Real admin initialization requires `KY_BOOTSTRAP_ADMIN_EMAIL` in the runtime environment. There is no first-visitor or localhost admin bypass.

```sh
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

See [tests/README.md](tests/README.md) for isolated compiled-Worker integration tests, including database fault injection. Never point that harness at operational data.

## Trial setup

The current admin and service-record redesign is local only. The user requested that it not be published.

Follow [docs/TRIAL_RUNBOOK.md](docs/TRIAL_RUNBOOK.md). Runtime credentials belong in hosting secrets, never source files or chat. Provider integrations are prepared; real SMS delivery, production map access, an unattended notification schedule, production recovery and physical-phone behavior still require setup and verification.

The existing Site is identified in `.openai/hosting.json`. Its hosting audience and this app's membership register are separate gates. Reuse that Site when publishing. Never expose a raw Worker without an authentication gateway that strips client-supplied `oai-authenticated-user-*` headers and supplies verified identity.

## Architecture and limits

`lib/server.ts` owns authorization and ride rules. `lib/reliability.ts` commits guarded primary writes, receipts and follow-up statements in D1 transactions. `ride_locations` contains only the newest fix. `lib/providers.ts` supplies road routes and public map configuration. `lib/notifications.ts` consumes the outbox using `lib/sms-provider.ts`; `/api/jobs/notifications` is the protected job entry point. `/api/operations` and `/api/export` require an admin.

Prepared SQL, record versions, current membership checks and database guards enforce mutations. Driver/student trips require a 45-minute scheduling separation; accepted trips reserve 30 minutes in driver availability. This conservative fixed window is not a traffic-aware dispatch optimizer.

The notification processor removes expired request counters, mutation receipts older than 24 hours, outbox entries older than 30 days, and latest GPS for terminal rides after 24 hours. Participant records and activity are retained until the operator applies an approved retention process. The operational export omits pickup codes and is **not** a restorable database backup.

Browser GPS requires HTTPS, permission, active connectivity and foreground execution. Locking or backgrounding a phone may stop updates. There is no native background tracking, push notification service, automated matching, in-app turn-by-turn navigation, payments or SMS sign-in. In-app pickup codes and verified-account login work independently of SMS.

Registers record operator attestations; they do not verify licenses, insurance, screening documents or student handoff. Original documents need a separate secure review/storage process. One family record currently represents one student. A coordinator must be reachable during every ride; an in-app help request does not contact emergency services.

Full workspace records are read and filtered for a small pilot. A larger launch needs paginated/query-scoped storage, measured capacity, stronger monitoring, independent security review and a native tracking strategy before claiming parity with a major rideshare platform.

## Source requirements

The supplied document and posters informed the brand and workflows. Their proposed React Native/FastAPI/PostGIS/Firebase stack was reference material, not an instruction to replace the existing application. This implementation follows the user's mobile-friendly web-first, admin-approved trial.
