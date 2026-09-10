import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { load } from '@2gis/mapgl';
import { X, Route, MapPin, Clock, AlertTriangle, Loader2, Repeat, Pencil, CheckCircle2, FlaskConical, ArrowLeft } from 'lucide-react';
import api from '../utils/api';
import { getDeliveryLatLng } from '../utils/deliveryCoords';
import { formatBusinessTime, formatClockFromSecondsSinceMidnight, toBusinessComponents } from '../utils/businessTime';

// Driver Routes map, rendered with 2GIS MapGL. Shows the day's deliveries grouped
// by driver, numbered in route order, with a road-following line (2GIS Routing
// API, live traffic) when a single driver is selected.

// @2gis/mapgl's load() only dedupes *after* its script has finished loading —
// calling it again while a load is still in flight (exactly what React
// StrictMode's dev-only mount → cleanup → mount does) injects a second
// <script> tag, which throws on its own top-level re-execution. That throw
// surfaces as a content-free "Script error." because the browser treats a
// cross-origin script's runtime errors as opaque. A module-level singleton
// promise makes sure load() is only ever actually invoked once per page,
// regardless of how many times (or how quickly) this effect re-fires.
let mapglLoadPromise = null;
function loadMapglOnce() {
  if (!mapglLoadPromise) mapglLoadPromise = load();
  return mapglLoadPromise;
}
const API_KEY = process.env.REACT_APP_2GIS_API_KEY || '';
const ROUTING_URL = 'https://routing.api.2gis.com/routing/7.0.0/global';
const MAX_ROUTING_POINTS = 10; // points per routing request; longer routes are chunked
const DUBAI_CENTER = [55.2708, 25.2048]; // MapGL uses [lng, lat]
const MAP_ID = 'driver-route-map-2gis';
const ALL = 'all';
const UNASSIGNED = 'unassigned';
const UNASSIGNED_COLOR = '#6b7280';
const DRIVER_COLORS = [
  '#2563eb', '#dc2626', '#059669', '#d97706', '#7c3aed', '#db2777',
  '#0891b2', '#65a30d', '#ea580c', '#4f46e5', '#0d9488', '#b45309'
];
// Server-resolved coordinates (Maps-link extraction / geocoding) for deliveries
// with nothing stored — remembered for the session so reopening is instant.
const resolvedCoordsCache = new Map();
const RESOLVE_BATCH = 150;

const driverDisplayName = (driver) => {
  if (!driver) return 'Unassigned';
  const parts = [driver.profile?.firstName, driver.profile?.lastName].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : driver.email || 'Driver';
};

// Optimized order first (routeOrder), then scheduled time for unoptimized days.
const stopSort = (a, b) => {
  const ao = a.routeOrder ?? null;
  const bo = b.routeOrder ?? null;
  if (ao !== null && bo !== null && ao !== bo) return ao - bo;
  if (ao !== null && bo === null) return -1;
  if (ao === null && bo !== null) return 1;
  const at = a.scheduledTime ? new Date(a.scheduledTime).getTime() : Infinity;
  const bt = b.scheduledTime ? new Date(b.scheduledTime).getTime() : Infinity;
  return at - bt;
};

const escapeAttr = (s) => String(s || '').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// "HH:MM" -> seconds-from-midnight, for the simulation's time inputs.
const clockToSeconds = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60;
};

// Scheduled delivery time, as seconds since business-timezone midnight — the
// same basis every pin's color is drawn from, so two drivers' maps use a
// directly comparable scale.
const scheduledSecondsOf = (scheduledTime) => {
  const c = toBusinessComponents(scheduledTime);
  return c ? c.hours * 3600 + c.minutes * 60 : null;
};

// Owner (2026-09-09): "we have 3am,4am,...10am — create a color code for
// this timing" — a fixed color per delivery HOUR (not a continuous gradient
// scaled to whatever's on screen), so a given hour reads as the same color
// every time you open the map, and doubles as this same list's filter chips.
const HOUR_COLORS = {
  3: '#1d4ed8',  // blue
  4: '#0891b2',  // cyan
  5: '#059669',  // emerald
  6: '#65a30d',  // lime
  7: '#ca8a04',  // amber
  8: '#ea580c',  // orange
  9: '#dc2626',  // red
  10: '#db2777'  // pink
};
const TIMING_HOURS = [3, 4, 5, 6, 7, 8, 9, 10];
const OTHER_HOUR_COLOR = '#9ca3af'; // outside 3am-10am, or no scheduled time
const NO_TIME_COLOR = OTHER_HOUR_COLOR;

const hourOf = (seconds) => (seconds == null ? null : Math.floor(seconds / 3600));
const colorForHour = (hour) => (hour != null && HOUR_COLORS[hour]) || OTHER_HOUR_COLOR;

const clock = formatClockFromSecondsSinceMidnight;

const fmtDuration = (seconds) => {
  const m = Math.round((seconds || 0) / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
};

// Within a minute either way reads as "on time" rather than a spurious "1m early".
const ON_TIME_TOLERANCE_SECONDS = 60;
// Server decides the status against the 3-hour window (late = after the
// scheduled time, early = before the window opens); this only renders it.
function stopStatusLabel(stopEta) {
  if (!stopEta || !stopEta.status) return null;
  if (stopEta.status === 'late' && stopEta.lateSeconds > ON_TIME_TOLERANCE_SECONDS) {
    return { text: `${fmtDuration(stopEta.lateSeconds)} late`, className: 'text-amber-600' };
  }
  if (stopEta.status === 'early' && stopEta.earlySeconds > ON_TIME_TOLERANCE_SECONDS) {
    return { text: `${fmtDuration(stopEta.earlySeconds)} early`, className: 'text-blue-600' };
  }
  return { text: 'on time', className: 'text-emerald-600' };
}

// `color` may be a hex string or an hsl(...) string (pins are colored by
// scheduled time, not a fixed per-driver hex palette) — the active-state ring
// below is drawn as a separate rgba() shadow layer rather than appending an
// alpha suffix to `color` itself, since that only works for hex.
const markerHtml = (n, color, active, done, approx, editable) =>
  `<div style="width:28px;height:28px;border-radius:9999px;background:${color};` +
  `border:${editable ? 3 : active ? 3 : 2}px ${editable ? 'dashed #fff' : approx ? 'dashed #fff' : 'solid #fff'};` +
  `box-shadow:0 1px 4px rgba(0,0,0,.45)${active ? ',0 0 0 4px rgba(37,99,235,.35)' : ''}${editable ? ',0 0 0 3px #ffffffaa' : ''};color:#fff;` +
  `font:700 12px/${active ? 22 : 24}px system-ui,sans-serif;text-align:center;cursor:${editable ? 'grab' : 'pointer'};user-select:none;` +
  `opacity:${done ? 0.55 : 1}">${n}</div>`;

// Where a bike collects its trip-2 bags from a van (a kitchen return reuses
// the depot marker instead).
const meetingHtml = (label) =>
  `<div title="${escapeAttr(label)}" style="width:32px;height:32px;border-radius:9999px;background:#7c3aed;border:2px solid #fff;` +
  `box-shadow:0 1px 4px rgba(0,0,0,.5);font:15px/28px system-ui,sans-serif;text-align:center;color:#fff">🚐</div>`;

const depotHtml = (label) =>
  `<div title="${escapeAttr(label)}" style="width:32px;height:32px;border-radius:8px;background:#111827;border:2px solid #fff;` +
  `box-shadow:0 1px 4px rgba(0,0,0,.5);font:16px/28px system-ui,sans-serif;text-align:center">🏠</div>`;

// A van the dispatcher has marked as a Simulation hub — shown at roughly
// where that van is/works today, so choosing a hub isn't just picking a name
// off a list (owner, 2026-09-09: "I should be able to pin his location on
// the map").
const hubVanHtml = (label) =>
  `<div title="${escapeAttr(label)}" style="width:34px;height:34px;border-radius:8px;background:#ea580c;border:2px solid #fff;` +
  `box-shadow:0 1px 4px rgba(0,0,0,.5);font:16px/30px system-ui,sans-serif;text-align:center;color:#fff">🚚</div>`;

// 2GIS returns geometry as WKT "LINESTRING(lng lat, lng lat, …)".
function parseWkt(selection) {
  if (typeof selection !== 'string') return [];
  const m = selection.match(/LINESTRING\s*\((.*)\)/i);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((pt) => pt.trim().split(/\s+/).map(Number))
    .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat));
}

