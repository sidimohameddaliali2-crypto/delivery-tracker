# Area Auto-Detection Configuration

## Overview
The system automatically detects and assigns delivery areas/zones based on address keywords. When a delivery is created or updated (manually or via bulk upload), the system searches the address for predefined area keywords and automatically sets the zone field.

## How It Works

1. **Delivery Creation**: When a delivery is created (manual or bulk), the system:
   - Checks the address field for area keywords
   - Matches against the predefined AREA_MAPPINGS list
   - Automatically sets the zone field to the matched area
   - If no match is found, keeps the existing zone value

2. **Delivery Updates**: When a delivery address is updated, the area is re-detected automatically

3. **Delivery Changes**: When delivery changes include address modifications, the area is auto-detected and updated

## Customizing the Area List

Edit the file: `server/config/areas.js`

### Adding New Areas

```javascript
{ keywords: ['keyword1', 'keyword2', 'keyword3'], area: 'Display Name' }
```

**Example:**
```javascript
{ keywords: ['downtown', 'dtd', 'downtown dubai'], area: 'Downtown Dubai' }
```

### Area Entry Structure

- **keywords**: Array of search terms (case-insensitive)
  - Can include abbreviations
  - Can include alternative spellings
  - Can include common variations

- **area**: The standardized area name that will be set as the zone

### Tips for Best Results

1. **Use Multiple Keywords**: Include all possible variations
   ```javascript
   { keywords: ['jlt', 'jumeirah lake towers', 'jumeirah lakes towers'], area: 'JLT' }
   ```

2. **Order Matters**: Place more specific keywords before general ones
   ```javascript
   // Good - specific first
   { keywords: ['dubai marina'], area: 'Dubai Marina' },
   { keywords: ['marina'], area: 'Marina Area' },
   ```

3. **Include Common Misspellings**:
   ```javascript
   { keywords: ['mirdif', 'mirdiff'], area: 'Mirdif' }
   ```

4. **Use Lowercase**: All keywords should be lowercase for matching

## Testing

To test the area detection:

1. Create a delivery with an address containing an area keyword
2. Check the server console for auto-detection logs:
   ```
   📍 Area detected: "Jumeirah" from keyword "jbr" in address: "Building 123, JBR, Dubai"
   🗺️ Area auto-detection: "Jumeirah" for address: "Building 123, JBR, Dubai"
   ```

3. Verify the zone field is set correctly in the delivery record

## Current Areas Configured

The system currently includes areas for:
- Dubai (35+ areas including Marina, JLT, JVC, Downtown, etc.)
- Abu Dhabi (6 areas)
- Sharjah (3 areas)
- Ajman (1 area)

## Fallback Behavior

If no area keyword is found in the address:
- The system keeps the existing zone value
- A log message is generated:
  ```
  📍 No area match found in address: "...", keeping current zone: "..."
  ```
- This allows manual zone assignment to be preserved when auto-detection doesn't find a match
