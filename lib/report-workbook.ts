import ExcelJS from 'exceljs';
import type { State, Ride, ServiceCredit } from './types';
import { rideTiming, approvedMinutes, creditState } from './service-hours';
type Value = string | number | boolean | Date | null;
type Column = { name: string; width: number; format?: string };
// Excel dates have no timezone. Encode Central wall-clock values and label them CT.
export function centralDate(value?: string | null): Date | null {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return new Date(
    Date.UTC(
      part('year'),
      part('month') - 1,
      part('day'),
      part('hour'),
      part('minute'),
      part('second'),
    ),
  );
}
const stamp = 'mm/dd/yy hh:mm:ss';
const number = '0.00';
export async function reportWorkbook(
  state: State,
  rides: Ride[],
  period: string,
  history: ServiceCredit[] = state.credits,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kinetic Youth';
  workbook.created = new Date(state.serverTime);
  const admin = state.role === 'admin';
  const ids = new Set(rides.map((r) => r.id));
  const credits = state.credits.filter((c) => ids.has(c.rideId));
  const driverIds = new Set(rides.map((r) => r.driverId));
  const drivers = state.drivers.filter((d) => driverIds.has(d.id));
  let index = 0;
  function sheet(name: string, columns: Column[], rows: Value[][]) {
    const page = workbook.addWorksheet(name, {
      views: [{ state: 'frozen', ySplit: 4, xSplit: 1 }],
    });
    page.columns = columns.map((c) => ({
      width: c.width,
      style: { numFmt: c.format },
    }));
    page.mergeCells(1, 1, 1, Math.min(columns.length, 5));
    page.getCell('A1').value = `Kinetic Youth / ${name}`;
    page.getCell('A1').font = {
      name: 'Arial',
      size: 18,
      bold: true,
      color: { argb: 'FF151515' },
    };
    page.getRow(1).height = 34;
    page.mergeCells(2, 1, 2, Math.min(columns.length, 6));
    page.getCell('A2').value =
      `${period} · Central Time · Generated ${state.serverTime}${state.demo ? ' · PRACTICE DATA' : ''}`;
    page.getCell('A2').font = {
      name: 'Arial',
      size: 10,
      color: { argb: 'FF666666' },
    };
    page.getRow(2).height = 27;
    if (rows.length)
      page.addTable({
        name: `KYRecords${++index}`,
        ref: 'A4',
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleLight1', showRowStripes: true },
        columns: columns.map((c) => ({ name: c.name, filterButton: true })),
        rows,
      });
    else page.getRow(4).values = columns.map((c) => c.name);
    page.getRow(4).height = 30;
    page.getRow(4).eachCell((cell) => {
      cell.font = {
        name: 'Arial',
        size: 10,
        bold: true,
        color: { argb: 'FFFFFFFF' },
      };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF171717' },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });
    for (let i = 5; i <= rows.length + 4; i++) {
      const row = page.getRow(i);
      row.height = 32;
      row.eachCell((cell) => {
        cell.font = { name: 'Arial', size: 11, color: { argb: 'FF242424' } };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });
    }
    page.pageSetup = {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      paperSize: 9,
      printTitlesRow: '1:4',
    };
    return page;
  }
  const driver = (id: string | null) => state.drivers.find((d) => d.id === id);
  const family = (id: string) => state.families.find((f) => f.id === id);
  const anchor = (ride: Ride, leg: 'pickup' | 'dropoff') =>
    ride[`${leg}Snapshot`] ??
    state.anchors.find((a) => a.id === ride[`${leg}Id`]);
  sheet(
    'Driver summary',
    [
      { name: 'Driver ID', width: 38 },
      { name: 'Driver', width: 24 },
      { name: 'School', width: 28 },
      { name: 'Completed rides', width: 18 },
      { name: 'Awaiting credit review', width: 22 },
      { name: 'Excluded rides', width: 18 },
      { name: 'Waiting minutes', width: 18, format: number },
      { name: 'Driving minutes', width: 18, format: number },
      { name: 'Recorded service minutes', width: 24, format: number },
      { name: 'Missing service timestamps', width: 24 },
      { name: 'Approved credit minutes', width: 23 },
      { name: 'Approved service hours', width: 23, format: number },
    ],
    drivers.map((d) => {
      const completed = rides.filter(
        (r) => r.driverId === d.id && r.status === 'completed',
      );
      const timings = completed.map(rideTiming);
      return [
        d.id,
        d.name,
        d.school,
        completed.length,
        completed.filter((r) => !credits.some((c) => c.rideId === r.id)).length,
        credits.filter((c) => c.driverId === d.id && c.status === 'excluded')
          .length,
        timings.reduce((n, t) => n + (t.wait ?? 0), 0),
        timings.reduce((n, t) => n + (t.driving ?? 0), 0),
        timings.reduce((n, t) => n + (t.service ?? 0), 0),
        timings.filter((t) => t.service === null).length,
        approvedMinutes(credits, d.id),
        approvedMinutes(credits, d.id) / 60,
      ];
    }),
  );
  const columns: Column[] = [
    { name: 'Ride ID', width: 19 },
    { name: 'Scheduled pickup (CT)', width: 23, format: stamp },
    { name: 'Driver ID', width: 38 },
    { name: 'Driver', width: 24 },
    { name: 'Driver school', width: 28 },
    { name: 'Vehicle at assignment', width: 28 },
    { name: 'Plate at assignment', width: 18 },
    { name: 'Participant records', width: 34 },
    ...(admin
      ? [
          { name: 'Student', width: 23 },
          { name: 'Guardian', width: 23 },
        ]
      : []),
    { name: 'Activity', width: 26 },
    { name: 'Pickup', width: 30 },
    { name: 'Pickup address', width: 40 },
    { name: 'Drop-off', width: 30 },
    { name: 'Drop-off address', width: 40 },
    { name: 'Status', width: 17 },
    ...[
      'Requested',
      'Accepted',
      'Arrived at pickup',
      'Pickup verified',
      'Drop-off confirmed',
      'Cancelled',
    ].map((name) => ({ name: `${name} (CT)`, width: 23, format: stamp })),
    { name: 'Waiting minutes', width: 18, format: number },
    { name: 'Driving minutes', width: 18, format: number },
    { name: 'Recorded service minutes', width: 24, format: number },
    { name: 'Suggested credit minutes', width: 23 },
    { name: 'Credit status', width: 18 },
    { name: 'Credited minutes', width: 18 },
    { name: 'Credited hours', width: 18, format: number },
    { name: 'Reviewed by', width: 30 },
    { name: 'Reviewed at (CT)', width: 23, format: stamp },
    { name: 'Review note', width: 45 },
    { name: 'Drop-off evidence', width: 28 },
    { name: 'Cancellation reason', width: 40 },
    { name: 'Scheduled pickup (UTC ISO)', width: 29 },
    { name: 'Arrival (UTC ISO)', width: 29 },
    { name: 'Drop-off (UTC ISO)', width: 29 },
  ];
  sheet(
    'Ride ledger',
    columns,
    rides.map((r) => {
      const d = r.driverSnapshot ?? driver(r.driverId),
        f = r.familySnapshot ?? family(r.familyId),
        c = credits.find((c) => c.rideId === r.id),
        t = rideTiming(r);
      return [
        r.id,
        centralDate(r.scheduledAt),
        r.driverId,
        d?.name ?? 'Unassigned',
        d?.school ?? '',
        r.driverSnapshot?.vehicle ?? '',
        r.driverSnapshot?.plate ?? '',
        r.familySnapshot && (!r.driverId || r.driverSnapshot)
          ? 'Recorded with ride'
          : 'Legacy: current register fallback',
        ...(admin ? [f?.student ?? '', f?.guardian ?? ''] : []),
        r.activity,
        anchor(r, 'pickup')?.name ?? '',
        anchor(r, 'pickup')?.address ?? '',
        anchor(r, 'dropoff')?.name ?? '',
        anchor(r, 'dropoff')?.address ?? '',
        r.status,
        centralDate(r.createdAt),
        centralDate(r.acceptedAt),
        centralDate(r.arrivedAt),
        centralDate(r.startedAt),
        centralDate(r.completedAt),
        centralDate(r.cancelledAt),
        t.wait,
        t.driving,
        t.service,
        t.suggested,
        creditState(r, c),
        c?.minutes ?? null,
        c ? c.minutes / 60 : null,
        c?.reviewedBy ?? '',
        centralDate(c?.reviewedAt),
        c?.reason ?? '',
        r.completionMethod === 'coordinator_verified'
          ? 'Coordinator verified exception'
          : r.completionMethod === 'driver_gps'
            ? 'Driver device GPS'
            : 'Historical record: not captured',
        r.cancelReason,
        r.scheduledAt,
        r.arrivedAt ?? '',
        r.completedAt ?? '',
      ];
    }),
  );
  sheet(
    'Credit reviews',
    [
      { name: 'Ride ID', width: 19 },
      { name: 'Driver', width: 24 },
      { name: 'Decision', width: 16 },
      { name: 'Credited minutes', width: 18 },
      { name: 'Service hours', width: 18, format: number },
      { name: 'Reviewer', width: 30 },
      { name: 'Reviewed at (CT)', width: 23, format: stamp },
      { name: 'Revision', width: 12 },
      { name: 'Current decision', width: 18 },
      { name: 'Reason', width: 55 },
    ],
    history
      .filter((c) => ids.has(c.rideId))
      .map((c) => [
        c.rideId,
        rides.find((r) => r.id === c.rideId)?.driverSnapshot?.name ??
          driver(c.driverId)?.name ??
          c.driverId,
        c.status,
        c.minutes,
        c.minutes / 60,
        c.reviewedBy,
        centralDate(c.reviewedAt),
        c.revision,
        credits.some(
          (current) =>
            current.rideId === c.rideId && current.revision === c.revision,
        ),
        c.reason,
      ]),
  );
  if (admin) {
    sheet(
      'Activity',
      [
        { name: 'Event ID', width: 38 },
        { name: 'Ride ID', width: 19 },
        { name: 'Occurred at (CT)', width: 23, format: stamp },
        { name: 'Kind', width: 20 },
        { name: 'Event', width: 75 },
        { name: 'Resolved', width: 14 },
        { name: 'Resolution note', width: 55 },
        { name: 'Actor email', width: 34 },
        { name: 'Actor role', width: 16 },
        { name: 'Action', width: 22 },
        { name: 'Record type', width: 18 },
        { name: 'Record ID', width: 38 },
        { name: 'Request ID', width: 38 },
      ],
      state.events
        .filter((e) => !!e.rideId && ids.has(e.rideId))
        .map((e) => [
          e.id,
          e.rideId,
          centralDate(e.createdAt),
          e.kind,
          e.message,
          e.resolved,
          e.note,
          e.actorEmail ?? 'Legacy: actor not recorded',
          e.actorRole ?? '',
          e.action ?? '',
          e.entityKind ?? '',
          e.entityId ?? '',
          e.requestId ?? '',
        ]),
    );
    sheet(
      'Driver register',
      [
        { name: 'Driver ID', width: 38 },
        { name: 'Name', width: 24 },
        { name: 'School', width: 28 },
        { name: 'Email', width: 34 },
        { name: 'Phone', width: 20 },
        { name: 'Approval', width: 16 },
        { name: 'Vehicle', width: 28 },
        { name: 'Plate', width: 16 },
        { name: 'License expiry', width: 18 },
        { name: 'Insurance expiry', width: 18 },
        { name: 'License reviewed', width: 18 },
        { name: 'Insurance reviewed', width: 18 },
        { name: 'Consent reviewed', width: 18 },
        { name: 'Screening reviewed', width: 20 },
        { name: 'SMS consent', width: 16 },
      ],
      drivers.map((d) => [
        d.id,
        d.name,
        d.school,
        d.email,
        d.phone,
        d.status,
        d.vehicle,
        d.plate,
        d.licenseExpiry,
        d.insuranceExpiry,
        d.licenseChecked,
        d.insuranceChecked,
        d.guardianConsent,
        d.screeningChecked,
        d.smsConsent ?? false,
      ]),
    );
    const familyIds = new Set(rides.map((r) => r.familyId));
    sheet(
      'Family register',
      [
        { name: 'Family ID', width: 38 },
        { name: 'Guardian', width: 24 },
        { name: 'Student', width: 24 },
        { name: 'School', width: 28 },
        { name: 'Email', width: 34 },
        { name: 'Phone', width: 20 },
        { name: 'Emergency phone', width: 20 },
        { name: 'Guardian consent', width: 20 },
        { name: 'SMS consent', width: 16 },
      ],
      state.families
        .filter((f) => familyIds.has(f.id))
        .map((f) => [
          f.id,
          f.guardian,
          f.student,
          f.school,
          f.email,
          f.phone,
          f.emergency,
          f.consent,
          f.smsConsent ?? false,
        ]),
    );
    const anchorIds = new Set(rides.flatMap((r) => [r.pickupId, r.dropoffId]));
    sheet(
      'Meeting points',
      [
        { name: 'Location ID', width: 38 },
        { name: 'Name', width: 30 },
        { name: 'Current address', width: 45 },
        { name: 'Latitude', width: 18, format: '0.000000' },
        { name: 'Longitude', width: 18, format: '0.000000' },
        { name: 'Category', width: 20 },
        { name: 'Active', width: 12 },
        { name: 'Instructions', width: 60 },
      ],
      state.anchors
        .filter((a) => anchorIds.has(a.id))
        .map((a) => [
          a.id,
          a.name,
          a.address,
          a.lat,
          a.lng,
          a.category,
          a.active,
          a.notes,
        ]),
    );
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}
