# Athleat Integration & Weekly Menu System

## Overview
This implementation adds a complete meal management system integrated with the Athleat API, allowing customers to view their meal preferences and select meals from weekly menus through a TypeForm-like interface.

---

## Features

### 1. **Athleat API Integration**
- Fetch customer meal data directly from Athleat FileMaker database
- Support for customer and leads data
- Menu item retrieval with filtering by date and meal plan
- Session token management with automatic refresh

### 2. **Customer Meal Profiles**
- Store customer meal preferences (meals per day, plan type, breakfast/snack inclusion, exclusions)
- Sync with Athleat API data
- Support for allergies and dietary restrictions
- Edit and update preferences directly from the customer page

### 3. **Weekly Menu Management**
- Admin interface to create and publish weekly menus
- Share menus via secure token links
- Track menu views and customer selections
- Organize meals by date and meal type (breakfast, lunch, dinner, snack)

### 4. **Menu Selection Page**
- TypeForm-like single-question-per-screen interface
- Customer enters email to fetch their preferences
- Displays personalized meal plan information
- Progressive selection of meals for the week
- Confirmation screen after selection

---

## Architecture

### Backend

#### **Models**

**Customer Model** (`server/models/Customer.js`)
```
- email (unique)
- firstName, lastName, phone
- Meal preferences (mealPerDay, breakfastInclude, mealSnack, mealPlan, mealExclusion)
- selectedMeals (array of selected meal items)
- dietaryRestrictions, allergies
- currentWeekMenu (reference to WeeklyMenu)
- athleatId (for syncing with Athleat)
```

**MenuItem Model** (`server/models/MenuItem.js`)
```
- itemDate, mealType (breakfast, lunch, dinner, snack)
- mealName, description, ingredients
- Nutritional info (calories, protein, carbs, fat, fiber)
- Allergen info (allergens, isVegan, isGlutenFree)
- mealPlan, isAvailable
```

**WeeklyMenu Model** (`server/models/WeeklyMenu.js`)
```
- title, description
- startDate, endDate
- meals (organized by date and meal type)
- mealPlans (included plans: Standard, Customized, Premium, Vegan, Keto, Paleo)
- shareLink (token, expiresAt)
- isPublished, isActive
- viewCount, selectionCount
```

#### **Services**

**AthleatService** (`server/services/athleatService.js`)
- Handles authentication with Athleat API
- Manages session tokens with auto-refresh
- Methods:
  - `getSessionToken()` - Get/refresh auth token
  - `getCustomerByEmail(email)` - Fetch customer data
  - `getLeadByEmail(email)` - Fetch lead data
  - `getMenuItems(startDate, endDate, mealPlan)` - Fetch menu items
  - `parseCustomerRecord()`, `parseLeadRecord()`, `parseMenuRecord()` - Parse API responses

#### **API Routes** (`server/routes/menus.js`)

**Customer Meal Profile Endpoints**
```
GET /api/menus/customers/:email/meal-profile
  - Fetch customer's meal preferences
  - Syncs with Athleat if not in database
  
POST /api/menus/customers/:email/meal-profile
  - Update customer's meal preferences
```

**Weekly Menu Endpoints**
```
GET /api/menus
  - List all menus (admin only)
  
GET /api/menus/share/:token
  - Public access to published menu via share link
  
POST /api/menus
  - Create new menu (admin only)
  
PUT /api/menus/:id
  - Update menu (admin only)
  
GET /api/menus/:id/share-link
  - Get shareable link for menu
```

**Menu Item Endpoints**
```
GET /api/menus/items
  - Get menu items with filters (date, mealType, mealPlan)
  
POST /api/menus/items
  - Create new menu item (admin only)
```

**Meal Selection Endpoint**
```
POST /api/menus/customers/:email/select-meals
  - Save customer's meal selections for a weekly menu
```

### Frontend

#### **Components**

**MenuSelection** (`client/src/components/MenuSelection.jsx`)
- TypeForm-style meal selection interface
- 3 steps:
  1. Email entry to fetch customer profile
  2. Progressive meal selection (one meal per screen)
  3. Completion confirmation
- Displays customer meal info and meal nutritional details
- Progress bar showing selection status

