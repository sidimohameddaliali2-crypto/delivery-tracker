// Simple test with just a few entries
const AREA_MAPPINGS = [
  {
    keywords: ['dubai marina', 'marina'],
    area: 'Dubai Marina'
  },
  {
    keywords: ['downtown', 'burj khalifa'],
    area: 'Downtown'
  },
  {
    keywords: ['jumeirah', 'jumeira'],
    area: 'Jumeirah'
  }
];

function detectAreaFromAddress(address, currentZone = '') {
  try {
    if (!address || typeof address !== 'string') {
      return currentZone || '';
    }

    const normalizedAddress = address.toLowerCase().trim();

    // Search through area mappings
    for (const mapping of AREA_MAPPINGS) {
      if (!mapping || !mapping.keywords || !Array.isArray(mapping.keywords)) {
        console.warn('Invalid area mapping found:', mapping);
        continue;
      }
      
      for (const keyword of mapping.keywords) {
        if (keyword && typeof keyword === 'string' && normalizedAddress.includes(keyword.toLowerCase())) {
          console.log(`📍 Area detected: "${mapping.area}" from keyword "${keyword}" in address: "${address}"`);
          return mapping.area;
        }
      }
    }

    // No match found, return current zone
    console.log(`📍 No area match found in address: "${address}", keeping current zone: "${currentZone}"`);
    return currentZone || '';
  } catch (error) {
    console.error('Error in detectAreaFromAddress:', error);
    return currentZone || '';
  }
}

// Export at the end to ensure array is fully parsed
export { AREA_MAPPINGS, detectAreaFromAddress };
