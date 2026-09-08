// Run with: npm test (node --test) from server/.
// Pure-fixture tests for the van↔bike handoff planner — no DB, no OSRM, no
// Overpass. Geometry is a synthetic straight-line world at 30 km/h so every
// expected number is derivable by hand.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { haversineKm } from './geocoding.js';
import {
  cumulativeArrivals,
  splitBikeRoute,
  findHandoffs,
  BIKE_TRIP_CAPACITY,
  HANDOFF_RESERVE_SECONDS,
  WAIT_TOLERANCE_SECONDS,
  HANDOFF_DWELL_SECONDS,
  KITCHEN_RELOAD_DWELL_SECONDS
} from './handoffPlanner.js';

const SECONDS_PER_KM = 120; // 30 km/h
const travel = (a, b) => haversineKm(a.lat, a.lng, b.lat, b.lng) * SECONDS_PER_KM;

/**
 * Build a tiny world: depot, a bike route of `bikeStops` stops spaced 0.5 km
 * east of the depot, and a van whose route is [V0 (long dwell), V1 (near the
 * bike's 20th stop), V2]. V0's dwell time is the knob that positions the
 * van's arrival at V1 relative to the bike's readiness time.
 */
function makeWorld({
  bikeStops = 22, v0Dwell = 11500, vanCapacity = 100, vanShift = 12 * 3600,
  bikeShiftTiming = 'morning', vanShiftTiming = 'morning', vanFarFromBike = false
} = {}) {
  const depot = { lat: 25.10, lng: 55.20 };
  const coords = { depot };
  const ids = ['depot'];
  for (let i = 1; i <= bikeStops; i += 1) {
    ids.push(`B${i}`);
    coords[`B${i}`] = { lat: 25.10, lng: 55.20 + i * 0.005 };
  }
  // V1 sits ~1 km north of the bike's 20th stop — or of its last stop when
  // the fixture has fewer than 20, so short-route cases still build. With
  // `vanFarFromBike`, the whole van route sits well away from the bike
  // instead — nothing for an old proximity filter to find — so a meeting can
  // only come from the "detour to wherever the bike is" behavior.
  const anchor = coords[`B${Math.min(bikeStops, BIKE_TRIP_CAPACITY)}`];
  coords.V0 = { lat: 25.13, lng: 55.20 };
  coords.V1 = vanFarFromBike ? { lat: 25.14, lng: 55.20 } : { lat: anchor.lat + 0.009, lng: anchor.lng };
  coords.V2 = { lat: 25.16, lng: 55.32 };
  ids.push('V0', 'V1', 'V2');

  const index = new Map(ids.map((id, i) => [id, i]));
  const durations = ids.map((a) => ids.map((b) => (a === b ? 0 : travel(coords[a], coords[b]))));
  const serviceTimes = ids.map((id) => (id === 'depot' ? 0 : id === 'V0' ? v0Dwell : 600));

  const indexOf = (id) => index.get(id);
  const pointOf = (id) => coords[id];
  const routeDuration = (stopIds) => {
    const arr = cumulativeArrivals(stopIds, durations, serviceTimes, indexOf);
    const last = indexOf(stopIds[stopIds.length - 1]);
    return arr[arr.length - 1] + Math.round(serviceTimes[last] + durations[last][0]);
  };
  const mkStops = (stopIds) => stopIds.map((id, i) => ({ deliveryId: id, routeOrder: i, customerName: id, address: `${id} street` }));

  const bikeIds = ids.filter((id) => id.startsWith('B'));
  const vanIds = ['V0', 'V1', 'V2'];
  const bikeShift = 12 * 3600;
  const routes = [
    {
      driverId: 'bike1', driverName: 'Bike One', vehicleType: 'bike', capacity: 40,
      maxDurationSeconds: bikeShift - HANDOFF_RESERVE_SECONDS,
      estimatedDurationSeconds: routeDuration(bikeIds), stops: mkStops(bikeIds)
    },
    {
      driverId: 'van1', driverName: 'Van One', vehicleType: 'van', capacity: vanCapacity,
      maxDurationSeconds: vanShift, estimatedDurationSeconds: routeDuration(vanIds), stops: mkStops(vanIds)
    }
  ];
  const drivers = [
    { _id: 'bike1', profile: { shiftTiming: bikeShiftTiming, firstName: 'Bike' } },
    { _id: 'van1', profile: { shiftTiming: vanShiftTiming, firstName: 'Van' } }
  ];

  const fetchTable = async (points) => ({ durations: points.map((a) => points.map((b) => travel(a, b))) });
  // The meeting point is searched for near the BIKE (its 20th stop / `anchor`),
  // not near any particular van stop — a van detours to wherever the bike is.
  const fetchPois = async () => [{ lat: anchor.lat + 0.0015, lng: anchor.lng, name: 'Emarat', type: 'fuel', osmId: 'node/1' }];

  return { depot, durations, serviceTimes, indexOf, pointOf, routes, drivers, fetchTable, fetchPois, coords, ids, routeDuration };
}

