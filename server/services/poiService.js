// Meeting-point candidates (petrol stations / parking) for van↔bike handoffs,
// from OpenStreetMap via the Overpass API — free, and the same underlying
// map data as the self-hosted OSRM routing, so no Google billing involved.
//
// The public Overpass instance is fair-use rate-limited, so this never
// queries per candidate. handoffPlanner asks ONCE per plan for a bounding
// box; results are cached per ~2 km grid cell (POIs are effectively static,
// 30-day TTL) in Redis via config/cache.js — which returns null/false
// gracefully when Redis is down — with an in-process Map in front so a
// Redis outage still doesn't re-hit Overpass within the same server run.

import axios from 'axios';
import { cacheGet, cacheSet } from '../config/cache.js';

export const OVERPASS_BASE_URL = process.env.OVERPASS_BASE_URL || 'https://overpass-api.de/api/interpreter';
const OVERPASS_TIMEOUT_MS = 8000;
const CELL_DEG = 0.02; // ~2 km at Dubai's latitude
const CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const CACHE_PREFIX = 'handoff:poi:v1';

const memoryCache = new Map(); // cellKey -> { expiresAt, pois }

const cellKey = (latCell, lngCell) => `${CACHE_PREFIX}:${latCell}:${lngCell}`;

/** Grid cells (as {latCell, lngCell, key}) covering a bbox. */
export function cellsForBbox({ south, west, north, east }) {
  const cells = [];
  const latStart = Math.floor(south / CELL_DEG);
  const latEnd = Math.floor(north / CELL_DEG);
  const lngStart = Math.floor(west / CELL_DEG);
  const lngEnd = Math.floor(east / CELL_DEG);
  for (let a = latStart; a <= latEnd; a += 1) {
    for (let b = lngStart; b <= lngEnd; b += 1) {
      cells.push({ latCell: a, lngCell: b, key: cellKey(a, b) });
    }
  }
  return cells;
}

const cellBbox = (cells) => ({
  south: Math.min(...cells.map((c) => c.latCell)) * CELL_DEG,
  north: (Math.max(...cells.map((c) => c.latCell)) + 1) * CELL_DEG,
  west: Math.min(...cells.map((c) => c.lngCell)) * CELL_DEG,
  east: (Math.max(...cells.map((c) => c.lngCell)) + 1) * CELL_DEG
});

export function buildOverpassQuery({ south, west, north, east }) {
  const box = `(${south},${west},${north},${east})`;
  return `[out:json][timeout:25];(node[amenity=fuel]${box};node[amenity=parking]${box};way[amenity=parking]${box};);out center;`;
}

/** Normalize Overpass elements (nodes have lat/lon; ways carry a center). */
export function parseOverpassElements(elements = []) {
  const pois = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const type = el.tags?.amenity;
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;
    if (type !== 'fuel' && type !== 'parking') continue;
    pois.push({
      lat,
      lng,
      type,
      name: el.tags?.name || el.tags?.brand || (type === 'fuel' ? 'Petrol station' : 'Parking'),
      osmId: `${el.type}/${el.id}`
    });
  }
  return pois;
}

async function defaultFetch(query) {
  const resp = await axios.post(
    OVERPASS_BASE_URL,
    new URLSearchParams({ data: query }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: OVERPASS_TIMEOUT_MS }
  );
  return resp.data?.elements || [];
}

/**
 * All fuel/parking POIs inside `bbox`. One Overpass request at most per call
 * (covering only the cells not already cached). Throws if Overpass is
 * unreachable AND nothing was cached — the planner catches that and falls
 * back to unsnapped meeting points.
 *
 * @param {{south:number,west:number,north:number,east:number}} bbox
 * @param {{fetchFn?: (query:string)=>Promise<object[]>}} [opts] injectable for tests
 */
export async function findMeetingPois(bbox, { fetchFn = defaultFetch } = {}) {
  const cells = cellsForBbox(bbox);
  const now = Date.now();
  const missing = [];
  const pois = [];

  for (const cell of cells) {
    const mem = memoryCache.get(cell.key);
    if (mem && mem.expiresAt > now) { pois.push(...mem.pois); continue; }
    const stored = await cacheGet(cell.key);
    if (Array.isArray(stored)) {
      memoryCache.set(cell.key, { expiresAt: now + CACHE_TTL_SECONDS * 1000, pois: stored });
      pois.push(...stored);
      continue;
    }
    missing.push(cell);
  }

  if (missing.length > 0) {
    const elements = await fetchFn(buildOverpassQuery(cellBbox(missing)));
    const fetched = parseOverpassElements(elements);
    // Bucket the results into the cells they belong to and cache every
    // missing cell — including empty ones, so an area with no POIs isn't
    // re-queried on every plan.
    for (const cell of missing) {
      const inCell = fetched.filter((p) =>
        Math.floor(p.lat / CELL_DEG) === cell.latCell && Math.floor(p.lng / CELL_DEG) === cell.lngCell);
      memoryCache.set(cell.key, { expiresAt: now + CACHE_TTL_SECONDS * 1000, pois: inCell });
      await cacheSet(cell.key, inCell, CACHE_TTL_SECONDS);
      pois.push(...inCell);
    }
  }

  return pois.filter((p) => p.lat >= bbox.south && p.lat <= bbox.north && p.lng >= bbox.west && p.lng <= bbox.east);
}

/** Test hook: forget everything held in-process. */
export function clearPoiMemoryCache() {
  memoryCache.clear();
}
