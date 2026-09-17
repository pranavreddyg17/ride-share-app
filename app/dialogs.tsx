'use client';
import { useState } from 'react';
import { CompletionDialog } from './features/rides/completion-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { Star, ShieldCheck, Info, LoaderCircle, Phone } from 'lucide-react';
import { Field, Pick, Check } from './controls';
import {
  DRIVER_CHECKS,
  DEFAULT_SLOTS,
  type State,
  type Driver,
  type Family,
  type Anchor,
  type Ride,
  type Activity,
} from '@/lib/types';
export type Modal =
  | { kind: 'ride' }
  | { kind: 'driver'; driver?: Driver }
  | { kind: 'family'; family?: Family }
  | { kind: 'anchor'; anchor?: Anchor }
  | { kind: 'driver-status'; driver: Driver; status: string }
  | {
      kind:
        | 'assign'
        | 'cancel'
        | 'decline'
        | 'help'
        | 'rating'
        | 'admin-complete';
      ride: Ride;
    }
  | { kind: 'resolve'; event: Activity }
  | { kind: 'member' }
  | { kind: 'member-remove'; email: string };
export type Commit = (
  body: Record<string, unknown>,
) => Promise<{ message: string; id?: string; version?: number }>;
const blankDriver: Driver = {
  id: '',
  name: '',
  email: '',
  phone: '',
  smsConsent: false,
  school: 'Marcus High School',
  dob: '',
  vehicle: '',
  plate: '',
  licenseExpiry: '',
  insuranceExpiry: '',
  status: 'review',
  licenseChecked: false,
  insuranceChecked: false,
  guardianConsent: false,
  screeningChecked: false,
  notes: '',
  availability: DEFAULT_SLOTS,
  createdAt: '',
  hours: 0,
  rides: 0,
  rating: 0,
};
const blankFamily: Family = {
  id: '',
  guardian: '',
  student: '',
  email: '',
  phone: '',
  smsConsent: false,
  school: 'Marcus High School',
  consent: false,
  emergency: '',
  notes: '',
  createdAt: '',
};
export function AppDialog(props: {
  modal: Modal;
  close: () => void;
  state: State;
  commit: Commit;
}) {
  if (props.modal.kind === 'admin-complete')
    return (
      <CompletionDialog
        ride={props.modal.ride}
        close={props.close}
        commit={props.commit}
      />
    );
  return <RecordDialog {...props} />;
}
function RecordDialog({
  modal,
  close,
  state,
  commit,
}: {
  modal: Modal;
  close: () => void;
  state: State;
  commit: Commit;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [driver, setDriver] = useState<Driver>(
    modal.kind === 'driver' && modal.driver ? modal.driver : blankDriver,
  );
  const [family, setFamily] = useState<Family>(
    modal.kind === 'family' && modal.family ? modal.family : blankFamily,
  );
  const [anchor, setAnchor] = useState<Anchor>(
    modal.kind === 'anchor' && modal.anchor
      ? modal.anchor
      : {
          id: '',
          name: '',
          address: '',
          lat: Number.NaN,
          lng: Number.NaN,
          category: 'Community',
          notes: '',
          active: true,
        },
  );
  const [familyId, setFamilyId] = useState(
    state.role === 'family'
      ? (state.recordId ?? '')
      : (state.families[0]?.id ?? ''),
  );
  const [driverId, setDriverId] = useState(''),
    [pickup, setPickup] = useState(
      state.anchors.filter((a) => a.active)[0]?.id ?? '',
    ),
    [dropoff, setDropoff] = useState(
      state.anchors.filter((a) => a.active)[1]?.id ?? '',
    );
  const [at, setAt] = useState(() => {
    const d = new Date(Date.now() + 3600000);
    d.setSeconds(0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  });
  const [activity, setActivity] = useState(''),
    [notes, setNotes] = useState(''),
    [reason, setReason] = useState(''),
    [rating, setRating] = useState(5);
  const [member, setMember] = useState({
    name: '',
    email: '',
    role: 'family',
    recordId: '',
  });
  const titles = {
    ride: 'Schedule a ride',
    driver: driver.id ? 'Review driver profile' : 'Register a driver',
    family: family.id ? 'Family details' : 'Register a family',
    anchor: anchor.id ? 'Edit anchor location' : 'Add an anchor location',
    'driver-status':
      modal.kind === 'driver-status' && modal.status === 'approved'
        ? 'Approve this driver'
        : 'Update driver status',
    assign: 'Assign a driver',
    cancel: 'Cancel this ride',
    decline: 'Return this ride to the coordinator',
    help: 'Request coordinator help',
    rating: 'How was the ride?',
    'admin-complete': 'Record verified drop-off',
    resolve: 'Resolve help request',
    member: 'Grant pilot access',
    'member-remove': 'Revoke pilot access',
  };
  const descriptions = {
    ride: 'Request a ride between community anchor locations. Times are entered in your device’s local time.',
    driver:
      'Keep screening records current. Review original documents securely outside this pilot app.',
    family:
      'One household and student per registration. A guardian manages bookings and pickup codes.',
    anchor:
      'Register a confirmed pickup or drop-off point. Confirm coordinates and meeting instructions before real rides.',
    'driver-status': 'This decision is recorded in the activity log.',
    'member-remove':
      'This person will lose access to real pilot records. Their registration and ride history remain saved.',
    assign:
      'Only approved, current drivers can be assigned. Availability and conflicting trips are checked when you save.',
    cancel: 'Cancellation updates the family and driver’s ride views.',
    decline:
      'Your coordinator will find another driver. The family’s request stays open.',
    help: 'This alerts your coordinator in the app. Text delivery depends on service setup. For immediate danger, call emergency services.',
    rating: 'Your feedback helps the coordinator improve future rides.',
    'admin-complete':
      'Use this only after confirming the student reached the destination. The exception is recorded for review.',
    resolve: 'Record what happened and how this request was handled.',
    member:
      'Enter the exact email verified by your sign-in provider. This grants access to real pilot records.',
  };
  async function submit(e: React.SubmitEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      let payload: Record<string, unknown> = {};
      switch (modal.kind) {
        case 'driver':
          payload = {
            op: 'driver.save',
            id: driver.id || undefined,
            version: driver.version,
            data: driver,
          };
          break;
        case 'family':
          payload = {
            op: 'family.save',
            id: family.id || undefined,
            version: family.version,
            data: family,
          };
          break;
        case 'anchor':
          payload = {
            op: 'anchor.save',
            id: anchor.id || undefined,
            version: anchor.version,
            data: anchor,
          };
          break;
        case 'ride':
          payload = {
            op: 'ride.create',
            familyId,
            driverId,
            pickupId: pickup,
            dropoffId: dropoff,
            scheduledAt: new Date(at).toISOString(),
            activity,
            notes,
          };
          break;
        case 'driver-status':
          payload = {
            op: 'driver.status',
            id: modal.driver.id,
            version: modal.driver.version,
            status: modal.status,
            reason,
          };
          break;
        case 'assign':
          payload = {
            op: 'ride.action',
            id: modal.ride.id,
            action: 'assign',
            driverId,
          };
          break;
        case 'decline':
        case 'cancel':
          payload = {
            op: 'ride.action',
            id: modal.ride.id,
            action: modal.kind,
            reason,
          };
          break;
        case 'help':
          payload = {
            op: 'ride.action',
            id: modal.ride.id,
            action: 'sos',
            reason,
          };
          break;
        case 'rating':
          payload = {
            op: 'ride.action',
            id: modal.ride.id,
            action: 'rating',
            rating,
            feedback: notes,
          };
          break;
        case 'resolve':
          payload = { op: 'event.resolve', id: modal.event.id, note: reason };
          break;
        case 'member-remove':
          payload = { op: 'member.remove', email: modal.email, reason };
          break;
        case 'member':
          payload = { op: 'member.add', ...member };
          break;
      }
      await commit(payload);
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setBusy(false);
    }
  }
  const dField = (
    key: Extract<keyof Driver, string>,
    label: string,
    type = 'text',
    placeholder = '',
  ) => (
    <Field key={key} label={label}>
      <input
        required
        maxLength={200}
        type={type}
        placeholder={placeholder}
        value={typeof driver[key] === 'string' ? driver[key] : ''}
        onChange={(e) => setDriver({ ...driver, [key]: e.target.value })}
      />
    </Field>
  );
  const fField = (
    key: keyof Family,
    label: string,
    type = 'text',
    placeholder = '',
  ) => (
    <Field key={key} label={label}>
      <input
        required
        maxLength={200}
        type={type}
        placeholder={placeholder}
        value={String(family[key])}
        onChange={(e) => setFamily({ ...family, [key]: e.target.value })}
      />
    </Field>
  );
  const destructive =
    modal.kind === 'cancel' ||
    modal.kind === 'admin-complete' ||
    modal.kind === 'member-remove' ||
    (modal.kind === 'driver-status' && modal.status === 'suspended');
  const fields = (
    <form onSubmit={submit} className="modal-form">
      {modal.kind === 'ride' && (
        <>
          {state.anchors.length < 2 && (
            <div className="notice warning">
              <Info />
              The coordinator needs to add at least two anchor locations before
              booking.
            </div>
          )}
          <div className="fields-two">
            {state.role === 'admin' && (
              <Field label="Student">
                <Pick
                  value={familyId}
                  onChange={setFamilyId}
                  label="Student"
                  items={state.families.map((f) => ({
                    value: f.id,
                    label: f.student,
                  }))}
                />
              </Field>
            )}
            <Field
              label="Pickup date & time"
              hint={`Your timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`}
            >
              <input
                type="datetime-local"
                required
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Pickup">
            <Pick
              value={pickup}
              onChange={setPickup}
              label="Pickup"
              items={state.anchors
                .filter((a) => a.active)
                .map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
          <Field label="Destination">
            <Pick
              value={dropoff}
              onChange={setDropoff}
              label="Destination"
              items={state.anchors
                .filter((a) => a.active)
                .map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
          <Field label="Activity">
            <input
              required
              maxLength={100}
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="e.g. Basketball practice"
            />
          </Field>
          {state.role === 'admin' && (
            <Field label="Driver">
              <Pick
                value={driverId}
                onChange={setDriverId}
                label="Driver"
                items={[
                  { value: '', label: 'Match a driver later' },
                  ...state.drivers
                    .filter((d) => d.status === 'approved')
                    .map((d) => ({ value: d.id, label: d.name })),
                ]}
              />
            </Field>
          )}
          <Field label="Pickup notes (optional)">
            <textarea
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Details the driver and family should know"
            />
          </Field>
          <div className="notice">
            <ShieldCheck />
            Guardian consent is checked before booking. The family can view trip
            status and the pickup code after the driver arrives.
          </div>
        </>
      )}
      {modal.kind === 'driver' && (
        <>
          <div className="fields-two">
            {dField('name', 'Full name')}
            {dField('dob', 'Date of birth', 'date')}
            {dField('email', 'Email', 'email')}
            {dField('phone', 'Phone', 'tel', '+12145550123')}
          </div>
          {dField('school', 'School')}
          <Check
            checked={driver.smsConsent === true}
            onChange={(v) => setDriver({ ...driver, smsConsent: v })}
            label={
              state.role === 'driver'
                ? 'I agree to receive operational text alerts at my registered number.'
                : 'This driver agreed to receive operational text alerts at their registered number.'
            }
          />
          <div className="fields-two">
            {dField('vehicle', 'Vehicle / color', 'text', 'White Honda Civic')}
            {dField('plate', 'License plate')}
            {dField('licenseExpiry', 'License expires', 'date')}
            {dField('insuranceExpiry', 'Insurance expires', 'date')}
          </div>
          {state.role === 'admin' && (
            <div className="details-list" style={{ margin: '6px 0 20px' }}>
              {DRIVER_CHECKS.map(([key, label]) => (
                <Check
                  key={key}
                  label={label}
                  checked={driver[key]}
                  onChange={(v) => setDriver({ ...driver, [key]: v })}
                />
              ))}
            </div>
          )}
          {state.role === 'admin' && (
            <Field label="Review notes (optional)">
              <textarea
                maxLength={1000}
                value={driver.notes}
                onChange={(e) =>
                  setDriver({ ...driver, notes: e.target.value })
                }
                placeholder="Record verification dates and follow-up items. Do not paste license numbers."
              />
            </Field>
          )}
          <div className="notice warning">
            <Info />
            {state.role === 'driver'
              ? 'Changing identity, vehicle, or document dates requires a new review. Contact and text-consent updates keep your current approval.'
              : 'Saving a profile does not approve it. Complete the review, then choose Approve from the register.'}
          </div>
        </>
      )}
      {modal.kind === 'family' && (
        <>
          <div className="fields-two">
            {fField('guardian', 'Guardian name')}
            {fField('student', 'Student name')}
            {fField('email', 'Guardian email', 'email')}
            {fField('phone', 'Guardian phone', 'tel', '+12145550123')}
          </div>
          {fField('school', 'School')}
          {fField(
            'emergency',
            'Emergency contact phone',
            'tel',
            '+12145550123',
          )}
          <Field label="Coordination notes (optional)">
            <textarea
              maxLength={1000}
              value={family.notes}
              onChange={(e) => setFamily({ ...family, notes: e.target.value })}
            />
          </Field>
          <Check
            checked={family.consent}
            onChange={(v) => setFamily({ ...family, consent: v })}
            label={
              state.role === 'family'
                ? 'I am the guardian and consent to coordinated rides for this student.'
                : 'Guardian consent has been obtained and recorded.'
            }
            hint="Keep the signed consent and emergency plan in your organization’s secure records."
          />
          <Check
            checked={family.smsConsent === true}
            onChange={(v) => setFamily({ ...family, smsConsent: v })}
            label="The guardian agreed to receive operational text alerts at this number."
            hint="Only enable after you have recorded their communication consent."
          />
        </>
      )}
      {modal.kind === 'anchor' && (
        <>
          <Field label="Location name">
            <input
              required
              value={anchor.name}
              onChange={(e) => setAnchor({ ...anchor, name: e.target.value })}
            />
          </Field>
          <Field label="Street address">
            <input
              required
              value={anchor.address}
              onChange={(e) =>
                setAnchor({ ...anchor, address: e.target.value })
              }
            />
          </Field>
          <div className="fields-two">
            <Field label="Latitude">
              <input
                required
                type="number"
                step="any"
                min="-90"
                max="90"
                value={Number.isFinite(anchor.lat) ? anchor.lat : ''}
                onChange={(e) =>
                  setAnchor({ ...anchor, lat: e.target.valueAsNumber })
                }
              />
            </Field>
            <Field label="Longitude">
              <input
                required
                type="number"
                step="any"
                min="-180"
                max="180"
                value={Number.isFinite(anchor.lng) ? anchor.lng : ''}
                onChange={(e) =>
                  setAnchor({ ...anchor, lng: e.target.valueAsNumber })
                }
              />
            </Field>
          </div>
          <Field label="Location type">
            <Pick
              label="Location type"
              value={anchor.category}
              onChange={(v) => setAnchor({ ...anchor, category: v })}
              items={[
                'School',
                'Recreation',
                'Learning',
                'Sports',
                'Community',
              ].map((v) => ({ value: v, label: v }))}
            />
          </Field>
          <Field label="Meeting instructions">
            <textarea
              value={anchor.notes}
              onChange={(e) => setAnchor({ ...anchor, notes: e.target.value })}
            />
          </Field>
          <Check
            checked={anchor.active}
            onChange={(active) => setAnchor({ ...anchor, active })}
            label="Available for new ride requests"
            hint="Existing rides retain their agreed meeting point."
          />
        </>
      )}
      {modal.kind === 'assign' && (
        <Field label="Approved driver">
          <Pick
            value={driverId}
            onChange={setDriverId}
            label="Approved driver"
            items={state.drivers
              .filter((d) => d.status === 'approved')
              .map((d) => ({ value: d.id, label: `${d.name} · ${d.vehicle}` }))}
          />
        </Field>
      )}
      {[
        'driver-status',
        'cancel',
        'decline',
        'help',
        'resolve',
        'member-remove',
      ].includes(modal.kind) && (
        <Field
          label={
            modal.kind === 'resolve' ? 'Resolution notes' : 'Reason / details'
          }
        >
          <textarea
            required
            minLength={4}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Add a short note for the activity log"
          />
        </Field>
      )}
      {modal.kind === 'help' && (
        <div className="notice warning">
          <Phone />
          <div>
            Immediate danger?{' '}
            <a href="tel:911">
              <strong>Call 911</strong>
            </a>
            .{' '}
            {state.settings.contactPhone ? (
              <a href={`tel:${state.settings.contactPhone}`}>
                Call your coordinator at {state.settings.contactPhone}.
              </a>
            ) : (
              'A coordinator phone number has not been configured.'
            )}
          </div>
        </div>
      )}
      {modal.kind === 'rating' && (
        <>
          <fieldset className="rate-buttons" aria-label="Rate your ride">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                type="button"
                aria-label={`${n} stars`}
                aria-pressed={rating === n}
                key={n}
                onClick={() => setRating(n)}
              >
                <Star fill={n <= rating ? '#b7b7b7' : 'none'} size={30} />
              </button>
            ))}
          </fieldset>
          <Field label="Anything to share? (optional)">
            <textarea
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>
        </>
      )}
      {modal.kind === 'member' && (
        <>
          <Field label="Full name">
            <input
              required
              value={member.name}
              onChange={(e) => setMember({ ...member, name: e.target.value })}
            />
          </Field>
          <Field label="Sign-in email">
            <input
              type="email"
              required
              value={member.email}
              onChange={(e) => setMember({ ...member, email: e.target.value })}
            />
          </Field>
          <Field label="Account role">
            <Pick
              label="Account role"
              value={member.role}
              onChange={(v) => setMember({ ...member, role: v, recordId: '' })}
              items={[
                { value: 'family', label: 'Family / guardian' },
                { value: 'driver', label: 'Driver' },
                { value: 'admin', label: 'Administrator' },
              ]}
            />
          </Field>
          {member.role !== 'admin' && (
            <Field label="Link to registered record">
              <Pick
                label="Link to registered record"
                value={member.recordId}
                onChange={(v) => setMember({ ...member, recordId: v })}
                items={
                  member.role === 'driver'
                    ? state.drivers.map((d) => ({ value: d.id, label: d.name }))
                    : state.families.map((f) => ({
                        value: f.id,
                        label: f.guardian + ' · ' + f.student,
                      }))
                }
              />
            </Field>
          )}
          <div className="notice warning">
            <Info />
            The public site can be opened by anyone. Only accounts listed here
            can access real pilot records.
          </div>
        </>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="btn" onClick={close} disabled={busy}>
          Close
        </button>
        <button
          type="submit"
          className={`btn ${destructive ? 'danger' : 'primary'}`}
          disabled={
            busy ||
            (modal.kind === 'ride' &&
              (state.anchors.length < 2 || !familyId)) ||
            (modal.kind === 'assign' && !driverId)
          }
        >
          {busy && <LoaderCircle className="spinner" />}
          {modal.kind === 'ride'
            ? 'Request ride'
            : modal.kind === 'help'
              ? 'Record help request'
              : modal.kind === 'driver-status'
                ? 'Confirm status'
                : modal.kind === 'cancel'
                  ? 'Cancel ride'
                  : modal.kind === 'admin-complete'
                    ? 'Record drop-off'
                    : modal.kind === 'member'
                      ? 'Grant access'
                      : modal.kind === 'decline'
                        ? 'Return request'
                        : 'Save changes'}
        </button>
      </div>
    </form>
  );
  if (destructive)
    return (
      <AlertDialog
        open
        onOpenChange={(v) => {
          if (!v && !busy) close();
        }}
      >
        <AlertDialogContent className="modal-content">
          <AlertDialogHeader>
            <AlertDialogTitle>{titles[modal.kind]}</AlertDialogTitle>
            <AlertDialogDescription>
              {descriptions[modal.kind]}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {fields}
        </AlertDialogContent>
      </AlertDialog>
    );
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v && !busy) close();
      }}
    >
      <DialogContent className="modal-content">
        <DialogHeader>
          <DialogTitle>{titles[modal.kind]}</DialogTitle>
          <DialogDescription>{descriptions[modal.kind]}</DialogDescription>
        </DialogHeader>
        {fields}
      </DialogContent>
    </Dialog>
  );
}