**MealPreferences** (`client/src/components/MealPreferences.jsx`)
- Collapsible meal preferences display
- Shows customer meal plan, meals/day, breakfast/snack status
- Editable allergies and dietary restrictions
- Displayed in customer detail page
- Fetches data from Athleat or local database

#### **Pages**

**MenuManagement** (`client/src/pages/MenuManagement.js`)
- Admin page to manage weekly menus
- Create new menus with date range
- Publish/unpublish menus
- Copy share links
- View analytics (selections, views)
- Delete menus

**MenuSelectPage** (`client/src/pages/MenuSelectPage.js`)
- Public wrapper page for menu selection
- Routes to MenuSelection component with share token

**Customers (Updated)** (`client/src/pages/Customers.js`)
- Added MealPreferences component to customer detail view
- Shows meal data alongside delivery information

---

## Setup Instructions

### Environment Variables
Add these to `server/.env`:

```env
# Athleat API Configuration
ATHLEAT_BASE_URL=http://fmserver19.hulexo.online:3000
ATHLEAT_DATABASE=Athleat%20Dev
ATHLEAT_BASIC_AUTH=V2ViQVBJOldlYkFQSUF0aGxlYXQ=

# Frontend URL for share links
FRONTEND_URL=https://matterapp.online
```

### Database Setup
Models are automatically created on first use. Ensure MongoDB is connected before running the server.

### Routes Registration
The menu routes are registered in `server/server.js`:
```javascript
import menuRoutes from './routes/menus.js';
app.use('/api/menus', menuRoutes);
```

### Frontend Routes
Added in `client/src/App.js`:
```javascript
<Route path="/menus" element={<MenuManagement />} />
<Route path="/menu-select/:token" element={<MenuSelectPage />} />
```

---

## Usage Flow

### For Admins

1. **Create a Weekly Menu**
   - Go to `/menus` page
   - Click "Create Menu"
   - Enter title, description, start date, end date
   - System generates a shareable link

2. **Add Menu Items**
   - Use API or admin panel to add MenuItem documents
   - Organize by date and meal type
   - Include nutritional information

3. **Publish Menu**
   - Click "Publish" on the menu
   - Share the generated link with customers
   - Copy link button for quick sharing

### For Customers

1. **Receive Share Link**
   - Receive email/message with menu selection link
   - Click link to access `/menu-select/:token`

2. **Enter Email**
   - System fetches their meal preferences from Athleat
   - Shows meals/day, meal plan, exclusions
   - Creates local customer profile if needed

3. **Select Meals**
   - View one meal per screen (TypeForm style)
   - See nutritional info and descriptions
   - Select from available options
   - Navigate between meals

4. **Confirmation**
   - Selections saved to database
   - Confirmation message displayed
   - Admin can see selection count on menu

### For System

**Syncing Customer Data**
- When customer email is queried, system first checks local database
- If not found, fetches from Athleat API (Customer or Leads table)
- Creates local profile for future reference
- Can be updated manually on customer page

---

## API Examples

### Get Customer Meal Profile
```bash
curl -X GET http://localhost:5000/api/menus/customers/customer@email.com/meal-profile
```

### Create Weekly Menu
```bash
curl -X POST http://localhost:5000/api/menus \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Week of Feb 10-16",
    "description": "Healthy meal selection",
    "startDate": "2025-02-10",
    "endDate": "2025-02-16",
    "mealPlans": ["Standard", "Customized"]
  }'
```

### Get Public Menu via Share Link
```bash
curl -X GET http://localhost:5000/api/menus/share/abc123xyz789
```

### Customer Selects Meals
```bash
curl -X POST http://localhost:5000/api/menus/customers/customer@email.com/select-meals \
  -H "Content-Type: application/json" \
  -d '{
    "weeklyMenuId": "menu_id_here",
    "selections": [
      {
        "date": "2025-02-10",
        "mealType": "breakfast",
        "menuItemId": "item_id"
      }
    ]
  }'
```

---

## Database Structure

### Collections

