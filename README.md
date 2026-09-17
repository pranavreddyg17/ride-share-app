# Kinetic Youth

Kinetic Youth is a coordinator-led transportation pilot that helps approved families connect students with approved high-school drivers for activities, tutoring, and community programs.

It is designed for a small supervised launch: coordinators run dispatch, families request and track rides, and drivers complete a clear pickup-to-drop-off workflow. The system keeps the service records needed to recognize driver volunteer hours without treating a demo ride as a verified credit.

> **Pilot scope:** This is a mobile-friendly web application for supervised community transportation. It is not a replacement for commercial rideshare infrastructure, emergency services, or adult safety review.

## What it does

- **Coordinator workspace** — manage driver and family registers, meeting points, ride assignments, help requests, activity logs, access grants, and service-hour reviews.
- **Family workspace** — request rides, view the route and driver status, receive a one-time pickup code, and follow progress during an active trip.
- **Driver workspace** — review assignments, publish foreground location while driving, verify pickup, finish the ride, and view approved volunteer hours.
- **Trackable ride records** — captures the schedule, assignment, arrival, pickup verification, drop-off, completion evidence, and the activity history for each ride.
- **Service-hour records** — suggests service time from arrival at pickup through drop-off, including waiting. Only a coordinator-approved review contributes to totals.
- **Operations reporting** — export role-scoped Excel workbooks with a ride ledger, service-credit history, daily totals, analysis data, participant registers, and a reporting guide.

## Safety and access model

Real pilot access is invitation-only. A coordinator grants each approved admin, driver, or family member a role. The application checks that role and its linked record on every request.

- Pickup codes are single-use, time-limited, and limited to the assigned family and driver.
- Driver and guardian contact details are only shown for accepted or active trips.
- GPS updates are accepted only from the assigned approved driver and are validated for freshness, accuracy, and agreed meeting-point proximity.
- An exceptional coordinator close requires a verified time, verification source, a written reason, and an explicit student-arrival confirmation.
- Every important change produces an audit record with the actor, action, record, and request ID.

## Run locally

Requirements: Node 22.13+ and npm.

```bash
npm ci
npm run db:local
npm run dev
```

Open the local URL and select **Practice workspace**. Real admin initialization requires `KY_BOOTSTRAP_ADMIN_EMAIL` in the runtime environment.

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run build
```

The integration suite intentionally targets only an isolated local Worker database. See [tests/README.md](tests/README.md) before running it.

## Architecture

The UI is React/Vinext. Authenticated Worker APIs use Cloudflare D1 for pilot records. The server separates identity and authorization, validation, domain commands, read models, locations, and transactional persistence.

The application preserves historical ride snapshots when a register changes later. It uses idempotency receipts, version checks, conflict guards, and transactional audit/history writes for critical changes.

See [docs/ARCHITECTURE_REVIEW.md](docs/ARCHITECTURE_REVIEW.md) for the design review, [docs/SERVICE_RECORDS.md](docs/SERVICE_RECORDS.md) for reporting definitions, and [docs/IAM_AND_AUDIT.md](docs/IAM_AND_AUDIT.md) for access/audit detail.

## Before a real pilot

Configure production mapping and SMS providers, confirm hosting identity-header protection, connect monitoring and alerts, rehearse recovery, and run an adult-device trial for GPS and handoff workflows. Foreground web tracking does not guarantee background location updates on a locked phone.

Detailed preparation steps are in [docs/TRIAL_RUNBOOK.md](docs/TRIAL_RUNBOOK.md).
