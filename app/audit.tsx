'use client';
import { useState, useEffect } from 'react';
import { Heading } from './dashboard';
import { Field, EmptyState } from './controls';
import { date, time, type State } from '@/lib/types';

type Entry = {
  id: string;
  created_at: string;
  actor_email: string | null;
  actor_role: string | null;
  method: string;
  path: string;
  status: number;
  duration_ms: number;
};
type Page = {
  entries: Entry[];
  nextCursor: string | null;
  retentionDays: number;
};

export function AuditLog({ state }: { state: State }) {
  const [actorInput, setActorInput] = useState('');
  const [filter, setFilter] = useState({ actor: '', result: 'all' });
  const [cursor, setCursor] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setPage(null);
    const params = new URLSearchParams({
      mode: state.demo ? 'practice' : 'pilot',
      ...filter,
    });
    if (cursor) params.set('cursor', cursor);
    fetch('/api/audit?' + params, {
      cache: 'no-store',
      headers: { 'x-ky-role': 'admin' },
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as Page & { error?: string };
        if (!res.ok)
          throw new Error(data.error ?? 'Request logs are unavailable.');
        setPage(data);
      })
      .catch((e: Error) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [state.demo, filter, cursor, refresh]);
  return (
    <>
      <Heading
        title="Request logs"
        description="Trace access, errors, and response times. Times shown in Central Time."
      />
      <p className="muted" style={{ marginBottom: 20 }}>
        Request metadata is kept for 7 days. Ride milestones, access changes,
        and service-credit decisions remain in the activity history and records
        export.
      </p>
      <form
        className="panel"
        style={{ padding: 20, marginBottom: 20 }}
        onSubmit={(e) => {
          e.preventDefault();
          setFilter({ ...filter, actor: actorInput.trim().toLowerCase() });
          setCursor('');
        }}
      >
        <div
          className="actions"
          style={{ alignItems: 'end', flexWrap: 'wrap' }}
        >
          <Field label="Account email">
            <input
              type="email"
              value={actorInput}
              onChange={(e) => setActorInput(e.target.value)}
              placeholder="All accounts"
              maxLength={200}
            />
          </Field>
          <Field label="Result">
            <select
              value={filter.result}
              onChange={(e) => {
                setFilter({ ...filter, result: e.target.value });
                setCursor('');
              }}
            >
              <option value="all">All requests</option>
              <option value="errors">Errors and denied access</option>
            </select>
          </Field>
          <button className="btn primary" disabled={loading}>
            Apply filters
          </button>
          <button
            className="btn"
            type="button"
            disabled={loading}
            onClick={() => {
              setCursor('');
              setRefresh((v) => v + 1);
            }}
          >
            Latest requests
          </button>
        </div>
      </form>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <section className="panel" aria-busy={loading}>
        <div className="table-panel" style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Time (CT)</th>
                <th>Account</th>
                <th>Request</th>
                <th>Status</th>
                <th>Duration</th>
                <th>Request ID</th>
              </tr>
            </thead>
            <tbody>
              {page?.entries.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {date(e.created_at)}
                    <small style={{ display: 'block' }}>
                      {time(e.created_at)}
                    </small>
                  </td>
                  <td>
                    {e.actor_email ??
                      (e.actor_role === 'service'
                        ? 'Notification service'
                        : 'Unauthenticated')}
                    <small className="muted" style={{ display: 'block' }}>
                      {e.actor_role ?? 'No authorized role'}
                    </small>
                  </td>
                  <td>
                    <strong>{e.method}</strong> {e.path}
                  </td>
                  <td>
                    <span
                      className={'badge ' + (e.status >= 400 ? 'red' : 'green')}
                    >
                      {e.status}
                    </span>
                  </td>
                  <td>{e.duration_ms} ms</td>
                  <td>
                    <code style={{ fontSize: 11, userSelect: 'all' }}>
                      {e.id}
                    </code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {loading && (
          <output style={{ display: 'block', padding: 24 }}>
            Loading request records…
          </output>
        )}
        {!loading && !error && !page?.entries.length && (
          <EmptyState
            title="No matching requests"
            description="Change the account or result filter to see more records."
          />
        )}
        {page?.nextCursor && (
          <div style={{ padding: 16 }}>
            <button className="btn" onClick={() => setCursor(page.nextCursor!)}>
              Older requests
            </button>
          </div>
        )}
      </section>
    </>
  );
}