test('cumulativeArrivals reproduces the solver arc rule (travel + service of the FROM node)', () => {
  const w = makeWorld();
  const arr = cumulativeArrivals(['B1', 'B2'], w.durations, w.serviceTimes, w.indexOf);
  const d0 = w.indexOf('depot'); const i1 = w.indexOf('B1'); const i2 = w.indexOf('B2');
  assert.equal(arr[0], Math.round(w.durations[d0][i1] + 0));
  assert.equal(arr[1], arr[0] + Math.round(w.durations[i1][i2] + w.serviceTimes[i1]));
});

test('splitBikeRoute splits at the trip capacity', () => {
  const stops = Array.from({ length: 23 }, (_, i) => ({ deliveryId: `S${i}` }));
  const { batch1, batch2 } = splitBikeRoute(stops);
  assert.equal(batch1.length, BIKE_TRIP_CAPACITY);
  assert.equal(batch2.length, 3);
});

test('a bike with <= 20 stops is left alone and needs no handoff', async () => {
  const w = makeWorld({ bikeStops: 18 });
  const out = await findHandoffs({ ...w });
  assert.equal(out.handoffs.length, 0);
  assert.equal(out.unassignedFromTruncation.length, 0);
  assert.equal(out.adjustedRoutes[0].stops.length, 18);
});

test('feasible handoff: van arrives within the wait window, snaps to the fuel POI, adds detour + dwell to both', async () => {
  const w = makeWorld({ v0Dwell: 11500 });
  const vanBefore = w.routes[1].estimatedDurationSeconds;
  const bikeBefore = w.routes[0].estimatedDurationSeconds;
  const out = await findHandoffs({ ...w });
  assert.equal(out.handoffs.length, 1);
  const h = out.handoffs[0];
  assert.equal(h.bikeDriverId, 'bike1');
  assert.equal(h.vanDriverId, 'van1');
  assert.equal(h.bikeAfterRouteOrder, BIKE_TRIP_CAPACITY - 1);
  assert.equal(h.vanAfterRouteOrder, 1); // after V1
  assert.equal(h.meetingPoint.name, 'Emarat');
  assert.equal(h.meetingPoint.poiType, 'fuel');
  assert.deepEqual(h.deliveryIds, ['B21', 'B22']);
  assert.ok(h.expectedWaitSeconds <= WAIT_TOLERANCE_SECONDS);
  const van = out.adjustedRoutes.find((r) => r.driverId === 'van1');
  const bike = out.adjustedRoutes.find((r) => r.driverId === 'bike1');
  assert.ok(van.estimatedDurationSeconds >= vanBefore + HANDOFF_DWELL_SECONDS, 'van gained at least the dwell');
  assert.ok(bike.estimatedDurationSeconds >= bikeBefore + HANDOFF_DWELL_SECONDS, 'bike gained at least the dwell');
  assert.equal(bike.stops.length, 22, 'bike keeps both trips');
  assert.equal(out.unassignedFromTruncation.length, 0);
});

