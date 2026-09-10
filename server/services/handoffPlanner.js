// Bike second-trip planner: van handoff, or a kitchen return.
//
// Runs AFTER the OR-Tools solve as a greedy post-process — not a joint
// optimization. A bike is planned for up to two trips of BIKE_TRIP_CAPACITY
// stops each (owner's rule: 20 per trip, up to 2 trips = 40/day). Getting the
// second trip's bags to the bike has two mechanisms, tried in this order for
// each bike:
//   1. A van drives TO the bike and hands the bags over at a real place
//      (petrol station / parking) near wherever the bike is working — the
//      van is a mobile hub, so this is tried for every same-shift van at
//      every point in its route, not only where it already happened to have
//      a stop nearby. As many bikes as fit in the van's own remaining
//      capacity/time can be served this way — there's no fixed cap, the
//      van's 100-bag capacity and shift hours do the limiting.
//   2. Failing that (no van at all, wrong shift, out of capacity/time),
//      the bike itself rides back to the kitchen to reload — always
//      available, doesn't need a second driver, but costs the round-trip
//      drive time instead of a small van detour.
// Only when NEITHER mechanism fits the bike's shift is the second trip
// dropped (truncated to trip 1, stops 21+ reported unassigned).
// Everything here is pure and dependency-injected (fetchTable / fetchPois)
// so it can be unit-tested with fixtures.
//
// Hub hours: after `hubModeStartSeconds` (owner's rule: Dubai traffic gets
// bad from about 06:00), a van's own shift-time check for a meeting gets a
// small fixed grace (`hubModeShiftGraceSeconds`) — reaching the bike is
// prioritized over the van's own schedule, within a bounded amount, not by
// silently dropping the van's already-assigned deliveries (that needs a real
// re-solve; see the "Stage 2" note in the project plan doc). Callers that
// don't pass these leave the van-shift check exactly as strict as before.
//
// Timing model: every arrival is "seconds from shift start", reproduced from
// the same duration sub-matrix and service times the solver used, with the
// solver's exact arc rule arc(from,to) = durations[from][to] +
// serviceTimes[from]. That is why a meeting is only ever placed just AFTER
// one of the van's actual stops — arrival there is exact, whereas a point
// mid-leg would need speed interpolation that Dubai traffic makes
// meaningless — but which stop it follows is now chosen freely from the
// van's whole route, not filtered by proximity first.

import { haversineKm } from './geocoding.js';

export const BIKE_TRIP_CAPACITY = 20;
export const HANDOFF_DWELL_SECONDS = 5 * 60;
export const WAIT_TOLERANCE_SECONDS = 30 * 60;
// Time to grab the next batch at the kitchen — a labelled crate is already
// waiting, so this is a quick handover, not a fresh pack.
export const KITCHEN_RELOAD_DWELL_SECONDS = 5 * 60;
// What optimizeRoutes must subtract from a bike's shift before the second
// (capacity-40) solve, so there is room left for the meeting/return itself.
export const HANDOFF_RESERVE_SECONDS = HANDOFF_DWELL_SECONDS + WAIT_TOLERANCE_SECONDS;
export const POI_SNAP_RADIUS_M = 800;

/**
 * Arrival time (seconds from shift start, before service) at each stop of a
 * route that starts at the depot (matrix index 0).
 * @param {string[]} orderedStopIds
 * @param {number[][]} durations  sub-matrix used for the solve; index 0 = depot
 * @param {number[]} serviceTimes indexed like `durations`
 * @param {(stopId: string) => number} indexOf  stopId -> matrix index
 */
export function cumulativeArrivals(orderedStopIds, durations, serviceTimes, indexOf) {
  const arrivals = [];
  let prev = 0;
  let t = 0;
  for (const id of orderedStopIds) {
    const idx = indexOf(id);
    t += Math.round(durations[prev][idx] + serviceTimes[prev]);
    arrivals.push(t);
    prev = idx;
  }
  return arrivals;
}

