import axios from 'axios';

// Self-hosted OSRM server (see server/optimizer/OSRM_SETUP.md for how to
// stand one up with Docker + a UAE/Dubai map extract) — no billing, no API
// key, no per-request cost. Falls back to OSRM's own public demo server,
// which exists for casual testing only: informally rate-limited, no uptime
// guarantee, explicitly NOT for production use. Set OSRM_BASE_URL once a
// real self-hosted instance is running.
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const OSRM_PROFILE = process.env.OSRM_PROFILE || 'driving';

// Used for any pair OSRM couldn't find a road route between (e.g. across
// water, or a genuinely disconnected part of the road graph) — a large
// penalty so the routing solver strongly avoids pairing them, instead of
// crashing on a missing matrix cell.
const UNREACHABLE_PENALTY = 999000;

/**
 * Build a full driving distance/duration matrix for a list of {lat, lng}
 * points (e.g. [depot, ...deliveryStops]) via OSRM's Table Service. Returns
 *   { distances: number[][] (meters), durations: number[][] (seconds) }
 * indexed identically to the input `points` array — distances[i][j] is the
 * driving distance from points[i] to points[j].
 *
 * Unlike Google's Distance Matrix API (capped at 25 origins/25 destinations/
 * 100 elements per request), OSRM's Table Service returns a full N×N matrix
 * in a single request, up to the server's configured --max-table-size (set
 * this generously, e.g. 1000, when starting your own OSRM instance).
 */
export async function buildDistanceMatrix(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return { distances: [], durations: [] };
  }
  if (points.length === 1) {
    return { distances: [[0]], durations: [[0]] };
  }

  // OSRM coordinates are "lng,lat" (the opposite order from the {lat, lng}
  // shape used everywhere else in this app) and semicolon-separated.
  const coordinates = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM_BASE_URL}/table/v1/${OSRM_PROFILE}/${coordinates}`;

  let resp;
  try {
    resp = await axios.get(url, {
      params: { annotations: 'duration,distance' },
      timeout: 20000
    });
  } catch (err) {
    const detail = err.response?.data?.message || err.message;
    throw new Error(`OSRM table request failed (is OSRM_BASE_URL="${OSRM_BASE_URL}" reachable?): ${detail}`);
  }

  if (resp.data?.code !== 'Ok') {
    const detail = resp.data?.message ? ` — ${resp.data.message}` : '';
    throw new Error(`OSRM table error: ${resp.data?.code}${detail}`);
  }

  const { durations, distances } = resp.data;
  if (!durations || !distances) {
    throw new Error('OSRM table response is missing durations/distances.');
  }

  const n = points.length;
  const cleanDurations = Array.from({ length: n }, (_, i) => (
    Array.from({ length: n }, (_, j) => durations[i][j] ?? UNREACHABLE_PENALTY)
  ));
  const cleanDistances = Array.from({ length: n }, (_, i) => (
    Array.from({ length: n }, (_, j) => distances[i][j] ?? UNREACHABLE_PENALTY)
  ));

  return { distances: cleanDistances, durations: cleanDurations };
}
