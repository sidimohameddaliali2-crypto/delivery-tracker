import axios from 'axios';

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function geocodeWithGoogle(address) {
  if (!GOOGLE_MAPS_API_KEY) return null;
  try {
    const resp = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
      params: {
        address,
        key: GOOGLE_MAPS_API_KEY,
        region: 'AE'
      },
      timeout: 7000
    });

    if (resp.data?.status === 'OK' && resp.data.results?.length) {
      const loc = resp.data.results[0].geometry?.location;
      if (loc?.lat !== undefined && loc?.lng !== undefined) {
        return { lat: loc.lat, lng: loc.lng, provider: 'google' };
      }
    } else {
      console.warn('Google geocode status:', resp.data?.status, 'for', address);
    }
  } catch (err) {
    console.warn('Google geocode error for address:', address, err.message);
  }
  return null;
}

/**
 * Extract coordinates from Google Maps URL
 * Supports formats like:
 * https://www.google.com/maps/place/Villa+433...@25.1234,55.5678,15z
 * https://maps.google.com/?q=loc:25.1234,55.5678
 */
export function extractCoordsFromGoogleMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;

  try {
    // Pattern 1: @lat,lng format
    const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (atMatch) {
      return {
        lat: parseFloat(atMatch[1]),
        lng: parseFloat(atMatch[2])
      };
    }

    // Pattern 2: loc:lat,lng format
    const locMatch = url.match(/loc:(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (locMatch) {
      return {
        lat: parseFloat(locMatch[1]),
        lng: parseFloat(locMatch[2])
      };
    }

    return null;
  } catch (err) {
    console.error('Error extracting coords from Google Maps URL:', err);
    return null;
  }
}

/**
 * Geocode an address to get lat/lng using Nominatim (free, OpenStreetMap)
 * Rate limited to 1 request/second
 */
export async function geocodeAddress(address) {
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    return null;
  }

  // Try Google first if key configured
  const googleResult = await geocodeWithGoogle(address);
  if (googleResult) return googleResult;

  // Fallback to Nominatim (OSM)
  try {
    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        q: address,
        format: 'json',
        limit: 1
      },
      headers: {
        'User-Agent': 'MatterDeliveryTracker/1.0'
      },
      timeout: 5000
    });

    if (response.data && response.data.length > 0) {
      const result = response.data[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name,
        provider: 'osm'
      };
    }

    return null;
  } catch (error) {
    console.error('Geocoding error for address:', address, error.message);
    return null;
  }
}

/**
 * Try to extract or geocode coordinates from various sources
 * Priority: Google Maps URL > existing coords > geocode address
 */
export async function resolveDeliveryCoordinates(delivery) {
  // If already has coordinates in gpsLocation, return them
  if (delivery.gpsLocation && typeof delivery.gpsLocation === 'object') {
    if (typeof delivery.gpsLocation.lat === 'number' && typeof delivery.gpsLocation.lng === 'number') {
      return {
        lat: delivery.gpsLocation.lat,
        lng: delivery.gpsLocation.lng
      };
    }
  }
  // If already has coordinates as top-level fields
  if (delivery.location && typeof delivery.location === 'object') {
    if (typeof delivery.location.lat === 'number' && typeof delivery.location.lng === 'number') {
      return {
        lat: delivery.location.lat,
        lng: delivery.location.lng
      };
    }
  }
  if (typeof delivery.lat === 'number' && typeof delivery.lng === 'number') {
    return {
      lat: delivery.lat,
      lng: delivery.lng
    };
  }

  // Try to extract from Google Maps URL if present
  if (delivery.mapsUrl && typeof delivery.mapsUrl === 'string') {
    const extracted = extractCoordsFromGoogleMapsUrl(delivery.mapsUrl);
    if (extracted) {
      console.log(`✅ Extracted coords from Google Maps URL for ${delivery.customerName}:`, extracted);
      return extracted;
    }
  }

  // Fallback: geocode the address
  if (delivery.address) {
    console.log(`🌍 Geocoding address for ${delivery.customerName}:`, delivery.address);
    const geocoded = await geocodeAddress(delivery.address);
    if (geocoded) {
      console.log(`✅ Geocoded address:`, geocoded);
      return {
        lat: geocoded.lat,
        lng: geocoded.lng
      };
    } else {
      console.warn(`⚠️ Could not geocode address: ${delivery.address}`);
    }
  }

  return null;
}
