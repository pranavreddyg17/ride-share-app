# Kinetic Youth pilot

A mobile-friendly web application for a coordinator-led, invitation-only youth transportation pilot. The app includes admin, driver, and family portals backed by a Cloudflare D1 database. It is an implemented pilot foundation, not a native iOS/Android app or a public rideshare service.

## What works

- Secure ChatGPT sign-in; verified-email membership for the real pilot. Admins create and revoke linked driver, family, and coordinator accounts.
- Separate, persisted practice workspaces with fictional records and a role selector. Practice identity switching cannot change real pilot privileges.
- Driver register with vehicle, contact, license/insurance expiry dates, review checklists, approval/suspension, and CSV export.
- Family/student register with guardian consent and emergency contact; family-owned ride views.
- Confirmed anchor location register with coordinates and meeting instructions.
- Ride requests 30 minutes to 7 days ahead; coordinator assignment, driver acceptance, arrival, pickup code, completion, and reasoned cancellation.
- Driver and student booking conflicts checked atomically at write time using a 45-minute separation. One active pickup/trip per driver/student. Recurring driver availability reserves 30 minutes for each ride.
- Six-digit, cryptographically generated pickup codes; 15-minute expiry, five attempts, one-time consumption, and coordinator-only reissue. Codes are visible only to the assigned family.
- Map-first family/driver screens with step-by-step booking review, driver and vehicle details, pickup verification, and a current road ETA when recent GPS is available.
- Interactive Leaflet / OpenStreetMap maps and road geometry / duration from OSRM. Failed routing is shown explicitly, without a fabricated road route.
- Foreground device GPS sharing and five-second viewer polling. Stale positions are marked; real drop-off requires a fix less than 60 seconds old, accuracy at most 100 m, and distance at most 500 m from the destination.
- Ride history, one rating per completed trip, in-app coordinator help requests, resolution notes, and activity history.
- Responsive layouts, keyboard-accessible controls, dialogs, form validation, offline feedback, loading states, and empty states.

## Start locally

Use Node 22.13 or newer and npm. The checked-in lockfile defines dependency versions.

```sh
npm ci
npm run db:local
npm run dev
```

Open the Local URL printed by the development server. Select the practice workspace and complete local sign-in. The Sites development plugin provides a localhost-only test identity; it strips externally supplied identity headers.

```sh
npm run typecheck
npm run lint
npm run build
```

The Worker build is in `dist/server`; browser assets are in `dist/client`. The app uses the Sites-generated Vinext architecture and an append-only Drizzle migration chain in `drizzle/`. Apply migrations before starting an independent Worker deployment.

## Try a ride

1. Select Admin in the practice role selector. Register or review drivers/families, or use the fictional records.
2. Complete Aiden's preloaded active trip from Driver view.
3. Request a future ride for Emma Wilson in Family view. In Admin view, assign Aiden.
4. In Driver view, confirm the ride and mark arrival.
5. In Family view, open that ride and read the pickup code. In Driver view, enter it to start, then confirm drop-off.
6. In Family view, rate the completed trip. Review activity as Admin.

Practice mode bypasses the drop-off proximity check and the 30-minute check-in window so you can rehearse at a desk. It still enforces pickup-code and state-transition rules. Sample locations are explicitly labeled. In Driver view, use “Play a 75-second test drive” to send simulated road positions through the same persisted tracking path. Open Family view in another tab to observe the updates. The simulation is explicitly rejected in the real pilot.

## Real pilot setup

The private site's first authenticated visitor who opens `/?mode=pilot` becomes the initial coordinator. Initialize this while the Site is owner-only, before changing its audience. Later visitors must have their verified sign-in email added by a coordinator. Hosting access policy and the app membership register are separate gates; adding a member does not make an owner-only Site visible to that person.

The real workspace starts empty. Add the coordinator phone, confirmed anchors, drivers, families, and account mappings. Original license, insurance, screening, and signed consent documents must be reviewed and stored using your organization's separate secure process. This app stores review attestations, not documents, and performs no automated identity or eligibility verification. Guardian accounts manage one student per family record in this initial version. Driver/family profile email fields do not change the separate sign-in access register.

The real pilot is not ready for transporting students until the operator has completed actual-device testing and confirmed driver eligibility (including age, passenger restrictions and licensing), coverage, guardian consent, operational supervision and emergency response. Review these with the appropriate qualified professionals and institutions; software approval is not legal or insurance approval.

## Integrations and limitations

- Authentication uses Sites' trusted, dispatch-owned ChatGPT identity headers. It does **not** implement Firebase or SMS OTP login. Never expose the raw Worker directly without a trusted authentication gateway that strips forged `oai-authenticated-user-*` headers. The local Worker test harness supplies those headers only on localhost.
- No SMS, push, email delivery, payments, native apps, background GPS, automated matching, public driver discovery, or turn-by-turn navigation inside the app. Opening external navigation is supported.
- Pickup codes and ride/help updates are delivered inside the app. An in-app help request does not contact emergency services, and delivery to a person is not guaranteed. Use phone contact for urgent issues.
- Coordinates are manually registered for approved anchors. Free-form home-address geocoding is intentionally outside this supervised pilot.
- [Leaflet](https://leafletjs.com/reference.html), [OpenStreetMap tiles](https://operations.osmfoundation.org/policies/tiles/), and the [OSRM route API](https://project-osrm.org/docs/v5.24.0/api/) support the prototype maps. Public routing/tiles have no contracted availability guarantee here; select a production service before operational use. Route durations are estimates without traffic.
- GPS requires HTTPS (or localhost), browser permission, foreground execution, and an active connection. Locking the phone or backgrounding the page can stop updates. Coordinate readings and in-app drop-off confirmation do not prove student handoff.
- Records are tenant-scoped JSON documents in D1, accessed through prepared statements and version-checked writes; this small-pilot design does not implement the source document's PostGIS matching service. Only the latest GPS fix is stored, not a breadcrumb replay.
- There is no automated data-retention or backup workflow. Define and configure retention, exports, incident procedures, and backups before collecting production student data. The activity view displays the most recent 100 events.
- Four remaining npm audit findings are moderate, transitive development-tool findings under Drizzle Kit's legacy esbuild loader; they are not included in the deployed Worker. Do not expose local development tooling to an untrusted network. Runtime dependency audit is clean as of the included build.

## Source document scope

`KineticYouth_Requirements.docx` and the supplied posters informed the brand and workflow. The document's proposed React Native/FastAPI/PostGIS/Firebase stack and four-week build sequence were reference material, not instructions to execute. This version prioritizes the user's request for a working basic trial: a single responsive web app with durable records and supervised operations. Native mobile apps, automated notifications, uploaded document verification and the larger-scale architecture remain future work.

## Security and verification

Authorization lives in `lib/server.ts`. Client-selected practice roles are honored only inside that authenticated user's practice namespace. Real membership comes from the verified email register. APIs reject missing identities and cross-origin JSON writes. Entity access is checked on every ride mutation and route lookup; public output omits pickup codes from driver/admin views and unnecessary family/profile fields from other roles. CSV cells that could be interpreted as spreadsheet formulas are escaped.

`tests/api.integration.mjs` exercises the compiled Worker against an isolated local database. The test runner refuses non-loopback targets. See `tests/README.md` for setup. Physical-device GPS behavior, SMS delivery, institutional arrangements and browser visual QA are not verified by this suite.

The lint configuration checks application code strictly. React Compiler eligibility checks are disabled because this app does not enable React Compiler. Generated shadcn wrappers have narrow overrides for rules that cannot infer forwarded children/labels and the library's accessible compound-control patterns.
