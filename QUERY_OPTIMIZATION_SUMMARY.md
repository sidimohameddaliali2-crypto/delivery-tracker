# FileMaker API Query Optimization Summary

## Problem Discovered
During field queryability testing across FileMaker layouts, a critical issue was identified:
- **Email fields are NOT searchable** via the `_find` endpoint in Order and Leads layouts, despite field values being present
- `customerEmail` in Order: Web Data returns 0 results when queried directly
- However, `contactEmail` in Customer: Web Data IS searchable

## Solution Implemented

### Query Architecture Changed
All Order queries by email now use a **two-step lookup**:
1. Query Customer: Web Data with `contactEmail` (works) → get `uuid`
2. Query Order: Web Data with `uuid_Customer` (works) → get order records

This resolves the email-field non-searchability issue by using intermediate UUID lookup.

## Code Changes

### 1. Updated `getOrderRawByEmail(email)` [Lines 405-451]
**Before:** Direct query of Order: Web Data with `customerEmail`
```javascript
// ❌ DOESN'T WORK - returns 0 results
query: [{ customerEmail: email }]
```

**After:** Two-step lookup via uuid
```javascript
// ✅ WORKS - queries Customer first, then Order
// Step 1: Get uuid from Customer: Web Data using contactEmail
// Step 2: Query Order: Web Data using uuid_Customer
```

**Result:** Now successfully retrieves Order records when given a customer email

### 2. Added `getOrderRawByUUID(uuidCustomer)` [NEW - Lines 454-487]
New method for direct UUID-based Order queries (no email needed)
- Useful when you already have the customer uuid
- Directly queries Order: Web Data with uuid_Customer

### 3. Updated `getOrderMealData(customerEmail)` [Lines 531-620]
Same two-step approach as getOrderRawByEmail
**Before:** Failed queries due to non-searchable customerEmail
**After:** Uses Customer layout lookup → Order layout query

## Field Queryability Matrix

| Layout | uuid/uuid_Customer | id | Email Field | Name Fields |
|--------|-------|----|----|------|
| **Customer: Web Data** | ✅ uuid | ✅ id | ✅ **contactEmail** | ✅ nameFull, nameFirst |
| **Order: Web Data** | ✅ uuid_Customer | ✅ id | ❌ **customerEmail** | ✅ customerFullName, customerFirstName |
| **Leads: Web Data** | ❌ uuid_Customer | ❌ id | ❌ contactEmail | Needs testing |

## Testing Results

### Customer: Web Data Field Queryability ✅
- ✅ uuid - SEARCHABLE
- ✅ id - SEARCHABLE  
- ✅ contactEmail - SEARCHABLE
- ✅ nameFull - SEARCHABLE
- ✅ nameFirst - SEARCHABLE

### Order: Web Data Field Queryability
- ✅ uuid_Customer - SEARCHABLE
- ✅ id - SEARCHABLE
- ✅ customerFirstName - SEARCHABLE
- ✅ customerFullName - SEARCHABLE
- ❌ customerEmail - NOT SEARCHABLE (field exists but not indexed)

### Test Case: braydenainzuain@gmail.com
- Customer UUID: 17C69728-F86D-C74E-BBC5-7EA2EDF4F2D2
- Order Records Found: 1
- Meal Plan: Fat Loss
- Meals Per Day: 2
- Breakfast Included: No
- Status: ✅ WORKING

## Key Insights

1. **Field Existence ≠ Field Searchability**
   - Email fields are stored in Order layout but not indexed for search queries
   - Same field name (email) is searchable in Customer layout

2. **FileMaker _find Endpoint Limitations**
   - Only searches indexed fields
   - Requires at least one search criterion
   - Does not error on non-indexed fields; returns 0 results silently

3. **UUID-Based Queries Are Reliable**
   - uuid_Customer field is reliably indexed in Order layout
   - Using uuid as intermediate lookup provides consistent results

## Deployment Notes

- All changes are backward compatible (same method signatures)
- Methods now work correctly for all email-based lookups
- Log messages updated to show intermediate uuid lookup steps
- No database changes required
- Session token caching behavior unchanged

## Files Modified

- `server/services/athleatService.js`
  - Lines 405-451: Updated `getOrderRawByEmail()`
  - Lines 454-487: Added `getOrderRawByUUID()` [NEW]
  - Lines 531-620: Updated `getOrderMealData()`
  - Lines 993-1051: Added `testCustomerFieldQueryability()` [NEW]

## Files Created (Testing/Documentation)

- `testCustomerQueries.js` - Initial Customer field test
- `testCustomerQueryFields.js` - Service-integrated Customer test
- `runCustomerFieldTest.js` - Customer queryability verification
- `testUpdatedOrderQuery.js` - Updated method verification
- `comprehensiveQueryTest.js` - Full integration test

## Next Steps (Optional)

1. Test Leads: Web Data field queryability to complete the matrix
2. Update any API endpoints using getOrderRawByEmail to log the uuid lookup
3. Consider adding getOrderMealDataByUUID method for uuid-direct queries
4. Update frontend code if it depends on specific query patterns

