// Run with: npm test (node --test) from server/.
// Pure-function coverage for selectBestAddress — the address-picking logic
// added 2026-09-22 after a real bug: a customer with two saved addresses
// (Maripet Cabauatan, subscription 13095) had customer_addresses[0] be a
// near-empty "secondary" entry (just an emirate) while customer_addresses[1]
// was the real "Home" address — blindly taking index 0 showed "Dubai" as
// the whole delivery address while a full one sat right next to it. Matter
// actually exposes an authoritative `current_delivery_address` flag (found
// live the same day, on the owner's tip) — checked first now, with the
// completeness heuristic only as a fallback for the case (not seen in
// practice) where nothing is flagged current.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectBestAddress } from './matterApiService.js';

test('picks the address flagged current_delivery_address, ignoring completeness entirely (the real fix)', () => {
  const addresses = [
    { id: 1356, type: 'secondary', current_delivery_address: false, label: null, emirate: 'Dubai', area: null, building: null, unit: null, floor: null, status: 'active' },
    { id: 1587, type: 'secondary', current_delivery_address: true, label: 'Home', emirate: 'Dubai', area: 'Al Hebiah Fourth', street: 'Dubai Sports City', building: 'Dubai Sports City', unit: '615 Elite 4 Residence', floor: '6th floor', status: 'active' }
  ];
  const result = selectBestAddress(addresses);
  assert.equal(result.id, 1587);
});

test('current_delivery_address wins even over a more "complete" address that is not flagged current', () => {
  const addresses = [
    { id: 1, current_delivery_address: true, area: 'Sparse', status: 'active' },
    { id: 2, current_delivery_address: false, area: 'A', building: 'B', street: 'C', unit: 'D', floor: 'E', status: 'active' }
  ];
  assert.equal(selectBestAddress(addresses).id, 1);
});

test('falls back to the completeness heuristic when no address is flagged current (not seen live, but handled)', () => {
  const addresses = [
    { id: 1356, type: 'secondary', label: null, emirate: 'Dubai', area: null, building: null, unit: null, floor: null, status: 'active' },
    { id: 1587, type: 'secondary', label: 'Home', emirate: 'Dubai', area: 'Al Hebiah Fourth', street: 'Dubai Sports City', building: 'Dubai Sports City', unit: '615 Elite 4 Residence', floor: '6th floor', status: 'active' }
  ];
  const result = selectBestAddress(addresses);
  assert.equal(result.id, 1587);
});

test('prefers an address actually marked primary, when it has real data', () => {
  const addresses = [
    { id: 1, type: 'secondary', area: 'A', building: 'B', status: 'active' },
    { id: 2, type: 'primary', area: 'C', building: 'D', status: 'active' }
  ];
  assert.equal(selectBestAddress(addresses).id, 2);
});

test('a "primary" address with no real data loses to a more complete secondary one', () => {
  const addresses = [
    { id: 1, type: 'primary', area: null, building: null, status: 'active' },
    { id: 2, type: 'secondary', area: 'A', building: 'B', status: 'active' }
  ];
  assert.equal(selectBestAddress(addresses).id, 2);
});

test('prefers an active address over an inactive one, even if the inactive one is more complete', () => {
  const addresses = [
    { id: 1, type: 'secondary', area: 'A', building: 'B', floor: 'C', status: 'inactive' },
    { id: 2, type: 'secondary', area: 'D', status: 'active' }
  ];
  assert.equal(selectBestAddress(addresses).id, 2);
});

test('a single address is returned as-is regardless of completeness', () => {
  const addresses = [{ id: 1, emirate: 'Dubai', status: 'active' }];
  assert.equal(selectBestAddress(addresses).id, 1);
});

test('returns null for an empty or missing address list', () => {
  assert.equal(selectBestAddress([]), null);
  assert.equal(selectBestAddress(null), null);
  assert.equal(selectBestAddress(undefined), null);
});
