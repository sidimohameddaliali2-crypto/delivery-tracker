# Customer Bulk Upload Feature

## Overview
This document describes the new bulk customer upload feature that replaces the old "Upload CSV" and "New Customer" features on the Customers page.

## Changes Made

### 1. Frontend Changes (`client/src/pages/Customers.js`)

#### Removed Features:
- **"New Customer" button** - Removed modal and form for manually creating customers
- **"Example" button** - Removed example CSV download functionality
- **Form handlers** - Removed `handleCreateCustomer`, `handleInputChange` functions
- **Unused imports** - Removed `Plus` and `X` icons from lucide-react imports
- **Modal state** - Removed `showCreateModal`, `isCreatingCustomer`, `createError`, `newCustomer` state variables

#### Updated Features:
- **Button renamed**: "Upload CSV" → "Upload Customers"
- **File accept types**: Updated to accept `.csv`, `.xlsx`, `.xls`, and `.txt` files
- **API endpoint**: Changed from `/customers/upload-emails` to `/customers/upload-bulk`

#### Updated Functions:

**`parseExcelCustomers()`**
- Now expects 7 columns instead of 3
- Required columns: **Customer ID, Name, Meal Plan, Exclusions, No. of Meals, Breakfast, Email**
- Validates meal count (0-5)
- Parses breakfast as boolean (accepts: yes, true, 1, or false/no/0)
- Returns parsed customer objects with all fields

**`handleEmailsUpload()`**
- Updated error messages to reflect new format requirements
- Changed API endpoint to `/customers/upload-bulk`
- Updated response field names: `created` and `updated` (instead of `imported` and `updated`)

### 2. Backend Changes (`server/routes/customers.js`)

#### New Endpoint: `POST /api/customers/upload-bulk`

**Purpose**: Handles bulk upload of customers with comprehensive customer data

**Request Body**:
```json
{
  "customers": [
    {
      "customerId": "CUST001",
      "name": "John Doe",
      "mealPlan": "Standard",
      "exclusions": "Dairy, Nuts",
      "noOfMeals": 1,
      "breakfast": true,
      "email": "john@example.com"
    }
  ]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Successfully processed X customers",
  "created": 5,
  "updated": 3,
  "errors": ["Error messages if any"],
  "totalProcessed": 8
}
```

**Functionality**:
1. Validates all required fields (customerId, name, email)
2. Validates email format
3. For each customer:
   - **If exists**: Updates exclusions, meal count, breakfast preference, and meal plan
   - **If new**: Creates new customer with all provided information
4. Updates following customer fields:
   - `mealPlan` (default: 'Standard')
   - `mealExclusion` (exclusions)
   - `mealPerDay` (no. of meals)
   - `breakfastInclude` (breakfast preference)
   - `dataSource` (set to 'ImportedFromExcel')

## File Format Example

### Excel/CSV Format (7 columns required):

```
Customer ID,Name,Meal Plan,Exclusions,No. of Meals,Breakfast,Email
CUST001,John Doe,Standard,Dairy,1,yes,john@example.com
CUST002,Jane Smith,Premium,Nuts,2,no,jane@example.com
CUST003,Ahmed Al Mansouri,Vegan,Gluten,1,true,ahmed@gmail.com
CUST004,Sarah Johnson,Keto,None,2,false,sarah.j@business.com
```

### Column Details:
- **Customer ID**: Unique identifier (required)
- **Name**: Full name, supports first and last names (required)
- **Meal Plan**: One of: Standard, Customized, Premium, Vegan, Keto, Paleo (required)
- **Exclusions**: Comma-separated dietary restrictions (optional, can be "None")
- **No. of Meals**: Integer 0-5 (required)
- **Breakfast**: yes/no, true/false, 1/0 (required)
- **Email**: Valid email address (required)

## Behavior

### When Uploading:
1. **File is read** and parsed into comma-separated values
2. **Header row is automatically detected and skipped** if it contains "id", "name", or "email"
3. **Each row is validated** for required fields and email format
4. **For existing customers** (matched by email or customerId):
   - Updates: exclusions, meal count, breakfast, meal plan
   - Keeps: other information unless also updated in file
5. **For new customers**:
   - Creates new customer record with all provided information
6. **Results are displayed** showing number of customers created and updated

### Error Handling:
- Invalid email formats are skipped with error message
- Missing required fields are skipped with error message
- Invalid meal counts are skipped with error message
- Processing continues even if some rows fail
- All errors are returned in the response

## Benefits

1. **Efficient bulk updates**: Update multiple customers at once
2. **New customer creation**: Add new customers to the system in bulk
3. **Selective updates**: Only the fields in the upload are updated for existing customers
4. **Better validation**: Comprehensive error reporting with specific row information
5. **User-friendly**: Clear error messages show which rows failed and why

## Testing the Feature

### Example Test Steps:
1. Create a CSV file with the proper format
2. Go to the Customers page
3. Click "Upload Customers" button
4. Select your CSV/Excel file
5. Monitor the progress bar
6. Review the summary showing created/updated counts

### Sample Test File:
```csv
Customer ID,Name,Meal Plan,Exclusions,No. of Meals,Breakfast,Email
TEST001,Test User One,Standard,None,1,yes,test1@example.com
TEST002,Test User Two,Premium,Dairy,2,no,test2@example.com
```
