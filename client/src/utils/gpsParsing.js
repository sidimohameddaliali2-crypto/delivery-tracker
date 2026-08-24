// Extracts { lat, lng } from a Google/Apple Maps link, a raw "lat,lng" string, or any
// text containing coordinates. Returns null if nothing parseable is found.
export function parseGPSFromLink(link) {
  if (!link || typeof link !== 'string') return null;

  const str = link.trim();

  const extractFromText = (text) => {
    const m = text.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/);
    if (m) {
      const lat = parseFloat(m[1]);
      const lng = parseFloat(m[2]);
      if (!Number.isNaN(lat) && !Number.isNaN(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
        return { lat, lng };
      }
    }
    return null;
  };

  const direct = extractFromText(str);
  if (direct) return direct;

  let normalized = str;
  if (!/^https?:\/\//i.test(normalized) && /(google\.|goo\.gl|maps\.app\.goo\.gl|maps\.apple\.com)/i.test(normalized)) {
    normalized = `https://${normalized}`;
  }

  try {
    const url = new URL(normalized);
    const host = url.hostname;

    if (/google\.com|goo\.gl|maps\.app\.goo\.gl/i.test(host)) {
      const qParam = url.searchParams.get('q');
      if (qParam) {
        const parsed = extractFromText(qParam);
        if (parsed) return parsed;
      }

      const queryParam = url.searchParams.get('query');
      if (queryParam) {
        const parsed = extractFromText(queryParam);
        if (parsed) return parsed;
      }

      const llParam = url.searchParams.get('ll');
      if (llParam) {
        const parsed = extractFromText(llParam);
        if (parsed) return parsed;
      }

      const pathMatch = url.pathname.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (pathMatch) {
        const lat = parseFloat(pathMatch[1]);
        const lng = parseFloat(pathMatch[2]);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) return { lat, lng };
      }

      const fromWhole = extractFromText(normalized);
      if (fromWhole) return fromWhole;
    }

    if (/maps\.apple\.com/i.test(host)) {
      const llParam = url.searchParams.get('ll');
      if (llParam) {
        const parsed = extractFromText(llParam);
        if (parsed) return parsed;
      }
      const fromWhole = extractFromText(normalized);
      if (fromWhole) return fromWhole;
    }

    return extractFromText(normalized);
  } catch {
    return extractFromText(str);
  }
}