export function splitBikeRoute(stops, tripCapacity = BIKE_TRIP_CAPACITY) {
  return { batch1: stops.slice(0, tripCapacity), batch2: stops.slice(tripCapacity) };
}

const pointKey = (p) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

function nearestPoi(point, pois, radiusM) {
  let best = null;
  let bestKm = Infinity;
  for (const poi of pois) {
    const km = haversineKm(point.lat, point.lng, poi.lat, poi.lng);
    if (km < bestKm) { bestKm = km; best = poi; }
  }
  return best && bestKm * 1000 <= radiusM ? best : null;
}

function bboxAround(points, padKm) {
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const padLat = padKm / 111;
  const padLng = padKm / (111 * Math.cos((Math.min(...lats) + Math.max(...lats)) / 2 * Math.PI / 180));
  return {
    south: Math.min(...lats) - padLat,
    north: Math.max(...lats) + padLat,
    west: Math.min(...lngs) - padLng,
    east: Math.max(...lngs) + padLng
  };
}

/**
 * Plan handoffs for one optimized plan.
 *
 * @param {object} args
 * @param {Array}  args.routes        plan routes from optimizeRoutes (pass 2): {driverId, driverName, vehicleType,
 *                                    capacity, maxDurationSeconds, estimatedDurationSeconds, stops:[{deliveryId,...}]}
 * @param {number[][]} args.durations sub-matrix used for that solve (index 0 = depot)
 * @param {number[]}  args.serviceTimes
 * @param {(stopId:string)=>number} args.indexOf   stopId -> matrix index
 * @param {(stopId:string)=>{lat,lng}} args.pointOf
 * @param {{lat,lng}} args.depot
 * @param {Array}  args.drivers       [{ _id, profile:{ shiftTiming, firstName, lastName } }]
 * @param {(points:{lat,lng}[])=>Promise<{durations:number[][]}>} args.fetchTable
 * @param {(bbox:{south,west,north,east})=>Promise<Array<{lat,lng,name,type,osmId}>>} args.fetchPois
 * @param {number|null} [args.hubModeStartSeconds] shift-relative seconds at/after
 *   which a meeting's van-shift check gets `hubModeShiftGraceSeconds` of slack.
 *   null (default) disables the grace entirely — the check stays exactly as
 *   strict as it always was.
 * @param {number} [args.hubModeShiftGraceSeconds]
 * @param {number} [args.tripCapacity] simulation-only override of the real
 *   BIKE_TRIP_CAPACITY (20/trip) rule — every real (non-simulated) call
 *   should leave this unset.
 * @returns {Promise<{handoffs, kitchenReturns, adjustedRoutes, unassignedFromTruncation, diagnostics}>}
 */
