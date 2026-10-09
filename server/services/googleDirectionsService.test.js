import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodePolyline, stripHtml } from './googleDirectionsService.js';

test('decodePolyline matches Google\'s own documented example', () => {
  // https://developers.google.com/maps/documentation/utilities/polylinealgorithm
  const points = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(points.length, 3);
  assert.ok(Math.abs(points[0].latitude - 38.5) < 1e-6);
  assert.ok(Math.abs(points[0].longitude - (-120.2)) < 1e-6);
  assert.ok(Math.abs(points[1].latitude - 40.7) < 1e-6);
  assert.ok(Math.abs(points[1].longitude - (-120.95)) < 1e-6);
  assert.ok(Math.abs(points[2].latitude - 43.252) < 1e-6);
  assert.ok(Math.abs(points[2].longitude - (-126.453)) < 1e-6);
});

test('decodePolyline handles a single-point polyline without throwing', () => {
  // Shortest possible valid encoding: one point at (0,0) is the empty string
  // (no movement from origin), so use a known 1-point encoding instead.
  const points = decodePolyline('_p~iF~ps|U');
  assert.equal(points.length, 1);
  assert.ok(Math.abs(points[0].latitude - 38.5) < 1e-6);
  assert.ok(Math.abs(points[0].longitude - (-120.2)) < 1e-6);
});

test('decodePolyline returns empty array for empty input', () => {
  assert.deepEqual(decodePolyline(''), []);
});

test('stripHtml removes bold tags from a real Google instruction string', () => {
  assert.equal(
    stripHtml('Turn <b>left</b> onto <b>Palm Grove St</b>'),
    'Turn left onto Palm Grove St'
  );
});

test('stripHtml decodes &amp; and &nbsp; entities', () => {
  assert.equal(stripHtml('Exit 4A&nbsp;&amp;&nbsp;merge onto I-95'), 'Exit 4A & merge onto I-95');
});

test('stripHtml handles null/undefined without throwing', () => {
  assert.equal(stripHtml(null), '');
  assert.equal(stripHtml(undefined), '');
});
