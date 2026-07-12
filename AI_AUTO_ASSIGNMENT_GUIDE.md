# AI Auto-Assignment Setup Guide

## Overview

The AI Auto-Assignment system intelligently assigns deliveries to the most suitable drivers based on multiple factors:

- **Distance**: Driver proximity to delivery location
- **Workload**: Current number of pending deliveries
- **Performance**: Historical on-time delivery rate
- **Area Knowledge**: Driver familiarity with delivery zones
- **Availability**: Driver capacity and status

## Features

### 1. **Single Delivery Auto-Assignment**
- Click "AI Auto-Assign" on any delivery detail page
- View suggested drivers with scores and reasoning
- Confirm or cancel the assignment
- Available for admins, dispatchers, and super_admins

### 2. **Batch Auto-Assignment**
- Navigate to "AI Auto-Assign" in the sidebar
- Filter deliveries by date, status, and area
- Select multiple deliveries to assign at once
- View success/failure statistics after assignment

### 3. **Assignment Methods**

#### **Rule-Based Scoring (Default)**
Uses a weighted scoring algorithm:
- Distance: Up to -40 points (closer is better)
- Workload: Up to -30 points (fewer deliveries is better)
- Performance: Up to +20 points (better on-time rate)
- Area Match: +10 points (driver knows the area)
- Company Match: +5 points (driver handles this company)

#### **OpenAI-Powered (Optional)**
Uses GPT-3.5-turbo for intelligent decision-making:
- Analyzes all factors holistically
- Provides natural language reasoning
- More adaptive to edge cases
- Requires OpenAI API key

## Configuration

### 1. **Environment Variables** (server/.env)

```bash
# Required for basic auto-assignment
LOCAL_TIMEZONE_OFFSET_MINUTES=240  # Dubai timezone offset

# Optional: Enable OpenAI for smarter assignments
OPENAI_API_KEY=your_openai_api_key_here
```

### 2. **Driver Profile Setup**

Ensure drivers have these fields in their profiles:
- **Location**: GPS coordinates (lat, lng) for distance calculation
- **Areas**: Array of familiar delivery zones
- **Preferred Companies**: Companies they typically handle
- **isActive**: Active status for availability

### 3. **Delivery Requirements**

For optimal assignment, deliveries should have:
- **gpsLocation**: Coordinates (lat, lng) for accurate distance
- **area**: Delivery zone/area
- **company**: Company name (optional)
- **scheduledTime**: Delivery time window

## API Endpoints

### Single Delivery Auto-Assignment
```http
POST /api/deliveries/:id/auto-assign
Authorization: Bearer <token>
Content-Type: application/json

{
  "useAI": false,
  "maxDistance": 50,
  "minScore": 30
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "delivery": { ... },
    "assignment": {
      "assignedDriver": {
        "id": "driver_id",
        "name": "John Doe",
        "email": "john@example.com"
      },
      "score": 85.5,
      "distance": 5.2,
      "reason": "Best match based on score: 85.5/100",
      "method": "rule-based",
      "alternativeDrivers": [...]
    }
  }
}
```

### Batch Auto-Assignment
```http
POST /api/deliveries/batch/auto-assign
Authorization: Bearer <token>
Content-Type: application/json

{
  "deliveryIds": ["id1", "id2", "id3"],
  "useAI": false,
  "maxDistance": 50,
  "minScore": 30
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "successCount": 2,
    "failedCount": 1,
    "results": {
      "success": [...],
      "failed": [...]
    }
  }
}
```

### Get Assignment Suggestions (Preview)
```http
POST /api/deliveries/:id/assignment-suggestions
Authorization: Bearer <token>
Content-Type: application/json

{
  "useAI": false,
  "maxDistance": 50,
  "minScore": 30
}
```

## Usage Examples

### Example 1: Basic Auto-Assignment
1. Open any delivery in pending status
2. Click "AI Auto-Assign" button
3. Review the suggested driver and score
4. Click "Confirm Assignment"

### Example 2: Batch Assignment for Morning Shift
1. Navigate to "AI Auto-Assign" in sidebar
2. Select today's date
3. Filter by "pending" status
4. Select all deliveries for morning (e.g., 8am-12pm)
5. Click "Auto-Assign X Deliveries"
6. Review results

