'use client';
import Link from 'next/link';
import { postMutation } from '@/lib/client-api';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Check, AlertCircle, X, ArrowRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Shell } from './shell';
import { Pick } from './controls';
import { Dashboard } from './dashboard';
import { ServiceHours, Reports } from './service-hours';
import { ConsumerHome } from './consumer';
import { DriverRegister, FamilyRegister, Anchors } from './registers';
import { Rides } from './rides';
import { Safety, Availability, DriverProfile, Settings } from './operations';
import { AppDialog, type Modal } from './dialogs';
import type { State, Role } from '@/lib/types';
export function PilotApp({
  initialPage = 'overview',
  initialRide,
}: {
  initialPage?: string;
  initialRide?: string;
}) {
  const [data, setData] = useState<State | null>(null),
    [page, setPage] = useState(initialPage),
    [selected, setSelected] = useState(initialRide),
    [modal, setModal] = useState<Modal | null>(null),
    [role, setRole] = useState<Role>('family'),
    [demo, setDemo] = useState(false),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [offline, setOffline] = useState(false);
  const requestId = useRef(0);
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(location.search);
      setDemo(p.get('mode') === 'practice');
      const r = p.get('viewAs');
      setRole(r === 'driver' ? 'driver' : r === 'admin' ? 'admin' : 'family');
      const parts = location.pathname.split('/').filter(Boolean);
      setPage(parts[0] ?? 'overview');
      setSelected(parts[0] === 'rides' ? parts[1] : undefined);
      setModal(null);
      setReady(true);
    };
    read();
    window.addEventListener('popstate', read);
    const off = () => setOffline(true),
      on = () => setOffline(false);
    window.addEventListener('offline', off);
    window.addEventListener('online', on);
    setOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('popstate', read);
      window.removeEventListener('offline', off);
      window.removeEventListener('online', on);
    };
  }, []);
  const fetchState = useCallback(async () => {
    const id = ++requestId.current;
    const res = await fetch(`/api/state?mode=${demo ? 'practice' : 'pilot'}`, {
      headers: { 'x-ky-role': role },
      cache: 'no-store',
    });
    const json = (await res.json()) as State & { error?: string };
    if (!res.ok)
      throw new Error(json.error ?? 'Unable to load your workspace.');
    if (id === requestId.current) {
      setData(json);
      setError('');
      setOffline(false);
    }
    return json as State;
  }, [demo, role]);
  useEffect(() => {
    if (!ready) return;
    setData(null);
    setError('');
    fetchState().catch((e) => setError(e.message));
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible')
        fetchState().catch((e) => setError(e.message));
    }, 5000);
    const resume = () => {
      if (document.visibilityState === 'visible')
        fetchState().catch((e) => setError(e.message));
    };
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('online', resume);
    return () => {
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('online', resume);
      clearInterval(interval);
      // This counter invalidates asynchronous requests; it is not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      requestId.current++;
    };
  }, [fetchState, ready]);
  const navigate = (p: string, id?: string) => {
    setPage(p);
    setSelected(id);
    setModal(null);
    const query = new URLSearchParams();
    if (!demo) query.set('mode', 'pilot');
    else {
      query.set('mode', 'practice');
      query.set('viewAs', role);
    }
    const path =
      (p === 'overview'
        ? '/'
        : `/${p}${id ? '/' + encodeURIComponent(id) : ''}`) +
      (query.size ? '?' + query : '');
    history.pushState({}, '', path);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const changeRole = (v: string) => {
    setData(null);
    setRole(v as Role);
    setPage('overview');
    setSelected(undefined);
    setModal(null);
    history.pushState({}, '', `/?mode=practice&viewAs=${v}`);
  };
  async function commit(body: Record<string, unknown>) {
    if (!navigator.onLine)
      throw new Error('You are offline. Reconnect before saving changes.');
    const result = await postMutation(demo, role, body);
    setMessage(result.message);
    // A successful write must stay successful if the follow-up read loses connectivity.
    await fetchState().catch(() =>
      setError(
        'Saved successfully. Reconnecting to refresh the latest records.',
      ),
    );
    return result;
  }
  useEffect(() => {
    if (!message) return;
    const timeout = setTimeout(() => setMessage(''), 7000);
    return () => clearTimeout(timeout);
  }, [message]);
  const realRole = data?.role ?? role;
  const validPages =
    realRole === 'admin'
      ? [
          'overview',
          'rides',
          'drivers',
          'families',
          'anchors',
          'safety',
          'settings',
          'hours',
          'reports',
        ]
      : realRole === 'driver'
        ? ['overview', 'rides', 'availability', 'profile', 'safety', 'hours']
        : ['overview', 'rides', 'family', 'anchors', 'safety'];
  const visiblePage = validPages.includes(page) ? page : 'overview';
  const props = data ? { state: data, open: setModal, navigate } : null;
  return (
    <Shell
      page={visiblePage}
      onNavigate={navigate}
      name={data?.name ?? 'Your workspace'}
      role={realRole}
      demo={demo}
      completed={
        data?.rides.filter((r) => r.status === 'completed').length ?? 0
      }
      counts={{
        rides: data?.rides.filter((r) => r.status === 'pending').length ?? 0,
        drivers: data?.drivers.filter((d) => d.status === 'review').length ?? 0,
        hours:
          data?.rides.filter(
            (r) =>
              r.status === 'completed' &&
              !data.credits.some((c) => c.rideId === r.id),
          ).length ?? 0,
        safety:
          data?.events.filter((e) => e.kind === 'sos' && !e.resolved).length ??
          0,
      }}
      roleControl={
        demo ? (
          <Pick
            label="Practice view"
            value={role}
            onChange={changeRole}
            items={[
              { value: 'admin', label: 'Admin view' },
              { value: 'driver', label: 'Driver view' },
              { value: 'family', label: 'Family view' },
            ]}
          />
        ) : (
          <span className="badge green">{realRole} · Pilot</span>
        )
      }
    >
      {message && (
        <output
          className="notice"

          style={{ marginBottom: 20, alignItems: 'center' }}
        >
          <Check />
          <span style={{ flex: 1 }}>{message}</span>
          <button
            className="icon-btn"
            aria-label="Dismiss message"
            onClick={() => setMessage('')}
          >
            <X size={15} />
          </button>
        </output>
      )}
      {(error || offline) && (
        <div className="notice error" role="alert" style={{ marginBottom: 20 }}>
          <AlertCircle />
          <div>
            {offline
              ? 'You’re offline. Showing the last loaded records; reconnect to save changes.'
              : error}
            <div className="actions" style={{ marginTop: 10 }}>
              <button
                className="btn small"
                onClick={() => fetchState().catch((e) => setError(e.message))}
              >
                Try again
              </button>
              {!data && (
                <Link className="btn small" href="/login">
                  Sign in / account options
                  <ArrowRight />
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
      {!data && !error && (
        <>
          <div className="page-heading">
            <div>
              <h1>Loading workspace</h1>
              <p>Retrieving records…</p>
            </div>
          </div>
          <div className="stats">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-32 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </>
      )}
      {props && (
        <>
          {visiblePage === 'overview' &&
            (data?.role === 'admin' ? (
              <Dashboard {...props} />
            ) : (
              <ConsumerHome {...props} commit={commit} />
            ))}{' '}
          {visiblePage === 'drivers' && <DriverRegister {...props} />}{' '}
          {(visiblePage === 'families' || visiblePage === 'family') && (
            <FamilyRegister {...props} />
          )}{' '}
          {visiblePage === 'anchors' && <Anchors {...props} />}{' '}
          {visiblePage === 'rides' && (
            <Rides {...props} selected={selected} commit={commit} />
          )}{' '}
          {visiblePage === 'safety' && <Safety {...props} />}{' '}
          {visiblePage === 'availability' && (
            <Availability {...props} commit={commit} />
          )}{' '}
          {visiblePage === 'profile' && <DriverProfile {...props} />}{' '}
          {visiblePage === 'settings' && (
            <Settings {...props} commit={commit} />
          )}
          {visiblePage === 'hours' && (
            <ServiceHours {...props} commit={commit} />
          )}
          {visiblePage === 'reports' && <Reports {...props} />}
        </>
      )}
      {modal && data && (
        <AppDialog
          key={JSON.stringify(modal)}
          modal={modal}
          close={() => setModal(null)}
          state={data}
          commit={commit}
        />
      )}
    </Shell>
  );
}
