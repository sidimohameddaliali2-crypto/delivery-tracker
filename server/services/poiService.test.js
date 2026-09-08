// Run with: npm test (node --test) from server/.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  findMeetingPois,
  cellsForBbox,
  buildOverpassQuery,
  parseOverpassElements,
  clearPoiMemoryCache
} from './poiService.js';

beforeEach(() => clearPoiMemoryCache());

const bbox = { south: 25.10, west: 55.20, north: 25.13, east: 55.24 };

test('cellsForBbox covers the box with ~2km cells', () => {
  const cells = cellsForBbox(bbox);
  assert.ok(cells.length >= 4);
  assert.ok(cells.every((c) => c.key.startsWith('handoff:poi:v1:')));
});

test('buildOverpassQuery asks for fuel + parking within the bbox', () => {
  const q = buildOverpassQuery(bbox);
  assert.match(q, /\[out:json\]/);
  assert.match(q, /node\[amenity=fuel\]\(25\.1,55\.2,25\.13,55\.24\)/);
  assert.match(q, /way\[amenity=parking\]/);
  assert.match(q, /out center;/);
});

test('parseOverpassElements handles nodes, ways-with-center, and skips junk', () => {
  const pois = parseOverpassElements([
    { type: 'node', id: 1, lat: 25.11, lon: 55.21, tags: { amenity: 'fuel', brand: 'Emarat' } },
    { type: 'way', id: 2, center: { lat: 25.12, lon: 55.22 }, tags: { amenity: 'parking' } },
    { type: 'node', id: 3, lat: 25.12, lon: 55.22, tags: { amenity: 'cafe' } },
    { type: 'node', id: 4, tags: { amenity: 'fuel' } }
  ]);
  assert.equal(pois.length, 2);
  assert.equal(pois[0].name, 'Emarat');
  assert.equal(pois[1].name, 'Parking');
  assert.equal(pois[1].osmId, 'way/2');
});

test('second lookup for the same area is served from the in-process cache (one network call)', async () => {
  let calls = 0;
  const fetchFn = async () => {
    calls += 1;
    return [{ type: 'node', id: 9, lat: 25.115, lon: 55.215, tags: { amenity: 'fuel', name: 'ENOC' } }];
  };
  const first = await findMeetingPois(bbox, { fetchFn });
  const second = await findMeetingPois(bbox, { fetchFn });
  assert.equal(calls, 1);
  assert.equal(first.length, 1);
  assert.deepEqual(second, first);
});

test('results outside the requested bbox are filtered out', async () => {
  const fetchFn = async () => [
    { type: 'node', id: 1, lat: 25.115, lon: 55.215, tags: { amenity: 'fuel' } },
    { type: 'node', id: 2, lat: 25.20, lon: 55.30, tags: { amenity: 'fuel' } } // outside
  ];
  const pois = await findMeetingPois(bbox, { fetchFn });
  assert.equal(pois.length, 1);
});