### Example 3: OpenAI-Powered Assignment
1. Add `OPENAI_API_KEY` to server/.env
2. Restart server: `npm run dev`
3. In any assignment interface, check "Use OpenAI"
4. Perform assignment
5. View AI reasoning in the suggestion modal

## Scoring Algorithm Details

### Distance Calculation
Uses Haversine formula for accurate GPS distance:
```javascript
distance = calculateDistance(driverLat, driverLng, deliveryLat, deliveryLng)
distancePenalty = min(40, distance * 2) // 2 points per km, max 40
```

### Workload Calculation
Counts pending deliveries for the driver on the same day:
```javascript
workloadPenalty = min(30, pendingCount * 3) // 3 points per delivery, max 30
```

### Performance Calculation
Based on last 30 days of delivery history:
```javascript
onTimeRate = (onTimeDeliveries / totalDeliveries) * 100
performanceBonus = (onTimeRate / 100) * 20 // Max 20 points
```

### Final Score
```javascript
score = 100 
  - distancePenalty 
  - workloadPenalty 
  + performanceBonus 
  + (areaMatch ? 10 : 0)
  + (companyMatch ? 5 : 0)
```

## Customization Options

### Adjust Scoring Weights
Edit `server/services/aiAssignment.js`:
```javascript
// Increase distance importance
const distancePenalty = Math.min(50, driver.distance * 3);

// Reduce workload importance
const workloadPenalty = Math.min(20, driver.workload.pending * 2);

// Increase performance bonus
const performanceBonus = (driver.performance.onTimeRate / 100) * 30;
```

### Change Default Parameters
In API calls or UI:
```javascript
{
  maxDistance: 100,  // Increase max distance to 100km
  minScore: 40,      // Raise minimum score threshold
  useAI: true        // Enable OpenAI by default
}
```

### Add Custom Factors
Extend the scoring function:
```javascript
// Prioritize drivers with less total experience (training)
const experiencePenalty = driver.totalDeliveries > 100 ? 5 : 0;
score -= experiencePenalty;

// Bonus for drivers who recently delivered in this area
if (driver.recentAreaDeliveries > 5) score += 15;
```

## Troubleshooting

### Issue: "No available drivers found"
**Solution**: 
- Check that drivers exist in the system
- Verify drivers have `isActive` set to true
- Ensure `maxDistance` is not too restrictive

### Issue: "No eligible drivers found within criteria"
**Solution**:
- Lower the `minScore` threshold (e.g., from 30 to 20)
- Increase `maxDistance` (e.g., from 50km to 100km)
- Check driver locations are properly configured

### Issue: OpenAI not working
**Solution**:
- Verify `OPENAI_API_KEY` is set in .env
- Check OpenAI API quota/billing
- Review server logs for API errors
- System automatically falls back to rule-based scoring

### Issue: Inaccurate distance calculations
**Solution**:
- Ensure delivery has `gpsLocation.lat` and `gpsLocation.lng`
- Verify driver last delivery location exists
- Add home base location to driver profile as fallback

## Performance Considerations

### Response Time
- Rule-based: ~500ms for 10 drivers
- OpenAI: ~2-3 seconds per assignment
- Batch assignment: Processes sequentially to avoid API rate limits

### Optimization Tips
1. **Cache driver locations**: Update only when driver completes delivery
2. **Pre-filter drivers**: Exclude drivers with maxed workload before scoring
3. **Limit OpenAI requests**: Use for complex cases only
4. **Batch process**: Assign multiple deliveries in one operation

## Future Enhancements

- [ ] Machine learning model trained on historical assignments
- [ ] Real-time traffic data integration
- [ ] Driver skill/specialty matching (fragile items, heavy packages)
- [ ] Multi-objective optimization (balance fairness vs efficiency)
- [ ] Predictive delivery time estimation
- [ ] Automatic reassignment on driver unavailability
- [ ] Route optimization for multiple deliveries

## Support

For issues or questions:
1. Check server logs: `server/logs/`
2. Review delivery change records for assignment history
3. Test with `assignment-suggestions` endpoint first
4. Enable development mode for detailed error messages

## Best Practices

1. ✅ Always test suggestions before confirming
2. ✅ Monitor assignment success rates
3. ✅ Keep driver profiles updated
4. ✅ Use batch assignment for efficiency during peak times
5. ✅ Review alternative drivers for edge cases
6. ✅ Balance AI suggestions with manual override when needed
7. ✅ Track driver performance metrics regularly