test('van handoff fails outside the wait window, but the bike still gets trip 2 via a kitchen return', async () => {
  const w = makeWorld({ v0Dwell: 30000 }); // van arrives far too late
  const out = await findHandoffs({ ...w });
  assert.equal(out.handoffs.length, 0, 'no van handoff committed');
  assert.equal(out.kitchenReturns.length, 1);
  // The recorded reason must name the actual blocker (the timing window), not
  // just say a van wasn't used.
  assert.match(out.kitchenReturns[0].vanReason, /minute window/);
  assert.equal(out.unassignedFromTruncation.length, 0, 'nothing dropped — the kitchen return covers it');
  const k = out.kitchenReturns[0];
  assert.equal(k.bikeDriverId, 'bike1');
  assert.equal(k.afterRouteOrder, BIKE_TRIP_CAPACITY - 1);
  assert.deepEqual(k.deliveryIds, ['B21', 'B22']);
  assert.ok(k.detourSeconds > 0, 'the depot round trip costs real time');
  const bike = out.adjustedRoutes.find((r) => r.driverId === 'bike1');
  assert.equal(bike.stops.length, BIKE_TRIP_CAPACITY + 2, 'bike keeps both trips');
  assert.equal(out.diagnostics[0].kitchenReturn, true);
});

test('van without spare capacity for the extra bags is rejected, but a kitchen return still covers trip 2', async () => {
  const w = makeWorld({ vanCapacity: 3 }); // 3 own stops + 2 bags > 3
  const out = await findHandoffs({ ...w });
  assert.equal(out.handoffs.length, 0);
  assert.equal(out.kitchenReturns.length, 1);
  assert.equal(out.unassignedFromTruncation.length, 0);
});

test('drivers on different shifts are never paired for a van handoff, but a kitchen return needs no second driver', async () => {
  const w = makeWorld({ vanShiftTiming: 'afternoon' });
  const out = await findHandoffs({ ...w });
  assert.equal(out.handoffs.length, 0);
  assert.equal(out.kitchenReturns.length, 1);
  assert.equal(out.unassignedFromTruncation.length, 0);
});

test('no van in the plan at all: the bike still gets its second trip via a kitchen return', async () => {
  const w = makeWorld();
  const out = await findHandoffs({ ...w, routes: [w.routes[0]], drivers: [w.drivers[0]] }); // drop the van entirely
  assert.equal(out.handoffs.length, 0);
  assert.equal(out.kitchenReturns.length, 1);
  const k = out.kitchenReturns[0];
  assert.equal(k.bikeDriverId, 'bike1');
  // A kitchen return is a FALLBACK, so it must always say why no van took it —
  // otherwise it reads as an unexplained default in the dispatcher's plan.
  assert.match(k.vanReason, /no van in this plan/);
  assert.match(out.diagnostics[0].vanReason, /no van in this plan/);
  assert.deepEqual(k.deliveryIds, ['B21', 'B22']);
  const bike = out.adjustedRoutes.find((r) => r.driverId === 'bike1');
  assert.equal(bike.stops.length, BIKE_TRIP_CAPACITY + 2);
  assert.equal(out.unassignedFromTruncation.length, 0);
});

