'use client';
import { useEffect, useRef, useState, useMemo } from 'react';
import type * as Leaflet from 'leaflet';
import type { Anchor, Ride, Role } from '@/lib/types';
import 'leaflet/dist/leaflet.css';
export type RoadRoute = {
  distance: number;
  duration: number;
  coordinates: number[][];
};
export function RideMap({
  anchors,
  ride,
  demo,
  role,
  onRoute,
  preview,
  full = false,
}: {
  anchors: Anchor[];
  ride?: Ride;
  demo: boolean;
  role: Role;
  onRoute?: (route: RoadRoute) => void;
  preview?: { pickupId: string; dropoffId: string };
  full?: boolean;
}) {
  const node = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    L = useRef<typeof Leaflet | null>(null),
    pins = useRef<Leaflet.LayerGroup | null>(null),
    car = useRef<Leaflet.Marker | null>(null),
    line = useRef<Leaflet.Polyline | null>(null),
    animation = useRef<number>(0);
  const [ready, setReady] = useState(false),
    [error, setError] = useState('');
  const routeCallback = useRef(onRoute);
  useEffect(() => {
    routeCallback.current = onRoute;
  }, [onRoute]);
  const pickupId = ride?.pickupId ?? preview?.pickupId,
    dropoffId = ride?.dropoffId ?? preview?.dropoffId;
  useEffect(() => {
    let stopped = false;
    let observer: ResizeObserver | undefined;
    const abort = new AbortController();
    Promise.all([
      import('leaflet'),
      fetch(`/api/map-config?mode=${demo ? 'practice' : 'pilot'}`, {
        headers: { 'x-ky-role': role },
        signal: abort.signal,
      }).then(async (res) => {
        const config = (await res.json()) as {
          url: string;
          attribution: string;
          error?: string;
        };
        if (!res.ok) throw new Error(config.error ?? 'The map could not load.');
        return config;
      }),
    ])
      .then(([lib, config]) => {
        if (stopped || !node.current) return;
        L.current = lib;
        const instance = lib
          .map(node.current, { zoomControl: false, scrollWheelZoom: false })
          .setView([33.035, -97.06], 12);
        map.current = instance;
        lib.control.zoom({ position: 'topright' }).addTo(instance);
        lib
          .tileLayer(config.url, {
            maxZoom: 19,
            attribution: config.attribution,
          })
          .on('tileerror', () =>
            setError(
              'The map is unavailable. Your ride details are still here.',
            ),
          )
          .addTo(instance);
        pins.current = lib.layerGroup().addTo(instance);
        observer = new ResizeObserver(() => instance.invalidateSize());
        observer.observe(node.current);
        setReady(true);
      })
      .catch((e) => {
        if (!stopped)
          setError(e.message ?? 'The map could not load. Please refresh.');
      });
    return () => {
      stopped = true;
      abort.abort();
      observer?.disconnect();
      cancelAnimationFrame(animation.current);
      map.current?.remove();
      map.current = null;
      car.current = null;
      setReady(false);
    };
  }, [demo, role]);
  const anchorKey = JSON.stringify(
    anchors.map((a) =>
      a.id === ride?.pickupSnapshot?.id
        ? ride.pickupSnapshot
        : a.id === ride?.dropoffSnapshot?.id
          ? ride.dropoffSnapshot
          : a,
    ),
  );
  const stableAnchors = useMemo(
    () => JSON.parse(anchorKey) as Anchor[],
    [anchorKey],
  );
  const rideId = ride?.id;
  useEffect(() => {
    if (!ready || !L.current || !map.current) return;
    const lib = L.current;
    pins.current?.clearLayers();
    const relevant =
      pickupId && dropoffId
        ? stableAnchors.filter((a) => a.id === pickupId || a.id === dropoffId)
        : stableAnchors;
    for (const a of relevant) {
      const isPickup = a.id === pickupId;
      const icon = lib.divIcon({
        html: `<span class="map-endpoint ${isPickup ? 'start' : 'end'}">${pickupId ? (isPickup ? 'A' : 'B') : ''}</span>`,
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
      const text = document.createElement('span');
      text.textContent = a.name;
      lib
        .marker([a.lat, a.lng], { icon, title: a.name })
        .bindTooltip(text, {
          permanent: true,
          direction: 'top',
          offset: [0, -15],
          className: 'map-anchor-label',
        })
        .addTo(pins.current!);
    }
  }, [ready, stableAnchors, pickupId, dropoffId]);
  useEffect(() => {
    if (!ready || !L.current || !map.current) return;
    const lib = L.current;
    if (ride?.lat == null || ride?.lng == null) {
      car.current?.remove();
      car.current = null;
      return;
    }
    const target = lib.latLng(ride.lat, ride.lng);
    if (!car.current) {
      const icon = lib.divIcon({
        html: '<span class="car-marker"><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="2"><path d="m21 8-2 2-1.5-3.7A2 2 0 0 0 15.646 5H8.4a2 2 0 0 0-1.903 1.257L5 10 3 8"/><path d="M7 14h.01M17 14h.01M5 18v2M19 18v2"/><rect width="18" height="8" x="3" y="10" rx="2"/></svg></span>',
        className: '',
        iconSize: [43, 43],
        iconAnchor: [21, 21],
      });
      car.current = lib
        .marker(target, {
          icon,
          title: demo
            ? 'Simulated driver position'
            : 'Last reported driver position',
          zIndexOffset: 1000,
        })
        .addTo(map.current);
    } else {
      cancelAnimationFrame(animation.current);
      const from = car.current.getLatLng();
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        car.current.setLatLng(target);
        return;
      }
      const begin = performance.now();
      const frame = (at: number) => {
        const p = Math.min(1, (at - begin) / 900);
        car.current?.setLatLng([
          from.lat + (target.lat - from.lat) * p,
          from.lng + (target.lng - from.lng) * p,
        ]);
        if (p < 1) animation.current = requestAnimationFrame(frame);
      };
      animation.current = requestAnimationFrame(frame);
    }
    return () => cancelAnimationFrame(animation.current);
  }, [ready, ride?.id, ride?.lat, ride?.lng, demo]);
  useEffect(() => {
    if (!ready || !L.current || !map.current) return;
    const lib = L.current;
    line.current?.remove();
    line.current = null;
    const points = (
      pickupId && dropoffId
        ? stableAnchors.filter((a) => a.id === pickupId || a.id === dropoffId)
        : stableAnchors
    ).map((a) => [a.lat, a.lng] as Leaflet.LatLngTuple);
    if (points.length > 1) {
      const wide = full && map.current.getSize().x > 800;
      map.current.fitBounds(lib.latLngBounds(points), {
        paddingTopLeft: wide ? [480, 85] : [40, 50],
        paddingBottomRight: wide ? [80, 80] : [40, 50],
        maxZoom: 14,
      });
    }
    if (!pickupId || !dropoffId || pickupId === dropoffId) return;
    const abort = new AbortController();
    setError('');
    const params = new URLSearchParams({ mode: demo ? 'practice' : 'pilot' });
    if (rideId) params.set('id', rideId);
    else {
      params.set('pickup', pickupId);
      params.set('dropoff', dropoffId);
    }
    fetch('/api/route?' + params, {
      headers: { 'x-ky-role': role },
      signal: abort.signal,
    })
      .then(async (res) => {
        const data = (await res.json()) as RoadRoute & { error?: string };
        if (!res.ok) throw new Error(data.error);
        if (abort.signal.aborted || !map.current) return;
        line.current = lib
          .polyline(
            data.coordinates.map((v) => [v[1], v[0]] as Leaflet.LatLngTuple),
            {
              color: full ? '#162f3b' : '#158e80',
              weight: full ? 6 : 5,
              opacity: 0.9,
              lineCap: 'round',
            },
          )
          .addTo(map.current);
        routeCallback.current?.(data);
      })
      .catch((e) => {
        if (e.name !== 'AbortError')
          setError(
            'Directions unavailable. Pickup and destination are shown; no route estimate is available.',
          );
      });
    return () => abort.abort();
  }, [ready, rideId, pickupId, dropoffId, stableAnchors, demo, role, full]);
  return (
    <div className={`map-frame ${full ? 'full-map' : ''}`}>
      <div
        ref={node}
        aria-label={ride || preview ? 'Ride route map' : 'Community anchor map'}
      />
      {error && <output className="map-overlay">{error}</output>}
    </div>
  );
}