**customers**
```
{
  email: "customer@example.com",
  firstName: "John",
  lastName: "Doe",
  mealPerDay: 2,
  breakfastInclude: true,
  mealSnack: false,
  mealPlan: "Customized",
  mealExclusion: "nuts",
  athleatId: "filemap_id",
  selectedMeals: [...],
  allergies: ["peanuts"],
  dietaryRestrictions: ["vegetarian"],
  currentWeekMenu: ObjectId,
  lastMenuSelectionDate: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**menuitems**
```
{
  athleatId: "fm_id",
  itemDate: Date,
  mealType: "lunch",
  mealName: "Grilled Chicken Salad",
  mealPlan: "Standard",
  description: "Fresh garden salad with grilled chicken",
  calories: 450,
  protein: 40,
  carbs: 20,
  fat: 15,
  allergens: [],
  isVegan: false,
  isGlutenFree: true,
  isAvailable: true,
  createdAt: Date,
  updatedAt: Date
}
```

**weeklymenus**
```
{
  title: "Week of Feb 10-16",
  description: "Customized meal plans",
  startDate: Date,
  endDate: Date,
  meals: [
    {
      date: Date,
      mealType: "breakfast",
      items: [ObjectId, ObjectId, ...]
    }
  ],
  mealPlans: ["Standard", "Customized"],
  shareLink: {
    token: "unique_token",
    createdAt: Date,
    expiresAt: Date,
    isActive: true
  },
  isPublished: true,
  viewCount: 15,
  selectionCount: 8,
  createdBy: ObjectId,
  createdAt: Date,
  updatedAt: Date
}
```

---

## Security Considerations

1. **Share Links**
   - Uses cryptographically secure tokens (32 bytes)
   - Tokens expire after 30 days
   - No authentication required for menu selection (public)

2. **API Protection**
   - Admin endpoints require authentication
   - Menu management restricted to admins
   - Customer data fetched only with email parameter

3. **Athleat Integration**
   - Session tokens cached with 15-minute expiry
   - Automatic token refresh on expiration
   - Basic auth kept in environment variables

4. **Data Privacy**
   - Customer meal preferences stored separately
   - Email-based lookups (no customer IDs exposed)
   - Optional data fields for sensitivity

---

## Future Enhancements

1. **Meal Photo Upload**
   - Admin can upload images for menu items
   - Display food photos in selection interface

2. **Dietary Filtering**
   - Auto-filter meals based on allergies and restrictions
   - Suggest compatible options

3. **Confirmation Emails**
   - Send summary to customer after selection
   - Include delivery address and dietary notes

4. **Analytics Dashboard**
   - Track popular meals
   - Monitor customer preferences
   - Generate demand forecasts

5. **Bulk Menu Import**
   - Import from Athleat API directly
   - Sync menu items automatically

6. **Substitution Requests**
   - Allow customers to swap meals after selection
   - Track substitutions

7. **Rating & Feedback**
   - Customers rate selected meals
   - Improve future menu planning

8. **Integration with Deliveries**
   - Link meal selections to delivery records
   - Include meal preferences in driver instructions
   - Track meals included in each delivery

---

## Troubleshooting

### Common Issues

**"Menu not found or link expired"**
- Verify menu is published
- Check share link token is correct
- Confirm link hasn't expired (30 days)

**"Customer profile not found"**
- Verify email is correct and exists in Athleat
- Check Athleat API credentials in .env
- Ensure network connection to Athleat server

**"Failed to save meal selections"**
- Verify customer email is in correct format
- Ensure menu exists and is published
- Check database connection

**API 401 Errors**
- Verify JWT token in Authorization header
- Check token hasn't expired
- Re-login to get new token

---

## Files Created/Modified

### New Files Created
- `server/services/athleatService.js` - Athleat API integration
- `server/models/Customer.js` - Customer meal data model
- `server/models/MenuItem.js` - Menu item model
- `server/models/WeeklyMenu.js` - Weekly menu model
- `server/routes/menus.js` - Menu API routes
- `client/src/components/MenuSelection.jsx` - Meal selection component
- `client/src/components/MealPreferences.jsx` - Meal preferences display
- `client/src/pages/MenuManagement.js` - Admin menu management page
- `client/src/pages/MenuSelectPage.js` - Public menu selection page

### Modified Files
- `server/server.js` - Added menu routes registration
- `server/.env` - Added Athleat configuration
- `client/src/App.js` - Added menu routes
- `client/src/pages/Customers.js` - Added MealPreferences component

---

## Support
For issues or questions, check the API logs and ensure all environment variables are correctly configured.
