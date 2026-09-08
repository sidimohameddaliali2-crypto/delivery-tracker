// Run with: npm test (node --test) from server/.
// Pure-function coverage for the vehicle-based service-time rule (owner,
// 2026-09-05: flat time at the door by vehicle — bike 10 min, van 5 min —
// villa and apartment no longer differ). The rest of routeOptimizationService
// needs a live DB/OSRM/solver and is covered by manual end-to-end runs
// (see the plan doc), not unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceSecondsForVehicleType } from './routeOptimizationService.js';

test('bike gets 10 minutes at the door', () => {
  assert.equal(serviceSecondsForVehicleType('bike'), 10 * 60);
});

test('van gets 5 minutes at the door', () => {
  assert.equal(serviceSecondsForVehicleType('van'), 5 * 60);
});

test('an unknown/car vehicle type defaults to the slower (bike) figure, not the fastest', () => {
  assert.equal(serviceSecondsForVehicleType('car'), 10 * 60);
  assert.equal(serviceSecondsForVehicleType(undefined), 10 * 60);
  assert.equal(serviceSecondsForVehicleType(''), 10 * 60);
});