test('when neither a van handoff nor a kitchen return fits the shift, the bike is truncated and the reason names both', async () => {
  const w = makeWorld({ v0Dwell: 30000 }); // van still rejected on timing, as above
  const bikeIds = w.ids.filter((id) => id.startsWith('B'));
  const baseDuration = w.routeDuration(bikeIds);
  const p20 = w.coords[bikeIds[BIKE_TRIP_CAPACITY - 1]];
  const p21 = w.coords[bikeIds[BIKE_TRIP_CAPACITY]];
  const kitchenDetour = Math.round(
    travel(w.depot, p20) + KITCHEN_RELOAD_DWELL_SECONDS + travel(w.depot, p21) - travel(p20, p21)
  );
  // Enough true shift for trip 1+2 alone, not enough once the kitchen detour is added too.
  const trueShift = baseDuration + Math.round(kitchenDetour / 2);
  const routes = [
    { ...w.routes[0], maxDurationSeconds: trueShift - HANDOFF_RESERVE_SECONDS, estimatedDurationSeconds: baseDuration },
    w.routes[1]
  ];
  const out = await findHandoffs({ ...w, routes });
  assert.equal(out.handoffs.length, 0);
  assert.equal(out.kitchenReturns.length, 0);
  assert.deepEqual(out.unassignedFromTruncation, ['B21', 'B22']);
  assert.match(out.diagnostics[0].reason, /minute window/, 'names why the van handoff failed');
  assert.match(out.diagnostics[0].reason, /kitchen itself would run/, 'names why the kitchen return also failed');
  // Truncated duration is trip 1 + return to depot, not the full 22-stop figure.
  const bike = out.adjustedRoutes.find((r) => r.driverId === 'bike1');
  assert.equal(bike.estimatedDurationSeconds, w.routeDuration(bike.stops.map((s) => s.deliveryId)));
});

test('POI lookup failure falls back to an unsnapped meeting point at the bike\'s own location', async () => {
  const w = makeWorld();
  const out = await findHandoffs({ ...w, fetchPois: async () => { throw new Error('overpass down'); } });
  assert.equal(out.handoffs.length, 1);
  assert.equal(out.handoffs[0].meetingPoint.poiType, 'unsnapped');
  assert.equal(out.handoffs[0].meetingPoint.lat, w.coords.B20.lat);
  assert.match(out.handoffs[0].meetingPoint.name, /Near B20 street/);
});

test('van is a mobile hub: a meeting is found even though none of the van\'s own stops are anywhere near the bike', async () => {
  const w = makeWorld({ v0Dwell: 11500, vanFarFromBike: true });
  const out = await findHandoffs({ ...w });
  assert.equal(out.handoffs.length, 1, 'the van detours to the bike instead of falling back to a kitchen return');
  const h = out.handoffs[0];
  // Meets where the BIKE is working, not anywhere near the van's own route.
  assert.ok(haversineKm(h.meetingPoint.lat, h.meetingPoint.lng, w.coords.B20.lat, w.coords.B20.lng) < 1);
  assert.ok(
    haversineKm(h.meetingPoint.lat, h.meetingPoint.lng, w.coords.V1.lat, w.coords.V1.lng) > 5,
    'the meeting point is nowhere near the van\'s own (relocated, distant) stop'
  );
  assert.equal(out.kitchenReturns.length, 0);
  assert.equal(out.unassignedFromTruncation.length, 0);
});

test('as many bikes as fit a van\'s capacity — no fixed cap on handoffs per van', async () => {
  const w = makeWorld({ v0Dwell: 11500, vanCapacity: 100 });
  // Four identical bikes, all wanting the same van.
  const bikeClones = ['bike2', 'bike3', 'bike4'].map((id, i) => ({
    ...w.routes[0], driverId: id, driverName: `Bike ${i + 2}`, stops: w.routes[0].stops.map((s) => ({ ...s }))
  }));
  const driverClones = ['bike2', 'bike3', 'bike4'].map((id) => ({ _id: id, profile: { shiftTiming: 'morning', firstName: id } }));
  const routes = [w.routes[0], ...bikeClones, w.routes[1]];
  const drivers = [...w.drivers, ...driverClones];
  const out = await findHandoffs({ ...w, routes, drivers });
  // Previously hard-capped at 2 handoffs per van regardless of capacity —
  // all 4 should now be served by the one (100-capacity) van.
  assert.equal(out.handoffs.length, 4);
  assert.equal(out.kitchenReturns.length, 0);
  assert.equal(new Set(out.handoffs.map((h) => h.vanDriverId)).size, 1, 'all four met the same van');
});

