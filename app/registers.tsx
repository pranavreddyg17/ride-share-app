'use client';
import { useState } from 'react';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Plus,
  Download,
  ShieldCheck,
  Check,
  Clock,
  MapPin,
  ExternalLink,
  ArrowRight,
  AlertCircle,
  Users,
} from 'lucide-react';
import { Heading, type ViewProps } from './dashboard';
import { Avatar, Badge } from './shell';
import { SearchBox, EmptyState, exportCSV } from './controls';
import { DRIVER_CHECKS, date } from '@/lib/types';
export function DriverRegister({ state, open, navigate }: ViewProps) {
  const [query, setQuery] = useState(''),
    [filter, setFilter] = useState('all'),
    [selected, setSelected] = useState<string | null>(null);
  const drivers = state.drivers.filter(
    (d) =>
      (filter === 'all' || d.status === filter) &&
      `${d.name} ${d.vehicle} ${d.school}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const detail = state.drivers.find((d) => d.id === selected);
  return (
    <>
      <Heading
        title="Driver register"
        description="The people helping your community go further."
      >
        <button
          className="btn"
          disabled={!drivers.length}
          onClick={() =>
            exportCSV(
              'kinetic-youth-drivers.csv',
              drivers.map((d) => ({
                Name: d.name,
                Email: d.email,
                Phone: d.phone,
                School: d.school,
                Status: d.status,
                Vehicle: d.vehicle,
                Plate: d.plate,
                'License expiry': d.licenseExpiry,
                'Insurance expiry': d.insuranceExpiry,
                'Consent reviewed': d.guardianConsent,
                'Screening reviewed': d.screeningChecked,
                Rides: d.rides,
                'Volunteer hours': d.hours.toFixed(1),
              })),
            )
          }
        >
          <Download />
          Export register
        </button>
        <button
          className="btn primary"
          onClick={() => open({ kind: 'driver' })}
        >
          <Plus />
          Add driver
        </button>
      </Heading>
      <div className="toolbar">
        <Tabs value={filter} onValueChange={(v) => setFilter(String(v))}>
          <TabsList style={{ height: 41 }}>
            {[
              { id: 'all', name: 'All drivers' },
              { id: 'review', name: 'Needs review' },
              { id: 'approved', name: 'Approved' },
              { id: 'suspended', name: 'Suspended' },
            ].map((t) => (
              <TabsTrigger
                key={t.id}
                value={t.id}
                style={{ padding: '7px 12px' }}
              >
                {t.name}{' '}
                <span style={{ fontSize: 11, opacity: 0.6 }}>
                  {
                    state.drivers.filter(
                      (d) => t.id === 'all' || d.status === t.id,
                    ).length
                  }
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search drivers or vehicles"
        />
      </div>
      <div className="table-panel">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Driver</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Vehicle</TableHead>
              <TableHead>License expires</TableHead>
              <TableHead>Impact</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {drivers.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <button
                    className="name-cell"
                    style={{
                      textAlign: 'left',
                      background: 'none',
                      border: 0,
                      padding: 0,
                    }}
                    onClick={() => setSelected(d.id)}
                  >
                    <Avatar name={d.name} alt={d.status === 'review'} />
                    <span>
                      <strong>{d.name}</strong>
                      <small>{d.school}</small>
                    </span>
                  </button>
                </TableCell>
                <TableCell>
                  <Badge value={d.status} />
                </TableCell>
                <TableCell>
                  {d.vehicle}
                  <small
                    className="muted"
                    style={{ display: 'block', marginTop: 5, fontSize: 11 }}
                  >
                    {d.plate}
                  </small>
                </TableCell>
                <TableCell
                  style={{
                    color:
                      d.licenseExpiry <
                      new Date(Date.now() + 30 * 86400000)
                        .toISOString()
                        .slice(0, 10)
                        ? '#b68132'
                        : undefined,
                  }}
                >
                  {new Date(d.licenseExpiry + 'T12:00:00').toLocaleDateString(
                    'en-US',
                    { month: 'short', day: 'numeric', year: 'numeric' },
                  )}
                </TableCell>
                <TableCell>
                  {d.rides} rides
                  <small
                    className="muted"
                    style={{ display: 'block', marginTop: 5, fontSize: 11 }}
                  >
                    {d.hours.toFixed(1)} hrs ·{' '}
                    {d.rating ? d.rating.toFixed(1) + ' ★' : 'No ratings'}
                  </small>
                </TableCell>
                <TableCell>
                  <div className="actions">
                    <button
                      className="btn small"
                      onClick={() => open({ kind: 'driver', driver: d })}
                    >
                      {d.status === 'review' ? 'Review' : 'Edit'}
                    </button>
                    {d.status === 'review' && (
                      <button
                        className="text-link"
                        onClick={() =>
                          open({
                            kind: 'driver-status',
                            driver: d,
                            status: 'approved',
                          })
                        }
                      >
                        Approve
                        <ArrowRight />
                      </button>
                    )}
                    {d.status === 'approved' && (
                      <button
                        className="text-link"
                        style={{ color: '#a85450' }}
                        onClick={() =>
                          open({
                            kind: 'driver-status',
                            driver: d,
                            status: 'suspended',
                          })
                        }
                      >
                        Suspend
                      </button>
                    )}
                    {d.status === 'suspended' && (
                      <button
                        className="text-link"
                        onClick={() =>
                          open({
                            kind: 'driver-status',
                            driver: d,
                            status: 'approved',
                          })
                        }
                      >
                        Reapprove
                      </button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!drivers.length && (
          <EmptyState
            title="No drivers found"
            description={
              state.drivers.length
                ? 'Try a different search or status.'
                : 'Add your first volunteer driver to begin the review process.'
            }
            action={state.drivers.length ? undefined : 'Register a driver'}
            onAction={() => open({ kind: 'driver' })}
          />
        )}
      </div>
      <div className="notice" style={{ marginTop: 20 }}>
        <ShieldCheck />
        Approval requires a license and insurance review, consent, and
        screening. A saved checklist records the coordinator’s review; it does
        not verify documents automatically.
      </div>
      <Sheet
        open={!!detail}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <SheetContent
          className="overflow-y-auto"
          style={{ width: 'min(440px,100%)', maxWidth: 440 }}
        >
          {detail && (
            <>
              <SheetHeader style={{ padding: '30px 24px 14px' }}>
                <Avatar name={detail.name} />
                <SheetTitle style={{ fontSize: 23, marginTop: 15 }}>
                  {detail.name}
                </SheetTitle>
                <SheetDescription>
                  {detail.school} · Volunteer driver
                </SheetDescription>
              </SheetHeader>
              <div className="detail-body">
                <Badge value={detail.status} />
                <div className="detail-pair">
                  <span>Phone</span>
                  <a href={`tel:${detail.phone}`}>{detail.phone}</a>
                </div>
                <div className="detail-pair">
                  <span>Email</span>
                  <span style={{ color: '#24556b' }}>{detail.email}</span>
                </div>
                <div className="detail-pair">
                  <span>Vehicle</span>
                  {detail.vehicle}
                </div>
                <div className="detail-pair">
                  <span>Plate</span>
                  {detail.plate}
                </div>
                <div className="detail-pair">
                  <span>Volunteer hours</span>
                  {detail.hours.toFixed(1)}
                </div>
                <h3 className="detail-title">Screening record</h3>
                {DRIVER_CHECKS.map(([key, label]) => (
                  <div key={key} className="step-line">
                    {detail[key] ? (
                      <Check style={{ color: '#19836e' }} />
                    ) : (
                      <Clock />
                    )}
                    <span>{label}</span>
                  </div>
                ))}
                {detail.notes && (
                  <p className="notice" style={{ marginTop: 15 }}>
                    {detail.notes}
                  </p>
                )}
                <h3 className="detail-title">Ride history</h3>
                {state.rides
                  .filter((r) => r.driverId === detail.id)
                  .slice(0, 8)
                  .map((r) => (
                    <button
                      key={r.id}
                      className="detail-pair"
                      style={{
                        width: '100%',
                        background: 'none',
                        borderTop: 0,
                        borderLeft: 0,
                        borderRight: 0,
                      }}
                      onClick={() => {
                        setSelected(null);
                        navigate('rides', r.id);
                      }}
                    >
                      <span>
                        {date(r.scheduledAt)} · {r.activity}
                      </span>
                      <Badge value={r.status} />
                    </button>
                  ))}
                <button
                  className="btn primary"
                  style={{ width: '100%', marginTop: 22 }}
                  onClick={() => {
                    setSelected(null);
                    open({ kind: 'driver', driver: detail });
                  }}
                >
                  Edit profile & review
                </button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
export function FamilyRegister({ state, open }: ViewProps) {
  const [q, setQ] = useState('');
  const families = state.families.filter((f) =>
    `${f.student} ${f.guardian} ${f.school}`
      .toLowerCase()
      .includes(q.toLowerCase()),
  );
  const personal = state.role === 'family';
  return (
    <>
      <Heading
        title={personal ? 'Your family' : 'Family register'}
        description={
          personal
            ? 'Your student, contact details, and ride consent.'
            : 'Keep guardian contacts and student ride permissions in one place.'
        }
      >
        {!personal && (
          <>
            <button
              className="btn"
              disabled={!families.length}
              onClick={() =>
                exportCSV(
                  'kinetic-youth-families.csv',
                  families.map((f) => ({
                    Student: f.student,
                    Guardian: f.guardian,
                    Email: f.email,
                    Phone: f.phone,
                    'Emergency contact': f.emergency,
                    School: f.school,
                    Consent: f.consent ? 'Recorded' : 'Not recorded',
                  })),
                )
              }
            >
              <Download />
              Export register
            </button>
            <button
              className="btn primary"
              onClick={() => open({ kind: 'family' })}
            >
              <Plus />
              Add family
            </button>
          </>
        )}
      </Heading>
      {!personal && (
        <div className="toolbar">
          <SearchBox
            value={q}
            onChange={setQ}
            placeholder="Search students or guardians"
          />
          <span className="muted" style={{ fontSize: 13 }}>
            {families.length} households
          </span>
        </div>
      )}
      <div className="table-panel">
        <Table className="data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Guardian</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Consent</TableHead>
              <TableHead>Rides</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {families.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <div className="name-cell">
                    <Avatar name={f.student} />
                    <span>
                      <strong>{f.student}</strong>
                      <small>{f.school}</small>
                    </span>
                  </div>
                </TableCell>
                <TableCell>{f.guardian}</TableCell>
                <TableCell>
                  {f.email}
                  <small
                    className="muted"
                    style={{ display: 'block', marginTop: 5 }}
                  >
                    {f.phone}
                  </small>
                </TableCell>
                <TableCell>
                  <span className={`badge ${f.consent ? 'green' : 'amber'}`}>
                    {f.consent ? <Check size={12} /> : <Clock size={12} />}{' '}
                    {f.consent ? 'On file' : 'Needed'}
                  </span>
                </TableCell>
                <TableCell>
                  {
                    state.rides.filter(
                      (r) => r.familyId === f.id && r.status === 'completed',
                    ).length
                  }{' '}
                  completed
                </TableCell>
                <TableCell>
                  <button
                    className="btn small"
                    onClick={() => open({ kind: 'family', family: f })}
                  >
                    Edit details
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {!families.length && (
          <EmptyState
            title="No families yet"
            description="Register a guardian and student before scheduling a ride."
            action={personal ? undefined : 'Register a family'}
            onAction={() => open({ kind: 'family' })}
          />
        )}
      </div>
      <div className="notice" style={{ marginTop: 20 }}>
        <Users />
        For this pilot, guardians book and manage rides for students. Registered
        email addresses must also be added to Pilot settings → Account access
        before sign-in can open a household.
      </div>
    </>
  );
}
export function Anchors({ state, open }: ViewProps) {
  return (
    <>
      <Heading
        title="Anchor locations"
        description="Familiar places to meet, learn, and get moving."
      >
        {state.role === 'admin' && (
          <button
            className="btn primary"
            onClick={() => open({ kind: 'anchor' })}
          >
            <Plus />
            Add location
          </button>
        )}
      </Heading>
      {state.demo && (
        <div className="notice warning" style={{ marginBottom: 22 }}>
          <AlertCircle />
          These are example community locations. Participation and meeting
          arrangements have not been confirmed with these organizations.
        </div>
      )}
      <div className="anchor-cards">
        {state.anchors.map((a) => (
          <article className="panel anchor-card" key={a.id}>
            <span className="stat-icon">
              <MapPin />
            </span>
            <h3>{a.name}</h3>
            <p>{a.address}</p>
            <span className="badge teal">{a.category}</span>
            <p style={{ marginTop: 17, minHeight: 65 }}>{a.notes}</p>
            <div
              className="actions"
              style={{ marginTop: 17, justifyContent: 'space-between' }}
            >
              <a
                className="text-link"
                target="_blank"
                rel="noreferrer"
                href={`https://www.google.com/maps/search/?api=1&query=${a.lat},${a.lng}`}
              >
                Open map
                <ExternalLink />
              </a>
              {state.role === 'admin' && (
                <button
                  className="btn small"
                  onClick={() => open({ kind: 'anchor', anchor: a })}
                >
                  Edit
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      {!state.anchors.length && (
        <section className="panel">
          <EmptyState
            title="Where should rides begin?"
            description="Register confirmed schools and community pickup locations to make booking simpler."
            action={state.role === 'admin' ? 'Add an anchor' : undefined}
            onAction={() => open({ kind: 'anchor' })}
          />
        </section>
      )}
    </>
  );
}
