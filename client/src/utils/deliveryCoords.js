// Delivery locations arrive in several shapes depending on how they were
// captured (gpsLocation object, bare lat/lng, GeoJSON [lng, lat] arrays, …).
// Normalise all of them to a single { lat, lng } or null.
const toNum = (val) => {
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'string' && val.trim() !== '') {
    const parsed = parseFloat(val);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

// Great-circle distance in km — same formula as the server's geocoding.js.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
const MAX_PLAUSIBLE_DISTANCE_KM = 300; // matches the server's plausibility check

// Some stored addresses were geocoded (usually by the old OSM/Nominatim
// fallback, before it was disabled) and mismatched to another country
// entirely — e.g. "Meadows 5, Street 5" landed in Islamabad. That's still a
// syntactically valid coordinate, so a bare world-bounds check doesn't catch
// it. Without a depot to compare against, callers can only apply the loose
// check; pass `depot` (from GET /deliveries/depot) wherever it's available so
// obviously-wrong stored pins are treated as "no usable location" instead of
// being trusted and plotted on the other side of the world.
const pair = (lat, lng, depot) => {
  const a = toNum(lat);
  const b = toNum(lng);
  if (a === null || b === null) return null;
  if (Math.abs(a) > 90 || Math.abs(b) > 180) return null;
  if (a === 0 && b === 0) return null;
  if (depot && haversineKm(a, b, depot.lat, depot.lng) > MAX_PLAUSIBLE_DISTANCE_KM) return null;
  return { lat: a, lng: b };
};

export function getDeliveryLatLng(delivery, depot) {
  if (!delivery) return null;

  const gps = delivery.gpsLocation;
  if (gps && !Array.isArray(gps) && gps.lat !== undefined && gps.lng !== undefined) {
    const p = pair(gps.lat, gps.lng, depot);
    if (p) return p;
  }
  if (Array.isArray(gps) && gps.length === 2) {
    const p = pair(gps[0], gps[1], depot);
    if (p) return p;
  }
  if (delivery.lat !== undefined && delivery.lng !== undefined) {
    const p = pair(delivery.lat, delivery.lng, depot);
    if (p) return p;
  }
  // GeoJSON-style arrays are [lng, lat].
  const geo = delivery.location?.coordinates;
  if (Array.isArray(geo) && geo.length >= 2) {
    const p = pair(geo[1], geo[0], depot);
    if (p) return p;
  }
  if (Array.isArray(delivery.coordinates) && delivery.coordinates.length >= 2) {
    const p = pair(delivery.coordinates[1], delivery.coordinates[0], depot);
    if (p) return p;
  }
  if (delivery.coordinates && !Array.isArray(delivery.coordinates)) {
    const p = pair(delivery.coordinates.lat, delivery.coordinates.lng, depot);
    if (p) return p;
  }
  if (delivery.latitude !== undefined && delivery.longitude !== undefined) {
    const p = pair(delivery.latitude, delivery.longitude, depot);
    if (p) return p;
  }
  return null;
}
