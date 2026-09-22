// Run with: npm test (node --test) from server/.
// Pure-function coverage for the Matter delivery import job (owner,
// 2026-09-22): parsing Matter's "By N AM" delivery_window label into an
// hour, and converting a business-local date + hour into the UTC instant
// scheduledTime uses. The DB-writing half (importMatterDeliveriesForDate)
// needs a live Matter API + DB and was verified manually against one real
// subscription (see the plan doc), not covered here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWindowHour, scheduledTimeFor, buildAddressLine } from './matterDeliveryImportService.js';

test('parses every real window label seen live (3 AM through 10 AM)', () => {
  assert.equal(parseWindowHour({ label: 'By 3 AM' }), 3);
  assert.equal(parseWindowHour({ label: 'By 6 AM' }), 6);
  assert.equal(parseWindowHour({ label: 'By 10 AM' }), 10);
});

test('handles a PM label correctly (24h conversion), even though none exist today', () => {
  assert.equal(parseWindowHour({ label: 'By 1 PM' }), 13);
  assert.equal(parseWindowHour({ label: 'By 12 PM' }), 12);
  assert.equal(parseWindowHour({ label: 'By 12 AM' }), 0);
});

test('returns null for a missing or unrecognized window, so the caller can fall back', () => {
  assert.equal(parseWindowHour(null), null);
  assert.equal(parseWindowHour({}), null);
  assert.equal(parseWindowHour({ label: 'Some new label with no time in it' }), null);
});

test('scheduledTimeFor produces the correct UTC instant for UAE (UTC+4) local time', () => {
  // 2026-09-23 06:00 Dubai time = 2026-09-23 02:00 UTC.
  const result = scheduledTimeFor('2026-09-23', 6);
  assert.equal(result.toISOString(), '2026-09-23T02:00:00.000Z');
});

test('scheduledTimeFor at local midnight lands on the previous UTC day (UAE is ahead of UTC)', () => {
  // 2026-09-23 00:00 Dubai time = 2026-09-22 20:00 UTC.
  const result = scheduledTimeFor('2026-09-23', 0);
  assert.equal(result.toISOString(), '2026-09-22T20:00:00.000Z');
});

test('buildAddressLine joins the real Matter address fields in the expected order (real shape verified live)', () => {
  const line = buildAddressLine({
    building: 'Al Bandar',
    unit: '1403 Al Nassem C',
    floor: '14',
    area: 'Al Rahah',
    emirate: 'Abu Dhabi'
  });
  assert.equal(line, 'Al Bandar, Unit 1403 Al Nassem C, 14, Al Rahah, Abu Dhabi');
});

test('buildAddressLine skips missing parts cleanly instead of leaving stray commas', () => {
  assert.equal(buildAddressLine({ area: 'JVC', emirate: 'Dubai' }), 'JVC, Dubai');
  assert.equal(buildAddressLine({}), '');
});