async function fetchRoadRoute(points) {
  const chunks = [];
  for (let i = 0; i < points.length - 1; i += MAX_ROUTING_POINTS - 1) {
    chunks.push(points.slice(i, i + MAX_ROUTING_POINTS));
  }
  const coords = [];
  let distanceM = 0;
  let durationS = 0;
  for (const chunk of chunks) {
    const resp = await fetch(`${ROUTING_URL}?key=${encodeURIComponent(API_KEY)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: chunk.map((p) => ({ type: 'stop', lon: p.lng, lat: p.lat })),
        transport: 'driving',
        output: 'detailed'
      })
    });
    if (!resp.ok) throw new Error(`2GIS routing HTTP ${resp.status}`);
    const data = await resp.json();
    const result = Array.isArray(data.result) ? data.result[0] : null;
    if (!result || !Array.isArray(result.maneuvers)) {
      throw new Error(data.message || 'No route returned');
    }
    result.maneuvers.forEach((mv) => {
      (mv.outcoming_path?.geometry || []).forEach((g) => {
        parseWkt(g.selection).forEach((c) => {
          const last = coords[coords.length - 1];
          if (!last || last[0] !== c[0] || last[1] !== c[1]) coords.push(c);
        });
      });
    });
    distanceM += Number(result.total_distance) || 0;
    durationS += Number(result.total_duration) || 0;
  }
  if (coords.length < 2) throw new Error('Empty route geometry');
  return { coords, distanceM, durationS };
}

const toLngLat = (p) => [p.lng, p.lat];

function fitMapTo(map, pts) {
  if (!map || pts.length === 0) return;
  if (pts.length === 1) {
    map.setCenter(pts[0]);
    map.setZoom(14);
    return;
  }
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  pts.forEach(([lng, lat]) => {
    minLng = Math.min(minLng, lng); maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
  });
  map.fitBounds(
    { southWest: [minLng, minLat], northEast: [maxLng, maxLat] },
    { padding: { top: 60, right: 60, bottom: 60, left: 60 }, maxZoom: 15 }
  );
}

const safeDestroy = (obj) => { try { obj?.destroy(); } catch (_) { /* already gone */ } };

// 2GIS's HtmlMarker has no built-in "draggable" option, but it does give us
// the two primitives needed to build one: setCoordinates on the marker, and
// map.unproject to turn a pointer's pixel position into a real [lng, lat].
// Only attached to a marker's own HTML content, so it never fights with the
// map's own pan/zoom gestures happening elsewhere on the canvas.
function makeMarkerDraggable(marker, map, container, onDrop) {
  const el = marker.getContent();
  const toLngLat = (evt) => {
    const rect = container.getBoundingClientRect();
    return map.unproject([evt.clientX - rect.left, evt.clientY - rect.top]);
  };
  let dragging = false;
  const onMove = (evt) => {
    if (!dragging) return;
    marker.setCoordinates(toLngLat(evt));
  };
  const onUp = (evt) => {
    if (!dragging) return;
    dragging = false;
    el.style.cursor = 'grab';
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    onDrop(toLngLat(evt));
  };
  const onDown = (evt) => {
    evt.stopPropagation();
    dragging = true;
    el.style.cursor = 'grabbing';
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };
  el.style.cursor = 'grab';
  el.title = 'Drag to correct this location';
  el.addEventListener('pointerdown', onDown);
}

// Destroying a mapgl.Map shortly after creating it (closing the modal before
// the map's internal async init — key validation / style load — has settled)
// leaves that internal promise chain rejecting with a bare `undefined` reason
// somewhere inside the (minified, third-party) SDK. It's cosmetic — the map
// itself tears down fine — but an unhandled rejection is still worth not
// leaving lying around. Scope a listener narrowly to the few hundred ms right
// after this specific destroy call, and only swallow that exact signature
// (reason === undefined) so a real bug elsewhere is never masked.
function destroyMapSuppressingSdkNoise(map) {
  if (!map) return;
  const onRejection = (e) => { if (e.reason === undefined) e.preventDefault(); };
  window.addEventListener('unhandledrejection', onRejection);
  setTimeout(() => window.removeEventListener('unhandledrejection', onRejection), 500);
  safeDestroy(map);
}

function DriverRouteMap2GIS({ open, onClose, deliveries = [], drivers = [], date, onOptimizeRoutes, asPage = false, onDateChange }) {
  const [selected, setSelected] = useState(ALL);
  const [depot, setDepot] = useState(null); // null = not loaded, false = not configured
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [route, setRoute] = useState({ status: 'idle' });
  const [resolved, setResolved] = useState({}); // deliveryId -> { lat, lng, source }
  const [resolving, setResolving] = useState(0);
  const [eta, setEta] = useState({ status: 'idle' }); // { status, departure, totals, windowSeconds, byId: { [deliveryId]: stop } }
  // Manual pin corrections made in this session — {deliveryId: {lat, lng}}.
  // Takes priority over both the stored location and any geocoded guess, so a
  // fix is reflected immediately without waiting for a refetch.
  const [manualOverrides, setManualOverrides] = useState({});
  const [editMode, setEditMode] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [saveMsg, setSaveMsg] = useState(null); // { text, error }

  // Filter by scheduled-time hour (owner, 2026-09-09) — the same hour buckets
  // (and colors) the pins/legend use. Empty = show every hour, same "no
  // filter" convention as DispatcherDesktop's own Timing filter.
  const [timingFilters, setTimingFilters] = useState([]);

  // "What if" simulation (owner, 2026-09-09): set rules — kitchen departure
  // time, a van as hub with a ready-by time, bike trip capacity — and preview
  // the resulting plan on this same map. Read-only: it calls the same
  // never-writes optimizeRoutes the Optimize Routes modal previews with, and
  // never calls apply — real assignments are untouched either way.
  const [simMode, setSimMode] = useState(false);
  const [simDeparture, setSimDeparture] = useState('');
  const [simBikeCapacity, setSimBikeCapacity] = useState('');
  const [simHubVanIds, setSimHubVanIds] = useState([]);
  const [simHubReady, setSimHubReady] = useState({}); // driverId -> 'HH:MM'
  // Which drivers/areas take part in the run — "excluded" (not "included") so
  // the default (nothing excluded) means "everyone/everywhere," matching what
  // the map already shows without the dispatcher having to opt every driver
  // back in first.
  const [simExcludedDriverIds, setSimExcludedDriverIds] = useState([]);
  const [simExcludedAreas, setSimExcludedAreas] = useState([]);
  const [simStatus, setSimStatus] = useState('idle'); // idle | loading | ok | error
  const [simError, setSimError] = useState('');
  const [simPlan, setSimPlan] = useState(null);

  const mapglRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const lineRef = useRef(null);
  const returnLineRef = useRef(null); // dashed leg back to the kitchen
  const etaCacheRef = useRef(new Map());
  const routeCacheRef = useRef(new Map());
  const activeRowRef = useRef(null);

  // deliveryId -> where the simulated plan put it (or nothing, if the sim
  // left it unassigned/unresolved) — active only while simMode is on AND a
  // plan has been run, so turning Simulate off always falls straight back to
  // the real map with no stale overrides.
  const simMetaByDeliveryId = useMemo(() => {
    const m = new Map();
    if (!simMode || !simPlan) return m;
    (simPlan.routes || []).forEach((r) => {
      r.stops.forEach((s) => {
        m.set(s.deliveryId, {
          driverId: r.driverId, vehicleType: r.vehicleType, routeOrder: s.routeOrder, hubReadySeconds: r.hubReadySeconds
        });
      });
    });
    return m;
  }, [simMode, simPlan]);
  const simulating = simMode && simPlan != null;

  // Every distinct area/zone across today's deliveries, for the Simulation's
  // "exclude areas" picker.
  const areaOptionsForSim = useMemo(() => {
    const zones = new Set();
    deliveries.forEach((d) => { if (d.zone && d.zone.trim()) zones.add(d.zone.trim()); });
    return [...zones].sort((a, b) => a.localeCompare(b));
  }, [deliveries]);

  // Roughly where each driver is/works today (their first resolvable real
  // stop) — used only to place the hub-van pin on the map, independent of
  // whatever the simulation's own result later says.
  const driverAnchorPoint = useMemo(() => {
    const m = new Map();
    for (const d of deliveries) {
      const driverId = d.driver?._id ? String(d.driver._id) : (typeof d.driver === 'string' ? d.driver : null);
      if (!driverId || m.has(driverId)) continue;
      const coords = manualOverrides[d._id] || getDeliveryLatLng(d, depot || null) || resolved[d._id] || null;
      if (coords) m.set(driverId, coords);
    }
    return m;
  }, [deliveries, manualOverrides, depot, resolved]);

  // Group the day's deliveries by driver, splitting out those with no usable location.
  const groups = useMemo(() => {
    const byId = new Map();
    drivers.forEach((d, i) => {
      byId.set(String(d._id), {
        id: String(d._id),
        name: driverDisplayName(d),
        vehicleType: d.profile?.vehicleType || '',
        color: DRIVER_COLORS[i % DRIVER_COLORS.length],
        stops: [],
        missing: []
      });
    });
    const unassigned = { id: UNASSIGNED, name: 'Unassigned', vehicleType: '', color: UNASSIGNED_COLOR, stops: [], missing: [] };

    // Filter by timing hour (owner, 2026-09-09) — applied before grouping so
    // marker counts, the driver dropdown, and the side list all agree.
    const timingFiltered = timingFilters.length === 0
      ? deliveries
      : deliveries.filter((d) => timingFilters.includes(hourOf(scheduledSecondsOf(d.scheduledTime))));

    timingFiltered.forEach((d) => {
      // Simulating overrides who a delivery is "assigned to" and its stop
      // order with the what-if plan's answer — a delivery the simulation
      // left unassigned falls into the Unassigned bucket, same as real life.
      const simMeta = simMetaByDeliveryId.get(d._id);
      const driverId = simulating
        ? (simMeta ? simMeta.driverId : null)
        : (d.driver?._id ? String(d.driver._id) : (typeof d.driver === 'string' ? d.driver : null));
      let group = driverId ? byId.get(driverId) : unassigned;
      if (driverId && !group) {
        // Assigned to a driver not in the current list (e.g. inactive) — still show them.
        group = {
          id: driverId,
          name: driverDisplayName(d.driver),
          vehicleType: d.driver?.profile?.vehicleType || '',
          color: DRIVER_COLORS[byId.size % DRIVER_COLORS.length],
          stops: [],
          missing: []
        };
        byId.set(driverId, group);
      }
      const override = manualOverrides[d._id];
      const stored = getDeliveryLatLng(d, depot || null);
      const coords = override || stored || resolved[d._id] || null;
      if (coords) {
        const timeSeconds = scheduledSecondsOf(d.scheduledTime);
        group.stops.push({
          ...d,
          coords,
          approx: !override && !stored && resolved[d._id]?.source === 'geocoded',
          manuallyPlaced: !!override,
          timeSeconds,
          // Each pin colored by its own scheduled HOUR (owner, 2026-09-09) —
          // a fixed color per 3am..10am bucket, not by driver — so timing is
          // readable at a glance and the same hour always reads the same color.
          timeColor: colorForHour(hourOf(timeSeconds)),
          // In simulation, order by the WHAT-IF route, not the real stored one.
          routeOrder: simulating ? (simMeta ? simMeta.routeOrder : null) : d.routeOrder
        });
      } else group.missing.push(d);
    });

    const assigned = [...byId.values()]
      .filter((g) => g.stops.length || g.missing.length)
      .map((g) => ({ ...g, stops: [...g.stops].sort(stopSort) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    unassigned.stops.sort(stopSort);
    return { assigned, unassigned };
  }, [deliveries, drivers, resolved, depot, manualOverrides, timingFilters, simulating, simMetaByDeliveryId]);

  const visibleGroups = useMemo(() => {
    if (selected === ALL) return groups.assigned;
    if (selected === UNASSIGNED) return [groups.unassigned];
    const g = groups.assigned.find((x) => x.id === selected);
    return g ? [g] : [];
  }, [groups, selected]);

  const singleGroup = selected !== ALL && selected !== UNASSIGNED ? visibleGroups[0] || null : null;
  const listGroup = selected === ALL ? null : visibleGroups[0] || null;

  // Save a corrected pin — optimistic (the marker has already moved under the
  // driver's finger by the time this fires), reverted on failure. Reuses the
  // same endpoint the dispatcher's Map tool already saves manual pins
  // through, so it also updates the customer's cached geocode for next time.
  const handlePinDrop = useCallback(async (stop, [lng, lat]) => {
    setManualOverrides((prev) => ({ ...prev, [stop._id]: { lat, lng } }));
    setSavingId(stop._id);
    setSaveMsg(null);
    try {
      await api.post(`/deliveries/${stop._id}/manual-coords`, { lat, lng });
      // The old route/ETA were computed against the wrong point.
      routeCacheRef.current.clear();
      etaCacheRef.current.clear();
      setSaveMsg({ text: `Saved the corrected location for ${stop.customerName || 'this delivery'}.`, error: false });
    } catch (err) {
      setManualOverrides((prev) => {
        const next = { ...prev };
        delete next[stop._id];
        return next;
      });
      setSaveMsg({ text: err?.response?.data?.message || 'Could not save the new location — reverted.', error: true });
    } finally {
      setSavingId(null);
    }
  }, []);

  useEffect(() => {
    if (!saveMsg) return undefined;
    const t = setTimeout(() => setSaveMsg(null), 4000);
    return () => clearTimeout(t);
  }, [saveMsg]);

  // If the selected driver drops out of the list (filters changed), fall back to all.
  useEffect(() => {
    if (selected === ALL || selected === UNASSIGNED) return;
    if (!groups.assigned.some((g) => g.id === selected)) setSelected(ALL);
  }, [groups, selected]);

  useEffect(() => {
    if (!open) return undefined;
    setActiveId(null);
    return undefined;
  }, [open, selected]);

  // Don't reopen already in edit mode next time.
  useEffect(() => {
    if (!open) { setEditMode(false); setSaveMsg(null); }
  }, [open]);

  // Depot (kitchen) — fetched once per open.
  useEffect(() => {
    if (!open || depot !== null) return undefined;
    let cancelled = false;
    api.get('/deliveries/depot')
      .then((res) => { if (!cancelled) setDepot(res.data?.data || false); })
      .catch(() => { if (!cancelled) setDepot(false); });
    return () => { cancelled = true; };
  }, [open, depot]);

  // Ask the server to locate deliveries with nothing stored — the same resolver
  // the optimizer uses (Maps-link extraction, then geocoding with a plausibility check).
  useEffect(() => {
    // Wait until the depot is known (fetched, or confirmed unconfigured) so a
    // stored-but-implausible pin isn't briefly accepted as-is before the
    // depot-distance check can reject it.
    if (!open || depot === null) return undefined;
    const fromCache = {};
    const toResolve = [];
    deliveries.forEach((d) => {
      if (!d?._id || getDeliveryLatLng(d, depot || null)) return;
      const hit = resolvedCoordsCache.get(d._id);
      if (hit === undefined) toResolve.push(d._id);
      else if (hit) fromCache[d._id] = hit;
    });
    if (Object.keys(fromCache).length) setResolved((prev) => ({ ...prev, ...fromCache }));
    if (toResolve.length === 0) return undefined;
    let cancelled = false;
    setResolving(toResolve.length);
    (async () => {
      for (let i = 0; i < toResolve.length && !cancelled; i += RESOLVE_BATCH) {
        const batch = toResolve.slice(i, i + RESOLVE_BATCH);
        try {
          const res = await api.post('/deliveries/resolve-coords', { deliveryIds: batch });
          const found = res.data?.data?.resolved || {};
          // Remember misses too (as null) so we don't hammer the geocoder every open;
          // a page reload retries them.
          batch.forEach((id) => resolvedCoordsCache.set(id, found[id] || null));
          if (!cancelled) setResolved((prev) => ({ ...prev, ...found }));
        } catch (_) {
          // Leave them listed as "without a location"; nothing else to do here.
        }
        if (!cancelled) setResolving((n) => Math.max(0, n - batch.length));
      }
    })();
    return () => { cancelled = true; setResolving(0); };
  }, [open, deliveries, depot]);

  // Create / destroy the MapGL map with the modal.
  useEffect(() => {
    if (!open || !API_KEY) return undefined;
    let cancelled = false;
    setMapError('');
    loadMapglOnce()
      .then((mapgl) => {
        if (cancelled) return;
        if (typeof mapgl.isSupported === 'function' && !mapgl.isSupported()) {
          setMapError('This browser cannot render the 2GIS map (WebGL is unavailable).');
          return;
        }
        const container = document.getElementById(MAP_ID);
        if (!container) return;
        mapglRef.current = mapgl;
        mapRef.current = new mapgl.Map(container, { center: DUBAI_CENTER, zoom: 11, key: API_KEY });
        setMapReady(true);
      })
      .catch((err) => {
        // A failed load shouldn't be cached forever — let the next open retry.
        mapglLoadPromise = null;
        if (!cancelled) setMapError(err?.message || 'Failed to load the 2GIS map script.');
      });
    return () => {
      cancelled = true;
      markersRef.current.forEach(safeDestroy);
      markersRef.current = [];
      safeDestroy(lineRef.current);
      lineRef.current = null;
      safeDestroy(returnLineRef.current);
      returnLineRef.current = null;
      destroyMapSuppressingSdkNoise(mapRef.current);
      mapRef.current = null;
      setMapReady(false);
    };
  }, [open]);

  // Markers: depot + numbered stops for the visible groups.
  useEffect(() => {
    const map = mapRef.current;
    const mapgl = mapglRef.current;
    if (!mapReady || !map || !mapgl) return;
    markersRef.current.forEach(safeDestroy);
    markersRef.current = [];

    if (depot) {
      markersRef.current.push(new mapgl.HtmlMarker(map, {
        coordinates: [depot.lng, depot.lat], html: depotHtml(depot.label), anchor: [16, 16], zIndex: 5
      }));
    }
    const container = document.getElementById(MAP_ID);
    visibleGroups.forEach((g) => {
      g.stops.forEach((stop, idx) => {
        const isActive = activeId === stop._id;
        const marker = new mapgl.HtmlMarker(map, {
          coordinates: toLngLat(stop.coords),
          html: markerHtml(idx + 1, stop.timeColor, isActive, stop.status === 'delivered', stop.approx, editMode),
          anchor: [14, 14],
          zIndex: isActive ? 20 : (editMode ? 15 : 10)
        });
        marker.getContent().setAttribute('data-delivery-id', stop._id);
        marker.getContent().addEventListener('click', () => setActiveId(stop._id));
        if (editMode && container) {
          makeMarkerDraggable(marker, map, container, (lngLat) => handlePinDrop(stop, lngLat));
        }
        markersRef.current.push(marker);
      });
    });

    // Where this bike picks up trip 2. A kitchen return already has the depot
    // marker, so only a van meeting needs its own pin.
    const meet = eta.status === 'ok' && eta.detour?.type === 'van_handoff' ? eta.detour.meetingPoint : null;
    if (meet && Number.isFinite(meet.lat) && Number.isFinite(meet.lng)) {
      markersRef.current.push(new mapgl.HtmlMarker(map, {
        coordinates: [meet.lng, meet.lat],
        html: meetingHtml(meet.name || 'Van meeting point'),
        anchor: [16, 16],
        zIndex: 6
      }));
    }
    // Where this van hands bags to bikes.
    if (eta.status === 'ok') {
      (eta.meetingBikes || []).forEach((b) => {
        const p = b.meetingPoint;
        if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
        markersRef.current.push(new mapgl.HtmlMarker(map, {
          coordinates: [p.lng, p.lat],
          html: meetingHtml(`Meet ${b.bikeName}`),
          anchor: [16, 16],
          zIndex: 6
        }));
      });
    }

    // Simulation hub-van pins — shown regardless of which driver is
    // currently selected, so choosing a hub is a map action, not just a
    // name in a list.
    if (simMode) {
      simHubVanIds.forEach((driverId) => {
        const van = drivers.find((d) => String(d._id) === driverId);
        const point = driverAnchorPoint.get(driverId) || (depot ? { lat: depot.lat, lng: depot.lng } : null);
        if (!point) return;
        markersRef.current.push(new mapgl.HtmlMarker(map, {
          coordinates: [point.lng, point.lat],
          html: hubVanHtml(`Hub: ${driverDisplayName(van)}`),
          anchor: [17, 17],
          zIndex: 8
        }));
      });
    }
  }, [mapReady, visibleGroups, depot, activeId, eta, editMode, handlePinDrop, simMode, simHubVanIds, driverAnchorPoint, drivers]);

  // Fit the view when the selection (not the highlighted stop) changes.
  useEffect(() => {
    if (!mapReady) return;
    const pts = [];
    if (depot) pts.push([depot.lng, depot.lat]);
    visibleGroups.forEach((g) => g.stops.forEach((s) => pts.push(toLngLat(s.coords))));
    fitMapTo(mapRef.current, pts);
  }, [mapReady, visibleGroups, depot]);

  // Pan to the highlighted stop and keep its row in view.
  useEffect(() => {
    if (!mapReady || !activeId) return;
    const stop = visibleGroups.flatMap((g) => g.stops).find((s) => s._id === activeId);
    const map = mapRef.current;
    if (!stop || !map) return;
    map.setCenter(toLngLat(stop.coords));
    if (map.getZoom() < 14) map.setZoom(15);
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [mapReady, activeId, visibleGroups]);

  // Drawn road route for a single driver: kitchen → stops in order (solid),
  // then the leg back to the kitchen (dashed). Purely visual — the km/time
  // figures shown in the panel come from the server's OSRM-based ETA
  // calculation so there's one consistent set of numbers. Cached per stop
  // sequence.
  useEffect(() => {
    safeDestroy(lineRef.current);
    lineRef.current = null;
    safeDestroy(returnLineRef.current);
    returnLineRef.current = null;
    if (!mapReady || !singleGroup || singleGroup.stops.length === 0) {
      setRoute({ status: 'idle' });
      return undefined;
    }
    const pts = [...(depot ? [depot] : []), ...singleGroup.stops.map((s) => s.coords)];
    if (pts.length < 2) {
      setRoute({ status: 'idle' });
      return undefined;
    }
    const polyline = (coords, dashed) => {
      const map = mapRef.current;
      const mapgl = mapglRef.current;
      if (!map || !mapgl) return null;
      return new mapgl.Polyline(map, {
        coordinates: coords,
        width: dashed ? 4 : 5,
        color: singleGroup.color,
        zIndex: 1,
        ...(dashed ? { dashLength: 10, gapLength: 8 } : {})
      });
    };
    const drawMain = (coords, dashed) => { lineRef.current = polyline(coords, dashed); };
    const drawReturn = (coords) => { returnLineRef.current = polyline(coords, true); };
    const lastStop = singleGroup.stops[singleGroup.stops.length - 1].coords;
    const returnPts = depot ? [lastStop, depot] : null;

    const cacheKey = `${singleGroup.id}|${pts.map((p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join(';')}`;
    const cached = routeCacheRef.current.get(cacheKey);
    if (cached) {
      drawMain(cached.coords, false);
      if (cached.returnCoords) drawReturn(cached.returnCoords);
      setRoute({ status: 'ok' });
      return undefined;
    }
    let cancelled = false;
    setRoute({ status: 'loading' });
    Promise.all([
      fetchRoadRoute(pts),
      returnPts ? fetchRoadRoute(returnPts).catch(() => null) : Promise.resolve(null)
    ])
      .then(([main, ret]) => {
        if (cancelled) return;
        const returnCoords = ret ? ret.coords : (returnPts ? returnPts.map(toLngLat) : null);
        routeCacheRef.current.set(cacheKey, { coords: main.coords, returnCoords });
        drawMain(main.coords, false);
        if (returnCoords) drawReturn(returnCoords);
        setRoute({ status: 'ok' });
      })
      .catch((err) => {
        if (cancelled) return;
        drawMain(pts.map(toLngLat), true);
        if (returnPts) drawReturn(returnPts.map(toLngLat));
        setRoute({ status: 'fallback', error: err?.message || 'routing failed' });
      });
    return () => { cancelled = true; };
  }, [mapReady, singleGroup, depot]);

  // Estimated arrival + early/late per stop for a single driver, via real
  // OSRM driving legs (server-side — see POST /deliveries/route-eta). Cached
  // per exact stop sequence, same pattern as the road-route polyline above.
  useEffect(() => {
    if (!singleGroup || singleGroup.stops.length === 0) {
      setEta({ status: 'idle' });
      return undefined;
    }
    const ids = singleGroup.stops.map((s) => s._id);
    const cacheKey = `${simulating ? 'sim' : 'real'}|${singleGroup.id}|${date}|${ids.join(',')}`;
    const cached = etaCacheRef.current.get(cacheKey);
    if (cached) {
      setEta(cached);
      return undefined;
    }
    let cancelled = false;
    setEta({ status: 'loading' });
    api.post('/deliveries/route-eta', {
      deliveryIds: ids,
      vehicleType: singleGroup.vehicleType,
      // Lets the server fold this driver's planned second-trip pickup (van
      // handoff or kitchen return) into the ETAs at the right point — only
      // meaningful for the REAL assignment; a simulated route has no Handoff
      // record of its own, so passing driverId here would fold in whatever
      // that real driver's actual handoff happens to be for this date, which
      // has nothing to do with the what-if plan being previewed.
      ...(simulating ? {} : { driverId: singleGroup.id }),
      date
    })
      .then((res) => {
        if (cancelled) return;
        const data = res.data?.data || {};
        const byId = {};
        (data.stops || []).forEach((s) => { byId[s.deliveryId] = s; });
        const result = {
          status: 'ok',
          departure: data.departure || null,
          totals: data.totals || null,
          windowSeconds: data.windowSeconds || null,
          detour: data.detour || null,
          meetingBikes: data.meetingBikes || [],
          byId
        };
        etaCacheRef.current.set(cacheKey, result);
        setEta(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setEta({ status: 'error', error: err?.response?.data?.message || err.message });
      });
    return () => { cancelled = true; };
  }, [singleGroup, date, simulating]);

  // Runs the same read-only optimizeRoutes the Optimize Routes modal previews
  // with — it never writes anything, so nothing here can ever assign a real
  // delivery. driverIds/deliveryIds are every driver/delivery currently
  // loaded for the day (not a checkbox selection — Driver Routes has none),
  // so the simulation answers "what would the WHOLE day look like" under
  // these rules, matching what the map is already showing.
  const runSimulation = async () => {
    setSimStatus('loading');
    setSimError('');
    try {
      const fixedDepartureSeconds = simDeparture ? clockToSeconds(simDeparture) : null;
      if (simDeparture && fixedDepartureSeconds == null) throw new Error('Invalid departure time.');
      const includedDriverIds = drivers.map((d) => String(d._id)).filter((id) => !simExcludedDriverIds.includes(id));
      if (includedDriverIds.length === 0) throw new Error('At least one active driver must be included.');
      const hubVans = [];
      for (const driverId of simHubVanIds) {
        if (!includedDriverIds.includes(driverId)) continue; // excluded as a driver — drop its hub designation too
        const hubReadySeconds = clockToSeconds(simHubReady[driverId]);
        if (hubReadySeconds == null) {
          const van = drivers.find((d) => String(d._id) === driverId);
          throw new Error(`Set a "ready for hub duty by" time for ${driverDisplayName(van)}.`);
        }
        hubVans.push({ driverId, hubReadySeconds });
      }
      const bikeTripCapacity = simBikeCapacity ? Number(simBikeCapacity) : null;
      if (simBikeCapacity && (!Number.isFinite(bikeTripCapacity) || bikeTripCapacity < 1)) {
        throw new Error('Bike capacity must be a positive number of stops.');
      }
      const includedDeliveryIds = deliveries
        .filter((d) => !d.zone || !simExcludedAreas.includes(d.zone.trim()))
        .map((d) => d._id);
      if (includedDeliveryIds.length === 0) throw new Error('Every delivery was excluded by area — nothing left to simulate.');
      const res = await api.post('/deliveries/optimize-routes', {
        deliveryIds: includedDeliveryIds,
        driverIds: includedDriverIds,
        // A fixed departure here is a deliberate what-if override — it is NOT
        // clamped to the real KITCHEN_EARLIEST_DEPARTURE_TIME (01:00) floor,
        // by design (owner, 2026-09-09): choosing an earlier time in the
        // simulation is exactly how you'd test bypassing that rule.
        ...(fixedDepartureSeconds != null ? { fixedDepartureSeconds } : {}),
        ...(hubVans.length > 0 ? { hubVans } : {}),
        ...(bikeTripCapacity != null ? { bikeTripCapacity } : {})
      });
      setSimPlan(res.data?.data || null);
      setSimStatus('ok');
    } catch (err) {
      setSimError(err.response?.data?.message || err.message || 'Simulation failed.');
      setSimStatus('error');
    }
  };

  const exitSimulation = () => {
    setSimMode(false);
    setSimPlan(null);
    setSimStatus('idle');
    setSimError('');
  };

  const toggleSimExcludedDriver = (driverId) => {
    setSimExcludedDriverIds((prev) => (
      prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId]
    ));
  };

  const toggleSimExcludedArea = (zone) => {
    setSimExcludedAreas((prev) => (prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]));
  };

  const toggleSimHubVan = (driverId) => {
    setSimHubVanIds((prev) => {
      if (prev.includes(driverId)) {
        setSimHubReady((r) => { const next = { ...r }; delete next[driverId]; return next; });
        return prev.filter((id) => id !== driverId);
      }
      return [...prev, driverId];
    });
  };

  if (!open) return null;

  if (!API_KEY) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full space-y-3 text-center">
          <div className="text-lg font-semibold text-gray-900">2GIS key required</div>
          <p className="text-sm text-gray-600">
            Add <span className="font-mono">REACT_APP_2GIS_API_KEY</span> to <span className="font-mono">client/.env</span> with
            your 2GIS MapGL key, then restart the client dev server.
          </p>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }

  const totalOnMap = visibleGroups.reduce((n, g) => n + g.stops.length, 0);
  const totalMissing = visibleGroups.reduce((n, g) => n + g.missing.length, 0);
  const approxCount = visibleGroups.reduce((n, g) => n + g.stops.filter((s) => s.approx).length, 0);
  const assignedTotal = groups.assigned.reduce((n, g) => n + g.stops.length + g.missing.length, 0);
  const hasOptimizedOrder = listGroup ? listGroup.stops.some((s) => s.routeOrder != null) : false;

  // A full page (owner, 2026-09-09: "it should not be a window but another
  // page") drops the modal overlay/backdrop/centered-card chrome in favor of
  // a normal full-viewport layout — everything else below is unchanged.
  //
  // A real page needs a FIXED height (h-screen), not just a minimum
  // (min-h-screen) — otherwise the flex chain below has no definite height to
  // constrain against, so the whole page grows and scrolls instead of just
  // the customer list scrolling inside its own panel (owner, 2026-09-09:
  // "fix the scrolling down when I want to see the list of customers").
  return (
    <div className={asPage ? 'h-screen bg-white flex flex-col overflow-hidden' : 'fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4'}>
      <div className={asPage ? 'flex-1 flex flex-col overflow-hidden min-h-0' : 'bg-white rounded-lg shadow-xl w-full max-w-6xl h-[90vh] flex flex-col overflow-hidden'}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            {asPage ? (
              <button
                type="button"
                onClick={onClose}
                className="mr-1 p-1.5 rounded-lg hover:bg-gray-100 text-gray-600"
                aria-label="Back to Dispatcher Hub"
                title="Back to Dispatcher Hub"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            ) : null}
            <Route className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Driver Routes</h2>
            {asPage && onDateChange ? (
              <input
                type="date"
                value={date || ''}
                onChange={(e) => onDateChange(e.target.value)}
                className="ml-1 border border-gray-300 rounded-lg px-2 py-1 text-sm text-gray-700"
              />
            ) : date ? (
              <span className="text-sm text-gray-500">· {date}</span>
            ) : null}
            <span className="ml-2 text-[11px] uppercase tracking-wide text-gray-400">2GIS</span>
          </div>
          <div className="flex items-center gap-2">
            {onOptimizeRoutes ? (
              <button
                type="button"
                onClick={onOptimizeRoutes}
                className="px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 bg-white border border-blue-300 text-blue-700 hover:bg-blue-50"
                title="Open Optimize Routes for today's deliveries — set a fixed departure time or make a van a hub from there"
              >
                <Route className="w-4 h-4" />
                Optimize Routes
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                if (simMode) { exitSimulation(); return; }
                setEditMode(false);
                setSimMode(true);
              }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${
                simMode ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title="Preview a what-if plan (departure time, hub van, bike capacity) without assigning anything for real"
            >
              <FlaskConical className="w-4 h-4" />
              {simMode ? 'Exit Simulation' : 'Simulate'}
            </button>
            <button
              type="button"
              disabled={simMode}
              onClick={() => setEditMode((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                editMode ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
              }`}
              title={simMode ? 'Exit Simulation to fix a pin' : 'Drag a pin on the map to correct a wrong location'}
            >
              {editMode ? <CheckCircle2 className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
              {editMode ? 'Done fixing pins' : 'Fix a pin'}
            </button>
            {!asPage ? (
              <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100" aria-label="Close">
                <X className="w-5 h-5 text-gray-600" />
              </button>
            ) : null}
          </div>
        </div>

        {simMode ? (
          <div data-testid="sim-panel" className="px-5 py-3 bg-indigo-50 border-b border-indigo-200 space-y-2.5">
            <div className="flex items-center gap-2 text-sm text-indigo-900">
              <FlaskConical className="w-4 h-4 flex-shrink-0" />
              <span className="font-medium">Simulation</span>
              <span className="text-indigo-700">— set rules, then Run. Nothing here is ever assigned or saved; the real plan is untouched.</span>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-indigo-900">
                Kitchen departure
                <input
                  type="time"
                  value={simDeparture}
                  onChange={(e) => setSimDeparture(e.target.value)}
                  className="border border-indigo-200 rounded-lg px-2 py-1 text-sm bg-white"
                  title="A time set here overrides the normal 1:00 AM earliest-departure rule for this simulation only"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-indigo-900">
                Bike capacity (stops/trip)
                <input
                  type="number"
                  min="1"
                  placeholder="20"
                  value={simBikeCapacity}
                  onChange={(e) => setSimBikeCapacity(e.target.value)}
                  className="border border-indigo-200 rounded-lg px-2 py-1 text-sm bg-white w-32"
                />
              </label>
              <button
                type="button"
                onClick={runSimulation}
                disabled={simStatus === 'loading'}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
              >
                {simStatus === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />}
                {simStatus === 'loading' ? 'Running… up to ~1 min' : 'Run Simulation'}
              </button>
              {simulating ? (
                <button type="button" onClick={() => setSimPlan(null)} className="text-xs text-indigo-700 underline">
                  Clear result
                </button>
              ) : null}
            </div>
            <p className="text-[11px] text-indigo-600">
              A departure time set above overrides the normal 1:00 AM earliest-departure rule — this simulation only.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-indigo-900">Active drivers (click to exclude)</p>
                  {simExcludedDriverIds.length > 0 ? (
                    <button type="button" onClick={() => setSimExcludedDriverIds([])} className="text-[11px] text-indigo-600 underline">
                      Include all
                    </button>
                  ) : null}
                </div>
                <div data-testid="sim-drivers" className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {drivers.map((d) => {
                    const id = String(d._id);
                    const excluded = simExcludedDriverIds.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => toggleSimExcludedDriver(id)}
                        className={`text-xs rounded-full px-2 py-0.5 border ${
                          excluded
                            ? 'bg-gray-100 border-gray-300 text-gray-400 line-through'
                            : 'bg-white border-indigo-200 text-indigo-800'
                        }`}
                        title={excluded ? 'Excluded — click to include' : 'Included — click to exclude'}
                      >
                        {driverDisplayName(d)}{d.profile?.vehicleType ? ` · ${d.profile.vehicleType}` : ''}
                      </button>
                    );
                  })}
                  {drivers.length === 0 ? <span className="text-xs text-indigo-400">No drivers loaded.</span> : null}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-indigo-900">Exclude areas</p>
                  {simExcludedAreas.length > 0 ? (
                    <button type="button" onClick={() => setSimExcludedAreas([])} className="text-[11px] text-indigo-600 underline">
                      Clear
                    </button>
                  ) : null}
                </div>
                <div data-testid="sim-areas" className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {areaOptionsForSim.map((zone) => {
                    const excluded = simExcludedAreas.includes(zone);
                    return (
                      <button
                        key={zone}
                        type="button"
                        onClick={() => toggleSimExcludedArea(zone)}
                        className={`text-xs rounded-full px-2 py-0.5 border ${
                          excluded ? 'bg-red-50 border-red-300 text-red-700 line-through' : 'bg-white border-indigo-200 text-indigo-800'
                        }`}
                        title={excluded ? 'Excluded from this simulation — click to include' : 'Click to exclude this area'}
                      >
                        {zone}
                      </button>
                    );
                  })}
                  {areaOptionsForSim.length === 0 ? <span className="text-xs text-indigo-400">No areas found on today's deliveries.</span> : null}
                </div>
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-indigo-900 mb-1">Hub van (click a van, then set when it must be ready — 🚚 pin shows where on the map)</p>
              <div data-testid="sim-hub-vans" className="flex flex-wrap gap-1.5">
                {drivers.filter((d) => d.profile?.vehicleType === 'van' && !simExcludedDriverIds.includes(String(d._id))).map((d) => {
                  const id = String(d._id);
                  const isHub = simHubVanIds.includes(id);
                  return (
                    <div
                      key={id}
                      className={`flex items-center gap-1.5 text-xs rounded-full px-2 py-0.5 border ${
                        isHub ? 'bg-orange-100 border-orange-300 text-orange-900' : 'bg-white border-indigo-200 text-indigo-800'
                      }`}
                    >
                      <button type="button" onClick={() => toggleSimHubVan(id)} className="font-medium">
                        {isHub ? '🚚 ' : ''}{driverDisplayName(d)}
                      </button>
                      {isHub ? (
                        <input
                          type="time"
                          value={simHubReady[id] || ''}
                          onChange={(e) => setSimHubReady((r) => ({ ...r, [id]: e.target.value }))}
                          className="border border-orange-300 rounded px-1 py-0 text-[11px]"
                        />
                      ) : null}
                    </div>
                  );
                })}
                {drivers.filter((d) => d.profile?.vehicleType === 'van' && !simExcludedDriverIds.includes(String(d._id))).length === 0 ? (
                  <span className="text-xs text-indigo-400">No active van drivers to choose from.</span>
                ) : null}
              </div>
            </div>
            {simError ? (
              <p className="text-xs text-red-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" />{simError}</p>
            ) : null}
            {simulating ? (
              <p className="text-xs text-indigo-800">
                Simulated: <strong>{simPlan.routes.reduce((n, r) => n + r.stops.length, 0)}</strong> assigned
                {simPlan.unassignedDeliveries?.length ? <>, <strong>{simPlan.unassignedDeliveries.length}</strong> unassigned</> : null}
                {simPlan.scheduleAware ? <>, <strong>{simPlan.lateStops}</strong> predicted late</> : null}
                {simPlan.handoffs?.length ? <>, <strong>{simPlan.handoffs.length}</strong> van↔bike {simPlan.handoffs.length === 1 ? 'handoff' : 'handoffs'}</> : null}
                {simPlan.kitchenReturns?.length ? <>, <strong>{simPlan.kitchenReturns.length}</strong> kitchen {simPlan.kitchenReturns.length === 1 ? 'return' : 'returns'}</> : null}
                {' '}— the pins/list below now show this plan.
              </p>
            ) : null}
          </div>
        ) : null}

        {editMode && !simMode ? (
          <div className="px-5 py-2 bg-amber-50 border-b border-amber-200 text-sm text-amber-800 flex items-center gap-2">
            <Pencil className="w-4 h-4 flex-shrink-0" />
            Drag any pin on the map to its correct spot — it saves as soon as you drop it, and also fills in the same location for any other delivery this customer has that doesn't have a pin yet.
          </div>
        ) : null}
        {saveMsg ? (
          <div className={`px-5 py-2 border-b text-sm flex items-center gap-2 ${
            saveMsg.error ? 'bg-red-50 border-red-200 text-red-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}>
            {saveMsg.error ? <AlertTriangle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 flex-shrink-0" />}
            {saveMsg.text}
          </div>
        ) : null}

        <div className="flex flex-1 min-h-0">
          {/* Map */}
          <div className="relative flex-1 bg-gray-100">
            <div id={MAP_ID} className="absolute inset-0" />
            {!mapReady && !mapError ? (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-600 bg-gray-100/80">
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading 2GIS map…
              </div>
            ) : null}
            {mapError ? (
              <div className="absolute inset-0 flex items-center justify-center p-6 bg-gray-100">
                <div className="text-center max-w-sm">
                  <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-2" />
                  <p className="text-sm font-medium text-red-700">{mapError}</p>
                </div>
              </div>
            ) : null}
            {mapReady && totalOnMap === 0 && resolving === 0 ? (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/95 rounded-lg shadow px-4 py-2 text-sm text-gray-700">
                {totalMissing > 0
                  ? `${totalMissing} deliver${totalMissing === 1 ? 'y has' : 'ies have'} no location yet — nothing to plot.`
                  : 'No deliveries to show for this selection.'}
              </div>
            ) : null}
            {mapReady && selected === ALL && groups.assigned.length > 0 ? (
              <div className="absolute bottom-4 left-4 bg-white/95 rounded-lg shadow px-3 py-2 max-w-xs">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Drivers (click to filter)</p>
                <div className="flex flex-wrap gap-1.5">
                  {groups.assigned.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelected(g.id)}
                      className="flex items-center gap-1.5 text-xs text-gray-800 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full px-2 py-0.5"
                      title="Show only this driver"
                    >
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                      {g.name} <span className="text-gray-400">({g.stops.length})</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {mapReady && totalOnMap > 0 ? (
              <div className="absolute bottom-4 right-4 bg-white/95 rounded-lg shadow px-3 py-2">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Pins by hour</p>
                <div className="flex flex-wrap gap-x-2 gap-y-1 max-w-[220px]">
                  {TIMING_HOURS.map((hour) => (
                    <span key={hour} className="flex items-center gap-1 text-[10px] text-gray-600">
                      <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: HOUR_COLORS[hour] }} />
                      {hour}am
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {/* Side panel */}
          <aside className="w-[340px] border-l border-gray-200 flex flex-col min-h-0">
            <div className="p-4 border-b border-gray-200 space-y-3">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Driver
                {simulating ? <span className="ml-2 normal-case font-semibold text-indigo-600">· showing simulated plan</span> : null}
              </label>
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value={ALL}>All assigned drivers ({assignedTotal})</option>
                {groups.assigned.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}{g.vehicleType ? ` · ${g.vehicleType}` : ''} ({g.stops.length + g.missing.length})
                  </option>
                ))}
                <option value={UNASSIGNED}>
                  Unassigned ({groups.unassigned.stops.length + groups.unassigned.missing.length})
                </option>
              </select>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide">Timing</label>
                  {timingFilters.length > 0 ? (
                    <button type="button" onClick={() => setTimingFilters([])} className="text-[11px] text-blue-600 hover:underline">
                      Clear
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {TIMING_HOURS.map((hour) => {
                    const active = timingFilters.includes(hour);
                    return (
                      <button
                        key={hour}
                        type="button"
                        onClick={() => setTimingFilters((prev) => (
                          prev.includes(hour) ? prev.filter((h) => h !== hour) : [...prev, hour]
                        ))}
                        className="px-2 py-1 rounded-full text-[11px] font-semibold border flex items-center gap-1"
                        style={active
                          ? { backgroundColor: HOUR_COLORS[hour], borderColor: HOUR_COLORS[hour], color: '#fff' }
                          : { backgroundColor: '#fff', borderColor: HOUR_COLORS[hour], color: HOUR_COLORS[hour] }}
                        title={`Show only ${hour}am deliveries`}
                      >
                        {hour}am
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-700 font-medium">{totalOnMap} on map</span>
                {resolving > 0 ? (
                  <span className="px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" /> locating {resolving}…
                  </span>
                ) : null}
                {approxCount > 0 ? (
                  <span
                    className="px-2 py-1 rounded-full bg-violet-50 text-violet-700 font-medium"
                    title="No saved pin — placed by geocoding the address (dashed markers)"
                  >
                    {approxCount} approximate
                  </span>
                ) : null}
                {totalMissing > 0 && resolving === 0 ? (
                  <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium">{totalMissing} missing location</span>
                ) : null}
              </div>

              {singleGroup && singleGroup.stops.length > 0 ? (
                <div className="text-xs text-gray-700">
                  {route.status === 'loading' ? (
                    <span className="flex items-center gap-1 text-gray-500"><Loader2 className="w-3 h-3 animate-spin" /> Calculating road route…</span>
                  ) : null}
                  {route.status === 'fallback' ? (
                    <span className="text-amber-700">Straight lines shown — 2GIS routing unavailable ({route.error}).</span>
                  ) : null}
                </div>
              ) : null}

              {singleGroup && singleGroup.stops.length > 0 ? (
                <div className="text-xs text-gray-700">
                  {eta.status === 'loading' ? (
                    <span className="flex items-center gap-1 text-gray-500"><Loader2 className="w-3 h-3 animate-spin" /> Estimating arrival times…</span>
                  ) : null}
                  {eta.status === 'error' ? (
                    <span className="text-amber-700">Couldn't estimate arrival times ({eta.error}).</span>
                  ) : null}
                  {eta.status === 'ok' && eta.departure ? (
                    <div className="space-y-1">
                      <p>
                        {eta.departure.reason === 'usual' ? (
                          <>Leave the kitchen at the usual <span className="font-semibold">{clock(eta.departure.seconds)}</span>.</>
                        ) : null}
                        {eta.departure.reason === 'earlier' ? (
                          <>
                            Leave the kitchen by <span className="font-semibold">{clock(eta.departure.seconds)}</span>
                            {' '}— earlier than the usual {clock(eta.departure.usualSeconds)} — to keep every stop on time.
                          </>
                        ) : null}
                        {eta.departure.reason === 'capped' ? (
                          <span className="text-amber-700">
                            Leaving at <span className="font-semibold">{clock(eta.departure.seconds)}</span>, the earliest allowed,
                            {' '}{eta.totals?.late || 0} stop{eta.totals?.late === 1 ? '' : 's'} still late.
                            {eta.departure.requiredSeconds != null ? (
                              <>
                                {' '}To have everything on time the driver would need to leave at{' '}
                                <span className="font-semibold">{clock(eta.departure.requiredSeconds)}</span>
                                {eta.departure.requiredSeconds < 0 ? ' the evening before' : ''}
                                {' '}— run <span className="font-medium">Optimize Routes</span> for a shorter order.
                              </>
                            ) : null}
                          </span>
                        ) : null}
                      </p>
                      {eta.totals ? (
                        <p>
                          <span className="font-semibold">{(eta.totals.distanceMeters / 1000).toFixed(1)} km</span> total
                          {' · '}<span className="font-semibold">{fmtDuration(eta.totals.drivingSeconds)}</span> driving
                          {' · '}back at the kitchen ~<span className="font-semibold">{clock(eta.totals.backAtKitchenSeconds)}</span>
                          <span className="text-gray-500"> (incl. {(eta.totals.returnDistanceMeters / 1000).toFixed(1)} km return)</span>
                        </p>
                      ) : null}
                      {eta.detour ? (
                        <p className={eta.detour.type === 'kitchen_return' ? 'text-amber-800' : 'text-violet-800'}>
                          {eta.detour.type === 'kitchen_return' ? (
                            <>
                              🏠 Back at the kitchen <span className="font-semibold">{clock(eta.detour.arrivalSeconds)}</span> to reload
                              {' '}({eta.detour.bagCount} {eta.detour.bagCount === 1 ? 'bag' : 'bags'} for trip 2), out again{' '}
                              <span className="font-semibold">{clock(eta.detour.departureSeconds)}</span>
                            </>
                          ) : (
                            <>
                              🚐 Meets <span className="font-semibold">{eta.detour.counterpartName}</span> at{' '}
                              <span className="font-semibold">{clock(eta.detour.arrivalSeconds)}</span>
                              {eta.detour.meetingPoint?.name ? <> — {eta.detour.meetingPoint.name}</> : null}
                              {' '}({eta.detour.bagCount} {eta.detour.bagCount === 1 ? 'bag' : 'bags'} for trip 2)
                            </>
                          )}
                          <span className="text-gray-500"> · adds {fmtDuration(eta.detour.extraSeconds)}</span>
                          {eta.detour.vanReason ? (
                            <span className="block text-[11px] text-gray-500">
                              No van could take it: {eta.detour.vanReason}
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {eta.meetingBikes?.length > 0 ? (
                        <p className="text-violet-800">
                          🚲 Hands trip-2 bags to{' '}
                          {eta.meetingBikes.map((b, i) => (
                            <span key={b.handoffId}>
                              {i > 0 ? ', ' : ''}
                              <span className="font-semibold">{b.bikeName}</span> after stop {(b.afterRouteOrder ?? 0) + 1}
                              {b.meetingPoint?.name ? ` (${b.meetingPoint.name})` : ''}
                            </span>
                          ))}
                        </p>
                      ) : null}
                      {eta.totals ? (
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">{eta.totals.onTime} on time</span>
                          {eta.totals.early > 0 ? <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">{eta.totals.early} early</span> : null}
                          {eta.totals.late > 0 ? <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">{eta.totals.late} late</span> : null}
                          <span className="text-gray-500">
                            on time = within the {Math.round((eta.windowSeconds || 10800) / 3600)}h window before each scheduled time
                          </span>
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {listGroup && listGroup.stops.length > 0 && !hasOptimizedOrder && listGroup.id !== UNASSIGNED ? (
                <p className="text-[11px] text-gray-500">
                  Order shown = scheduled time. Run <span className="font-medium">Optimize Routes</span> for a road-optimized order.
                </p>
              ) : null}
            </div>

            <div className="flex-1 overflow-y-auto">
              {selected === ALL ? (
                <ul className="divide-y divide-gray-100">
                  {groups.assigned.length === 0 ? (
                    <li className="p-4 text-sm text-gray-500">No deliveries are assigned to a driver for this day.</li>
                  ) : null}
                  {groups.assigned.map((g) => (
                    <li key={g.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(g.id)}
                        className="w-full text-left p-3 hover:bg-gray-50 flex items-center gap-3"
                      >
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: g.color }} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-gray-900 truncate">
                            {g.name}{g.vehicleType ? <span className="text-gray-400 font-normal"> · {g.vehicleType}</span> : null}
                          </span>
                          <span className="block text-xs text-gray-500">
                            {g.stops.length} on map{g.missing.length ? ` · ${g.missing.length} missing location` : ''}
                          </span>
                        </span>
                        <span className="text-xs text-blue-600 font-medium">View route</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : listGroup ? (
                <>
                  <ol className="divide-y divide-gray-100">
                    {listGroup.stops.map((stop, idx) => {
                      const isActive = activeId === stop._id;
                      const stopEta = eta.status === 'ok' ? eta.byId[stop._id] : null;
                      const earlyLate = stopStatusLabel(stopEta);
                      const pickupHere = eta.status === 'ok' && eta.detour?.beforeDeliveryId === stop._id ? eta.detour : null;
                      return (
                        <React.Fragment key={stop._id}>
                        {pickupHere ? (
                          <li className={`px-3 py-2.5 flex items-start gap-3 text-sm border-y ${
                            pickupHere.type === 'kitchen_return'
                              ? 'bg-amber-50 border-amber-100'
                              : 'bg-violet-50 border-violet-100'
                          }`}>
                            <span className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                              pickupHere.type === 'kitchen_return' ? 'bg-amber-200' : 'bg-violet-200'
                            }`}>
                              <Repeat className={`w-3 h-3 ${pickupHere.type === 'kitchen_return' ? 'text-amber-800' : 'text-violet-800'}`} />
                            </span>
                            <span className="min-w-0">
                              <span className={`block font-medium ${pickupHere.type === 'kitchen_return' ? 'text-amber-900' : 'text-violet-900'}`}>
                                {pickupHere.type === 'kitchen_return'
                                  ? `Back to the kitchen — collect ${pickupHere.bagCount} ${pickupHere.bagCount === 1 ? 'bag' : 'bags'} for trip 2`
                                  : `Meet ${pickupHere.counterpartName} — collect ${pickupHere.bagCount} ${pickupHere.bagCount === 1 ? 'bag' : 'bags'} for trip 2`}
                              </span>
                              <span className={`block text-[11px] ${pickupHere.type === 'kitchen_return' ? 'text-amber-700' : 'text-violet-700'}`}>
                                {pickupHere.meetingPoint?.name && pickupHere.type !== 'kitchen_return'
                                  ? `${pickupHere.meetingPoint.name} · ` : ''}
                                arrive {clock(pickupHere.arrivalSeconds)} · leave {clock(pickupHere.departureSeconds)}
                                {' · '}adds {fmtDuration(pickupHere.extraSeconds)}
                              </span>
                            </span>
                          </li>
                        ) : null}
                        <li
                          ref={isActive ? activeRowRef : null}
                          onClick={() => setActiveId(stop._id)}
                          className={`p-3 flex items-start gap-3 cursor-pointer ${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                        >
                          <span
                            className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: stop.timeColor, opacity: stop.status === 'delivered' ? 0.55 : 1 }}
                          >
                            {idx + 1}
                          </span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-gray-900 truncate">{stop.customerName || 'Customer'}</span>
                            {stop.address ? (
                              <span className="flex items-start gap-1 text-xs text-gray-500">
                                <MapPin className="w-3 h-3 mt-0.5 flex-shrink-0" />
                                <span className="truncate">{stop.address}</span>
                              </span>
                            ) : null}
                            <span className="flex items-center gap-2 text-[11px] text-gray-500 mt-0.5">
                              {stop.scheduledTime ? (
                                <span className="flex items-center gap-1" title="Delivery window — on time anywhere inside it">
                                  <Clock className="w-3 h-3" />
                                  {stopEta?.windowStartSeconds != null
                                    ? `${clock(stopEta.windowStartSeconds)} – ${clock(stopEta.scheduledSeconds)}`
                                    : formatBusinessTime(stop.scheduledTime)}
                                </span>
                              ) : null}
                              {stop.status ? <span className="capitalize">{String(stop.status).replace(/_/g, ' ')}</span> : null}
                              {savingId === stop._id ? (
                                <span className="flex items-center gap-1 text-amber-600"><Loader2 className="w-3 h-3 animate-spin" />saving location…</span>
                              ) : stop.manuallyPlaced ? (
                                <span className="flex items-center gap-1 text-emerald-600"><CheckCircle2 className="w-3 h-3" />manually placed</span>
                              ) : stop.approx ? (
                                <span className="text-violet-600">approx. location</span>
                              ) : null}
                            </span>
                            {stopEta && stopEta.etaSeconds != null ? (
                              <span className="flex items-center gap-1.5 text-[11px] mt-0.5">
                                <span className="text-gray-500">
                                  {stopEta.actual ? 'Delivered' : 'ETA'}{' '}
                                  <span className="font-medium text-gray-700">{clock(stopEta.etaSeconds)}</span>
                                </span>
                                {earlyLate ? <span className={`font-medium ${earlyLate.className}`}>· {earlyLate.text}</span> : null}
                              </span>
                            ) : null}
                          </span>
                        </li>
                        </React.Fragment>
                      );
                    })}
                  </ol>
                  {listGroup.missing.length > 0 ? (
                    <details className="border-t border-gray-200">
                      <summary className="px-3 py-2 text-xs font-medium text-amber-700 cursor-pointer flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> {listGroup.missing.length} without a location (not on the map)
                      </summary>
                      <ul className="px-3 pb-3 space-y-1">
                        {listGroup.missing.map((d) => (
                          <li key={d._id} className="text-xs text-gray-700">
                            <span className="font-medium">{d.customerName || 'Customer'}</span>
                            {d.address ? <span className="text-gray-500"> — {d.address}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

export default DriverRouteMap2GIS;
