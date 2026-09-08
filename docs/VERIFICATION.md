# Release verification — September 8, 2026

This records local verification of the hardening release. It does not certify operational readiness or claim the existing public URL was updated.

| Check | Result |
| --- | --- |
| TypeScript typecheck | Passed |
| Application lint | Passed |
| Production Worker/browser build | Passed |
| Both D1 migrations on isolated test database | Passed |
| Compiled Worker integration suite | 146 assertions passed |
| Provider, client retry and foreground GPS contract tests | 12 tests passed |
| Injected database failure | Ride, activity, outbox and request receipt rolled back together; retry recovered |
| Concurrent booking/assignment | Exactly one conflicting operation accepted |
| Concurrent GPS/arrival | Both persisted without overwriting one another |
| Cross-account tracking | Separate guardian and admin identities received the driver's stored coordinates |
| Unresolved help history | Old open alert retained beyond the recent-activity limit |

The integration suite supplies device coordinates through the API on a compiled local Worker. The GPS unit test uses a fake browser geolocation object. Neither substitutes for physical-device testing. Provider tests use controlled responses; no live SMS was sent. External OSRM availability was excluded from the deterministic suite rather than reported as passing.

## Not verified or completed

- Publishing: the current Sites connection returned project-not-found and no sites. The user confirmed it may be connected to a different account/workspace. The existing hosted app does not include these local changes until a new deployment succeeds.
- Live Mapbox tokens/tiles/directions and Twilio carrier delivery: no provider accounts supplied.
- Unattended notification processing through the production hosting access gateway.
- Production bootstrap/environment configuration and participant onboarding on the live Site.
- Browser interaction/visual QA, moving-device GPS, screen lock, backgrounding and network-loss behavior on real phones.
- Production database backup access and recovery rehearsal, load/capacity testing and independent security assessment.

See [TRIAL_RUNBOOK.md](TRIAL_RUNBOOK.md) for setup and release gates. The source and deployment package are ready to resume from the existing Site when access is restored; avoid creating a replacement project or database.
