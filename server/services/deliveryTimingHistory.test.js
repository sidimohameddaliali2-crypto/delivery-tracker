import test from 'node:test';
import assert from 'node:assert/strict';

process.env.LOCAL_TIMEZONE_OFFSET_MINUTES = '240';
const { businessRangeBounds } = await import('./deliveryTimingHistory.js');

test('businessRangeBounds maps inclusive Dubai days to UTC bounds', () => {
  const { from, to } = businessRangeBounds('2026-10-05', '2026-10-05');
  assert.equal(from.toISOString(), '2026-10-04T20:00:00.000Z');
  assert.equal(to.toISOString(), '2026-10-05T20:00:00.000Z');
});

test('businessRangeBounds spans multiple days across a month end', () => {
  const { from, to } = businessRangeBounds('2026-09-30', '2026-10-02');
  assert.equal(from.toISOString(), '2026-09-29T20:00:00.000Z');
  assert.equal(to.toISOString(), '2026-10-02T20:00:00.000Z');
});

test('businessRangeBounds rejects bad input and reversed ranges', () => {
  assert.throws(() => businessRangeBounds('nope', '2026-10-05'), /YYYY-MM-DD/);
  assert.throws(() => businessRangeBounds('2026-10-06', '2026-10-05'), /End date/);
});
