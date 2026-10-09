import axios from 'axios';

// Google Directions API — used for the mobile Route Navigator screen's
// road-following polyline + turn-by-turn steps. Kept server-side (unlike the
// Android Maps SDK key, which has to ship in the mobile app) so this key is
// never exposed in the client bundle. Falls back to GOOGLE_MAPS_API_KEY
// (already used for geocoding — see GOOGLE_GEOCODING_API_KEY's same fallback
// in services/geocoding.js) if a dedicated key isn't set; that existing key
// needs the Directions API enabled in Google Cloud Console to work here.
const GOOGLE_DIRECTIONS_API_KEY = process.env.GOOGLE_DIRECTIONS_API_KEY || process.env.GOOGLE_MAPS_API_KEY;
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

// Strips Google's `html_instructions` (e.g. "Turn <b>left</b> onto <b>Palm
// Grove St</b>") down to plain text for display in the app's instruction
// banner.
function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

// Decodes a Google-encoded polyline string into [{latitude,longitude}, ...].
// Standard Google polyline algorithm (https://developers.google.com/maps/documentation/utilities/polylinealgorithm).
function decodePolyline(encoded) {
  const points = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let result = 1, shift = 0, b;
    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 1; shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({ latitude: lat * 1e-5, longitude: lng * 1e-5 });
  }

  return points;
}

/**
 * Fetch a driving route through an ORDERED sequence of {lat, lng} points
 * (e.g. [driverPosition, ...remainingStops]) from Google Directions. The
 * order is fixed by the caller (the dispatch-assigned stop sequence) —
 * `optimize:false` so Google never reorders waypoints, this is a directions
 * lookup, not a re-optimization.
 *
 * Returns:
 *   {
 *     polyline: [{latitude,longitude}, ...],   // full route geometry
 *     legs: [{ distanceMeters, durationSeconds, steps: [{ text, distanceMeters, startLocation }] }]
 *   }
 * legs are indexed the same as buildOrderedRouteLegs in distanceMatrixService.js —
 * one leg per consecutive pair of input points.
 */
export async function getDirections(points) {
  if (!GOOGLE_DIRECTIONS_API_KEY) {
    throw new Error('GOOGLE_DIRECTIONS_API_KEY is not configured');
  }
  if (!Array.isArray(points) || points.length < 2) {
    return { polyline: [], legs: [] };
  }

  const [origin, ...rest] = points;
  const destination = rest[rest.length - 1];
  const waypoints = rest.slice(0, -1);

  const params = {
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
    mode: 'driving',
    key: GOOGLE_DIRECTIONS_API_KEY
  };
  if (waypoints.length > 0) {
    params.waypoints = waypoints.map((p) => `${p.lat},${p.lng}`).join('|');
  }

  let resp;
  try {
    resp = await axios.get(DIRECTIONS_URL, { params, timeout: 20000 });
  } catch (err) {
    const detail = err.response?.data?.error_message || err.message;
    throw new Error(`Google Directions request failed: ${detail}`);
  }

  if (resp.data?.status !== 'OK' || !resp.data.routes?.[0]) {
    const detail = resp.data?.error_message ? ` — ${resp.data.error_message}` : '';
    throw new Error(`Google Directions error: ${resp.data?.status}${detail}`);
  }

  const route = resp.data.routes[0];
  const polyline = decodePolyline(route.overview_polyline.points);

  const legs = (route.legs || []).map((leg) => ({
    distanceMeters: leg.distance?.value ?? 0,
    durationSeconds: leg.duration?.value ?? 0,
    steps: (leg.steps || []).map((step) => ({
      text: stripHtml(step.html_instructions),
      distanceMeters: step.distance?.value ?? 0,
      startLocation: { latitude: step.start_location.lat, longitude: step.start_location.lng }
    }))
  }));

  return { polyline, legs };
}
