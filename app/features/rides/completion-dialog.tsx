'use client';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from '@/components/ui/alert-dialog';
import { Field, Pick, Check } from '../../controls';
import type { Commit } from '../../dialogs';
import type { Ride } from '@/lib/types';

function localTime(value: string) {
  const at = new Date(value);
  return new Date(at.getTime() - at.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 19);
}

export function CompletionDialog({
  ride,
  close,
  commit,
}: {
  ride: Ride;
  close: () => void;
  commit: Commit;
}) {
  const [at, setAt] = useState(() => localTime(new Date().toISOString()));
  const [source, setSource] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <AlertDialogContent className="app-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle>Verify a drop-off exception</AlertDialogTitle>
          <AlertDialogDescription>
            Use this when the driver cannot finish in the app. Confirm the
            student arrived with the driver or guardian before closing {ride.id}
            .
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              await commit({
                op: 'ride.action',
                action: 'admin-complete',
                id: ride.id,
                completedAt: new Date(at).toISOString(),
                verifiedWith: source,
                reason,
                confirmed,
              });
              close();
            } catch (error) {
              setError((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="Verified drop-off time"
            hint="Your device’s local time. The record also stores when you submitted it."
          >
            <input
              type="datetime-local"
              step="1"
              min={ride.startedAt ? localTime(ride.startedAt) : undefined}
              required
              value={at}
              onChange={(e) => setAt(e.target.value)}
            />
          </Field>
          <Field label="Drop-off confirmed by">
            <Pick
              label="Drop-off confirmed by"
              value={source}
              onChange={setSource}
              items={[
                { value: 'guardian', label: 'Parent or guardian' },
                { value: 'driver', label: 'Assigned driver' },
                { value: 'in_person', label: 'I witnessed the drop-off' },
              ]}
            />
          </Field>
          <Field label="What happened?">
            <textarea
              required
              minLength={10}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="How you confirmed arrival and why the driver could not complete the ride."
            />
          </Field>
          <Check
            checked={confirmed}
            onChange={setConfirmed}
            label="I verified that the student arrived at the destination."
            hint="This closes the ride. Service credit still requires a separate review."
          />
          {error && (
            <p role="alert" className="error-message">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              type="button"
              className="btn"
              disabled={busy}
              onClick={close}
            >
              Keep ride open
            </button>
            <button
              type="submit"
              className="btn primary"
              disabled={busy || !confirmed || !source}
            >
              {busy ? 'Recording…' : 'Record verified drop-off'}
            </button>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