export async function findHandoffs({
  routes, durations, serviceTimes, indexOf, pointOf, depot, drivers,
  fetchTable, fetchPois, hubModeStartSeconds = null, hubModeShiftGraceSeconds = 0,
  tripCapacity = BIKE_TRIP_CAPACITY
}) {
  // Simulation-only override of the real 20/trip rule (see optimizeRoutes'
  // bikeTripCapacity option) — every caller that doesn't pass one gets
  // exactly the real BIKE_TRIP_CAPACITY, unchanged.
  const TRIP = Number.isFinite(tripCapacity) && tripCapacity > 0 ? tripCapacity : BIKE_TRIP_CAPACITY;
  const driverById = new Map(drivers.map((d) => [String(d._id), d]));
  const shiftOf = (driverId) => driverById.get(driverId)?.profile?.shiftTiming || 'unset';

  // Working copies so we can mutate estimates/stops without touching input.
  const work = routes.map((r) => ({
    ...r,
    stops: r.stops.map((s) => ({ ...s })),
    arrivals: cumulativeArrivals(r.stops.map((s) => s.deliveryId), durations, serviceTimes, indexOf),
    // Bags already committed to this van from earlier bikes in this same
    // plan — a van's own stop count never changes when it takes on a
    // handoff, so without this a second (or third...) bike's capacity check
    // would compare against the van's bare stop count every time and never
    // notice the bags already riding along.
    committedBagCount: 0
  }));

  const bikes = work.filter((r) => r.vehicleType === 'bike' && r.stops.length > TRIP);
  const vans = work.filter((r) => r.vehicleType === 'van' && r.stops.length > 0);

  const handoffs = [];
  const kitchenReturns = [];
  const unassignedFromTruncation = [];
  const diagnostics = [];

  const truncate = (bike, reason) => {
    const { batch1, batch2 } = splitBikeRoute(bike.stops, TRIP);
    unassignedFromTruncation.push(...batch2.map((s) => s.deliveryId));
    bike.stops = batch1;
    // Recompute its duration as trip 1 + return to depot, exactly as the solver would.
    const last = bike.stops[bike.stops.length - 1];
    const lastIdx = indexOf(last.deliveryId);
    bike.estimatedDurationSeconds = bike.arrivals[bike.stops.length - 1]
      + Math.round(serviceTimes[lastIdx] + durations[lastIdx][0]);
    diagnostics.push({ bikeDriverId: bike.driverId, bikeName: bike.driverName, handoff: false, reason });
  };

  if (bikes.length === 0) {
    return { handoffs, kitchenReturns, adjustedRoutes: work, unassignedFromTruncation, diagnostics };
  }

  // ---- 0. Kitchen-return option for every bike needing a second trip — one
  // small OSRM table, independent of whether any van exists at all: for each
  // bike, distance depot<->its 20th stop and depot<->its 21st stop (its own
  // 20th-to-21st leg is already in `durations`, the solver's own matrix).
  const kitchenTablePoints = [depot];
  const kitchenIndexByBike = new Map(); // driverId -> { s20: tableIndex, s21: tableIndex }
  for (const bike of bikes) {
    const s20 = bike.stops[TRIP - 1];
    const s21 = bike.stops[TRIP];
    kitchenIndexByBike.set(bike.driverId, { s20: kitchenTablePoints.length, s21: kitchenTablePoints.length + 1 });
    kitchenTablePoints.push(pointOf(s20.deliveryId), pointOf(s21.deliveryId));
  }
  const kitchenTable = (await fetchTable(kitchenTablePoints)).durations;

  // Extra time versus going straight from the 20th to the 21st stop: depot
  // round trip + reload, minus the direct leg it replaces.
  const kitchenDetourSeconds = (bike) => {
    const idx = kitchenIndexByBike.get(bike.driverId);
    const s20Idx = indexOf(bike.stops[TRIP - 1].deliveryId);
    const s21Idx = indexOf(bike.stops[TRIP].deliveryId);
    return Math.round(
      kitchenTable[idx.s20][0] + KITCHEN_RELOAD_DWELL_SECONDS + kitchenTable[0][idx.s21]
      - durations[s20Idx][s21Idx]
    );
  };

  // Try returning to the kitchen for trip 2. Returns { ok: true } and commits
  // (extends the bike's own route, no second driver involved), or
  // { ok: false, shortfallSeconds } if even that overruns the bike's shift.
  const attemptKitchenReturn = (bike, vanReason = null) => {
    const detourSeconds = kitchenDetourSeconds(bike);
    const bikeShiftSeconds = bike.maxDurationSeconds + HANDOFF_RESERVE_SECONDS; // true shift, mechanism-independent
    const projected = bike.estimatedDurationSeconds + detourSeconds;
    if (projected > bikeShiftSeconds) {
      return { ok: false, shortfallSeconds: projected - bikeShiftSeconds };
    }
    const s20Idx = indexOf(bike.stops[TRIP - 1].deliveryId);
    const plannedDepartSeconds = bike.arrivals[TRIP - 1] + Math.round(serviceTimes[s20Idx]);
    bike.estimatedDurationSeconds += detourSeconds;
    for (let j = TRIP; j < bike.arrivals.length; j += 1) bike.arrivals[j] += detourSeconds;
    kitchenReturns.push({
      bikeDriverId: bike.driverId,
      bikeName: bike.driverName,
      afterRouteOrder: TRIP - 1,
      plannedDepartSeconds,
      detourSeconds,
      // Why this bike is riding back instead of meeting a van.
      vanReason,
      deliveryIds: bike.stops.slice(TRIP).map((s) => s.deliveryId)
    });
    diagnostics.push({
      bikeDriverId: bike.driverId,
      bikeName: bike.driverName,
      handoff: true,
      kitchenReturn: true,
      detourSeconds,
      vanReason
    });
    return { ok: true };
  };

  // ---- 1. One meeting point PER BIKE, near where it's actually working (its
  // 20th stop) — "wherever the bike is" is the owner's rule, not wherever a
  // van's own route happens to pass. Every same-shift van can detour to this
  // same point from any of its own stops; step 4 picks whichever stop (and
  // van) costs least. One Overpass lookup for the whole plan, bboxed around
  // every bike that needs one.
  let pois = [];
  if (bikes.length > 0) {
    try {
      pois = await fetchPois(bboxAround(bikes.map((b) => pointOf(b.stops[TRIP - 1].deliveryId)), 1));
    } catch (err) {
      pois = []; // fall back to unsnapped meeting points at the bike's own location
    }
  }
  const meetingPointByBike = new Map(); // bike.driverId -> {lat,lng,name,poiType,osmId}
  for (const bike of bikes) {
    const p = pointOf(bike.stops[TRIP - 1].deliveryId);
    const poi = nearestPoi(p, pois, POI_SNAP_RADIUS_M);
    meetingPointByBike.set(bike.driverId, poi
      ? { lat: poi.lat, lng: poi.lng, name: poi.name, poiType: poi.type, osmId: poi.osmId }
      : {
        lat: p.lat,
        lng: p.lng,
        name: `Near ${bike.stops[TRIP - 1].address || "the bike's route"}`,
        poiType: 'unsnapped',
        osmId: null
      });
  }

  // ---- 2. Enumerate candidates: (bike, same-shift van, van stop k) for
  // EVERY stop k in the van's route — not filtered by proximity first. That's
  // what makes the van a genuine mobile hub: it can detour to a bike even if
  // its own deliveries never take it anywhere near there. Step 4 scores every
  // one and picks the cheapest detour.
  const candidates = []; // { bike, van, k, vanStopPoint, meetingPoint }
  for (const bike of bikes) {
    const bikeShift = shiftOf(bike.driverId);
    const meetingPoint = meetingPointByBike.get(bike.driverId);
    for (const van of vans) {
      if (shiftOf(van.driverId) !== bikeShift) continue;
      van.stops.forEach((stop, k) => {
        candidates.push({ bike, van, k, vanStopPoint: pointOf(stop.deliveryId), meetingPoint });
      });
    }
  }

  // ---- 3. One OSRM table over every point a detour could touch.
  const tablePoints = [];
  const tableIndex = new Map();
  const addPoint = (p) => {
    const key = pointKey(p);
    if (!tableIndex.has(key)) { tableIndex.set(key, tablePoints.length); tablePoints.push({ lat: p.lat, lng: p.lng }); }
    return tableIndex.get(key);
  };
  addPoint(depot);
  for (const c of candidates) {
    addPoint(c.meetingPoint);
    addPoint(c.vanStopPoint);
    const next = c.van.stops[c.k + 1];
    addPoint(next ? pointOf(next.deliveryId) : depot);
    addPoint(pointOf(c.bike.stops[TRIP - 1].deliveryId));
    addPoint(pointOf(c.bike.stops[TRIP].deliveryId));
  }
  let table = null;
  if (candidates.length > 0) {
    table = (await fetchTable(tablePoints)).durations;
  }
  const d = (a, b) => table[tableIndex.get(pointKey(a))][tableIndex.get(pointKey(b))];

  // ---- 4. Greedy assignment, bikes with the biggest second trip first.
  bikes.sort((a, b) => b.stops.length - a.stops.length);
  for (const bike of bikes) {
    const s20 = bike.stops[TRIP - 1];
    const s21 = bike.stops[TRIP];
    const p20 = pointOf(s20.deliveryId);
    const p21 = pointOf(s21.deliveryId);
    // Bike is ready to leave its last trip-1 stop once it has served it.
    const tB = bike.arrivals[TRIP - 1] + Math.round(serviceTimes[indexOf(s20.deliveryId)]);
    const batch2 = bike.stops.slice(TRIP);
    // The shift the bike really has: its (reserve-reduced) cap plus the reserve back.
    const bikeShiftSeconds = bike.maxDurationSeconds + HANDOFF_RESERVE_SECONDS;

    // Why each candidate was rejected, so the dispatcher is told what would
    // actually unblock this bike (a van on the right shift? one with time
    // left? a bigger van?) rather than a generic "no handoff". No more
    // "vanFull" cause — a van is limited by its own capacity/time, not an
    // arbitrary count of bikes.
    const bikeShift = shiftOf(bike.driverId);
    const sameShiftVans = vans.filter((v) => shiftOf(v.driverId) === bikeShift);
    const bikeCandidates = candidates.filter((c) => c.bike === bike);
    const rejected = { vanCapacity: 0, window: 0, vanShift: 0, bikeShift: 0 };
    let closestWait = Infinity;

    let best = null;
    for (const c of bikeCandidates) {
      const van = c.van;
      if (van.stops.length + van.committedBagCount + batch2.length > van.capacity) { rejected.vanCapacity += 1; continue; }

      // Van is ready to leave stop k once it has served it (arrivals already include earlier detours).
      const kIdx = indexOf(van.stops[c.k].deliveryId);
      const tV = van.arrivals[c.k] + Math.round(serviceTimes[kIdx]);
      const wait = Math.abs(tV - tB);
      closestWait = Math.min(closestWait, wait);
      if (wait > WAIT_TOLERANCE_SECONDS) { rejected.window += 1; continue; }

      const next = van.stops[c.k + 1];
      const pNext = next ? pointOf(next.deliveryId) : depot;
      const vanDetour = Math.round(d(c.vanStopPoint, c.meetingPoint) + HANDOFF_DWELL_SECONDS
        + d(c.meetingPoint, pNext) - d(c.vanStopPoint, pNext));
      const bikeDetour = Math.round(d(p20, c.meetingPoint) + HANDOFF_DWELL_SECONDS
        + d(c.meetingPoint, p21) - d(p20, p21));
      const vanWait = Math.max(0, tB - tV);
      const bikeWait = Math.max(0, tV - tB);

      // Hub hours: a meeting timed at/after hubModeStartSeconds gets the van's
      // shift check a small fixed grace — prioritize reaching the bike over
      // the van's own schedule, but only by a bounded amount. meetingSeconds
      // is whichever driver's arrival is later (that's when the meeting
      // actually happens; the other one waits).
      const meetingSeconds = Math.max(tV, tB);
      const graceActive = hubModeStartSeconds != null && meetingSeconds >= hubModeStartSeconds;
      const vanShiftLimit = van.maxDurationSeconds + (graceActive ? hubModeShiftGraceSeconds : 0);
      const vanShiftTotal = van.estimatedDurationSeconds + vanDetour + vanWait;
      if (vanShiftTotal > vanShiftLimit) { rejected.vanShift += 1; continue; }
      if (bike.estimatedDurationSeconds + bikeDetour + bikeWait > bikeShiftSeconds) { rejected.bikeShift += 1; continue; }

      // How much of that grace this candidate actually needed (0 if it would
      // have fit within the van's normal shift anyway) — surfaced later so a
      // handoff that only worked via the grace window isn't silent about it.
      const graceUsedSeconds = Math.max(0, vanShiftTotal - van.maxDurationSeconds);

      const score = vanDetour + bikeDetour + wait;
      if (!best || score < best.score) {
        best = { c, tV, vanDetour, bikeDetour, vanWait, bikeWait, wait, graceUsedSeconds, score };
      }
    }

    if (!best) {
      // Why no van worked — the same explanation whether the bike then falls
      // back to a kitchen return or gets truncated. A van handoff is normally
      // the cheaper option (a short detour instead of a ride back to the
      // kitchen), so a kitchen return should always come with the reason a
      // van wasn't used, not appear as an unexplained default.
      const vanNote = (() => {
        if (vans.length === 0) return 'no van in this plan';
        if (sameShiftVans.length === 0) {
          return `no van on the same shift (${bikeShift}) — handoffs only pair drivers whose shifts start together`;
        }
        const windowMin = WAIT_TOLERANCE_SECONDS / 60;
        const causes = [];
        if (rejected.window) {
          causes.push(`${rejected.window} outside the ${windowMin}-minute window (closest timing was ${Math.round(closestWait / 60)} min apart)`);
        }
        if (rejected.vanShift) causes.push(`${rejected.vanShift} where the van has no shift time left for the detour and wait`);
        if (rejected.vanCapacity) causes.push(`${rejected.vanCapacity} where the van has no room for ${batch2.length} more bags`);
        if (rejected.bikeShift) causes.push(`${rejected.bikeShift} where the bike's own shift can't absorb the detour`);
        return `${bikeCandidates.length} same-shift van ${bikeCandidates.length === 1 ? 'stop' : 'stops'} considered, but ${causes.join('; ')}`;
      })();

      // No van handoff worked — try the bike just riding back to the kitchen
      // itself before giving up on the second trip.
      const kitchen = attemptKitchenReturn(bike, vanNote);
      if (kitchen.ok) continue;

      const spareH = ((bikeShiftSeconds - bike.estimatedDurationSeconds) / 3600).toFixed(1);
      const kitchenNote = `returning to the kitchen itself would run ${Math.round(kitchen.shortfallSeconds / 60)} min over the shift`;
      const reason = `Had ~${spareH} h spare; ${vanNote}, and ${kitchenNote} — add/extend a van, extend the bike's shift, or assign trip 2 manually.`;
      truncate(bike, reason);
      continue;
    }

    // ---- Commit.
    const { c, tV, vanDetour, bikeDetour, vanWait, bikeWait, wait, graceUsedSeconds } = best;
    const van = c.van;
    const vanDelta = vanDetour + vanWait;
    van.estimatedDurationSeconds += vanDelta;
    for (let j = c.k + 1; j < van.arrivals.length; j += 1) van.arrivals[j] += vanDelta; // downstream stops slip
    van.committedBagCount += batch2.length;
    bike.estimatedDurationSeconds += bikeDetour + bikeWait;

    handoffs.push({
      bikeDriverId: bike.driverId,
      bikeName: bike.driverName,
      vanDriverId: van.driverId,
      vanName: van.driverName,
      vanAfterRouteOrder: c.k,
      bikeAfterRouteOrder: TRIP - 1,
      meetingPoint: c.meetingPoint,
      plannedVanArrivalSeconds: tV,
      plannedBikeArrivalSeconds: tB,
      expectedWaitSeconds: wait,
      // > 0 only when this meeting needed the hub-hours grace to fit the
      // van's shift — i.e. the van is running this many seconds past its
      // normal shift specifically to reach this bike.
      hubGraceUsedSeconds: graceUsedSeconds || 0,
      deliveryIds: batch2.map((s) => s.deliveryId)
    });
    diagnostics.push({
      bikeDriverId: bike.driverId,
      bikeName: bike.driverName,
      handoff: true,
      vanName: van.driverName,
      hubGraceUsedSeconds: graceUsedSeconds || 0
    });
  }

  // Strip working fields before returning.
  const adjustedRoutes = work.map(({ arrivals, committedBagCount, ...rest }) => rest);
  return { handoffs, kitchenReturns, adjustedRoutes, unassignedFromTruncation, diagnostics };
}