test('capacity still genuinely limits a van — the real limiter, not an arbitrary count', async () => {
  const w = makeWorld({ v0Dwell: 11500, vanCapacity: 3 + 2 }); // room for its own 3 stops + exactly 1 bike's 2 bags
  const bike2 = { ...w.routes[0], driverId: 'bike2', driverName: 'Bike Two', stops: w.routes[0].stops.map((s) => ({ ...s })) };
  const routes = [w.routes[0], bike2, w.routes[1]];
  const drivers = [...w.drivers, { _id: 'bike2', profile: { shiftTiming: 'morning', firstName: 'Bike2' } }];
  const out = await findHandoffs({ ...w, routes, drivers });
  assert.equal(out.handoffs.length, 1, 'only one bike\'s bags fit once the van is genuinely full');
  assert.equal(out.kitchenReturns.length, 1, 'the second bike falls back to a kitchen return');
  assert.match(out.kitchenReturns[0].vanReason, /no room for/);
});

test('hub hours: a meeting after hubModeStartSeconds is accepted via the grace window, and the grace usage is reported', async () => {
  const w = makeWorld({ v0Dwell: 11500 });
  // Tighten van1's shift to just past its own base route — not enough left
  // for the handoff detour — then grant a grace window comfortably larger
  // than the shortfall.
  const tightVan = { ...w.routes[1], maxDurationSeconds: w.routes[1].estimatedDurationSeconds + 60 };
  const routesTight = [w.routes[0], tightVan];

  const withoutGrace = await findHandoffs({ ...w, routes: routesTight });
  assert.equal(withoutGrace.handoffs.length, 0, 'sanity check: the tightened shift genuinely blocks the handoff on its own');

  const withGrace = await findHandoffs({
    ...w, routes: routesTight, hubModeStartSeconds: 0, hubModeShiftGraceSeconds: 30 * 60
  });
  assert.equal(withGrace.handoffs.length, 1, 'the grace window covers the shortfall');
  assert.ok(withGrace.handoffs[0].hubGraceUsedSeconds > 0, 'reports that the grace window was actually needed');

  // A meeting scheduled BEFORE the threshold gets no grace at all.
  const tooLate = await findHandoffs({
    ...w, routes: routesTight, hubModeStartSeconds: 999999, hubModeShiftGraceSeconds: 30 * 60
  });
  assert.equal(tooLate.handoffs.length, 0, 'grace only applies at/after hubModeStartSeconds');
});

test('two bikes on one van: the second handoff sees the van delayed by the first', async () => {
  const w = makeWorld({ v0Dwell: 11500 });
  // Clone the bike as a second, identical bike route.
  const bike2 = { ...w.routes[0], driverId: 'bike2', driverName: 'Bike Two', stops: w.routes[0].stops.map((s) => ({ ...s })) };
  const routes = [w.routes[0], bike2, w.routes[1]];
  const drivers = [...w.drivers, { _id: 'bike2', profile: { shiftTiming: 'morning', firstName: 'Bike2' } }];
  const vanBefore = w.routes[1].estimatedDurationSeconds;
  const out = await findHandoffs({ ...w, routes, drivers });
  assert.equal(out.handoffs.length, 2);
  const [first, second] = out.handoffs;
  assert.ok(second.plannedVanArrivalSeconds >= first.plannedVanArrivalSeconds, 'downstream van timing slips after the first handoff');
  const van = out.adjustedRoutes.find((r) => r.driverId === 'van1');
  assert.ok(van.estimatedDurationSeconds >= vanBefore + 2 * HANDOFF_DWELL_SECONDS);
});
