# System Architecture & Data Flow Diagrams

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MATTER DELIVERY SYSTEM                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────┐         ┌───────────────────────────────┐ │
│  │   ADMIN INTERFACE    │         │   CUSTOMER INTERFACE          │ │
│  │  (/menus)            │         │  (/menu-select/:token)        │ │
│  │                      │         │                               │ │
│  │ • Create menu        │         │ • Enter email                 │ │
│  │ • Add menu items     │         │ • View preferences           │ │
│  │ • Publish & share    │         │ • Select meals               │ │
│  │ • View analytics     │         │ • Confirm selection          │ │
│  └──────────┬───────────┘         └──────────────┬────────────────┘ │
│             │                                    │                   │
│             └────────────────┬───────────────────┘                   │
│                              │                                       │
│                    ┌─────────▼────────┐                              │
│                    │  BACKEND API     │                              │
│                    │ /api/menus/*     │                              │
│                    └────────┬─────────┘                              │
│                             │                                        │
│         ┌───────────────────┼───────────────────┐                   │
│         │                   │                   │                   │
│         ▼                   ▼                   ▼                    │
│  ┌────────────┐      ┌────────────┐      ┌──────────────┐          │
│  │ Athleat    │      │ MongoDB    │      │  Services    │          │
│  │ FileMaker  │      │            │      │              │          │
│  │            │      │ • Customers│      │ • Athleat    │          │
│  │ • Customer │      │ • MenuItems│      │   Service    │          │
│  │ • Leads    │      │ • WeeklyMenu       │ • Auth       │          │
│  │ • Menu     │      └────────────┘      │ • Email      │          │
│  │   Items    │                         └──────────────┘          │
│  └────────────┘                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Customer Meal Selection Flow

```
START: Customer Clicks Share Link
   │
   ▼
┌──────────────────────────────────────┐
│  STEP 1: Email Entry                 │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Input: Email address                │
│  Action: Fetch customer profile      │
│                                      │
│  System checks:                      │
│  1. Local database first             │
│  2. If not found, query Athleat      │
│  3. Create local profile if needed   │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  STEP 2: Show Preferences            │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Display:                            │
│  • Name: John Doe                    │
│  • Meals/Day: 2                      │
│  • Plan: Customized                  │
│  • Breakfast: ✓ Included             │
│  • Snacks: ✗ Not Included            │
│  • Exclusions: Nuts                  │
│                                      │
│  Action: Continue →                  │
└──────────┬───────────────────────────┘
           │
           ▼
┌──────────────────────────────────────┐
│  STEP 3: Select Meals (Loop)         │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  For each meal in weekly menu:       │
│                                      │
│  Show:                               │
│  • Date: Monday, Feb 10              │
│  • Meal Type: Breakfast              │
│  • Options: [List of meals]          │
│  • Info: Calories, protein, etc.     │
│                                      │
│  Action: Click meal to select        │
│  Progress: ██░░░░░░░░ 20% (1/5)     │
│                                      │
│  Next → Previous                     │
└──────────┬───────────────────────────┘
           │
           ├─ More meals? ──→ Loop back ──→ Select next meal
           │
           └─ All meals done?
                │
                ▼
┌──────────────────────────────────────┐
│  STEP 4: Confirmation                │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│  Display:                            │
│  ✓ All Set!                          │
│  ✓ 7 meals selected for the week     │
│                                      │
│  Action: Save to database            │
│  • Create customer if new            │
│  • Store meal selections             │
│  • Update menu selection count       │
│  • Send confirmation email           │
│                                      │
│  Show: "Select Meals Again" button   │
└──────────┬───────────────────────────┘
           │
           ▼
         END

Database Updates:
• Customers collection: Add/update customer record
• WeeklyMenus collection: Increment selectionCount
• Selections stored: date + mealType + menuItemId
```

---

## 3. Data Model Relationships

```
┌─────────────────────────────────────┐
│         WEEKLY MENU                 │
│  (One menu per week)                │
│                                     │
│ • Title: "Week of Feb 10-16"       │
│ • StartDate: 2025-02-10            │
│ • EndDate: 2025-02-16              │
│ • ShareLink: token123              │
│ • IsPublished: true                │
│ • ViewCount: 45                    │
│ • SelectionCount: 12               │
└────────────────┬────────────────────┘
                 │
                 │ contains many
                 │
        ┌────────▼────────────┐
        │                     │
        ▼                     ▼
   ┌─────────┐          ┌─────────┐
   │ Meal    │          │ Meal    │
   │ Type:   │          │ Type:   │
   │Breakfast│          │ Lunch   │
   │ Date:   │          │ Date:   │
   │Feb 10   │          │ Feb 10  │
   │         │          │         │
   │ Items[] │          │ Items[] │
   └────┬────┘          └────┬────┘
        │                    │
        │ references         │ references
        ▼                    ▼
   ┌─────────────────────────────────┐
   │      MENU ITEMS                 │
   │  (Individual meal options)      │
   │                                 │
   │ • MealName: "Oatmeal"          │
   │ • Description: "..."            │
   │ • Calories: 300                │
   │ • Protein: 10g                 │
   │ • Allergens: ["gluten"]        │
   │ • IsAvailable: true            │
   └────────────┬────────────────────┘
                │
                │ selected by
                │ (many-to-many)
                ▼
   ┌──────────────────────────────────┐
   │      CUSTOMER                    │
   │  (Customer preferences)          │
   │                                  │
   │ • Email: john@example.com       │
   │ • Name: John Doe                │
   │ • MealPerDay: 2                 │
   │ • BreakfastInclude: true        │
   │ • MealPlan: "Customized"        │
   │ • Allergies: ["peanuts"]        │
   │                                  │
   │ • SelectedMeals[]:              │
   │   [                             │
   │     {                           │
   │       date: 2025-02-10,        │
   │       mealType: "breakfast",   │
   │       menuItemId: ref,         │
   │     },                          │
   │     ...                         │
   │   ]                             │
   │                                  │
   │ • CurrentWeekMenu: ref          │
   │ • LastMenuSelectionDate: date   │
   └──────────────────────────────────┘
```

---

## 4. API Request/Response Flow

```
CLIENT                           SERVER                      ATHLEAT/DB
(Frontend)                       (Node.js)                   (FileMaker/MongoDB)

User enters email
────────────────────→ GET /menus/customers/:email/meal-profile
                    │
                    ├─→ Check local MongoDB
                    │   Found? ──→ Return customer data
                    │   Not found? ──↓
                    │
                    ├─→ Query Athleat API
                    │   ────────────────────────→ GET /databases/Athleat/layouts/Customer
                    │                           ←──────────────── JSON response
                    │   Parse & create local record
                    │   ────────────────────────→ MongoDB: Insert customer
                    │
                    ←──────────── Return {email, mealPerDay, mealPlan, ...}

←──────────────────────


Display menu & selections
────────────────────→ POST /menus/customers/:email/select-meals
                    │
                    ├─→ Find/create customer
                    ├─→ Update selectedMeals array
                    ├─→ Save to MongoDB
                    │   ────────────────────────→ db.customers.updateOne()
                    │                           ←──────────────── Success
                    │
                    ├─→ Increment menu selectionCount
                    │   ────────────────────────→ db.weeklymenus.updateOne()
                    │                           ←──────────────── Success
                    │
                    ←──────────── Return {success: true, ...}

Show confirmation
←──────────────────────
```

---

## 5. Authentication & Authorization

```
┌────────────────────────────────┐
│  USER LOGIN                    │
│  POST /api/auth/login          │
└────────────┬───────────────────┘
             │
             ▼
      ┌──────────────┐
      │ JWT Token    │
      │ Created      │
      └──────┬───────┘
             │
      ┌──────▼────────────────────────────────┐
      │   Token stored in localStorage        │
      │   Sent with Authorization header      │
      └──────────────────────────────────────┘
             │
      ┌──────▼─────────────────────────────────────────────┐
      │ PROTECTED ROUTES (Admin Only)                      │
      │ ✓ POST /api/menus (Create menu)                   │
      │ ✓ PUT /api/menus/:id (Edit menu)                  │
      │ ✓ GET /api/menus (List menus)                     │
      │                                                    │
      │ PUBLIC ROUTES (No Auth)                            │
      │ ✓ GET /api/menus/share/:token (View menu)         │
      │ ✓ GET /api/menus/customers/:email/profile         │
      │ ✓ POST /api/menus/customers/:email/select-meals   │
      └────────────────────────────────────────────────────┘
```

---

## 6. Weekly Menu Workflow Timeline

```
WEEK 1 (Admin Prep)
├─ Monday: Create WeeklyMenu record
│  └─ Set title, dates, mealPlans
│
├─ Tuesday-Thursday: Add MenuItem records
│  └─ Organize by date + meal type
│
├─ Friday: Review & Publish
│  └─ Update isPublished = true
│  └─ Generate shareLink token
│  └─ Set token expiry (30 days)
│
└─ Friday EOD: Share with customers
   └─ Send links via email/SMS

WEEK 2-3 (Customer Selection)
├─ Saturday-Sunday: Customers click link
│  ├─ View menu options
│  ├─ Select meals
│  └─ Selections saved
│
├─ ViewCount increases
└─ SelectionCount increases

WEEK 4 (Analytics)
├─ Admin reviews menu
│  ├─ 47 views
│  ├─ 12 selections
│  ├─ 8 customers selected
│  └─ Most popular: Grilled Chicken
│
└─ Data informs next week's menu

```

---

## 7. Component Hierarchy

```
App.js
│
├─→ /menus Route
│  └─→ MenuManagement.js
│     ├─→ Menu List
│     ├─→ Create Form
│     ├─→ Publish Button
│     ├─→ Share Link Copy
│     └─→ Analytics Display
│
├─→ /menu-select/:token Route
│  └─→ MenuSelectPage.js
│     └─→ MenuSelection.jsx
│        ├─→ EmailForm (Step 1)
│        ├─→ PreferencesDisplay (Step 1)
│        ├─→ MealSelector (Step 2-3)
│        │  ├─→ MealCard
│        │  ├─→ NutritionInfo
│        │  └─→ SelectionButton
│        └─→ Confirmation (Step 4)
│
└─→ /customers Route
   └─→ Customers.js
      └─→ CustomerDetail.js
         ├─→ DeliveryStats
         ├─→ ContactInfo
         └─→ MealPreferences.jsx
            ├─→ MealOverviewSection
            └─→ DietaryDetailsSection
```

---

## 8. Error Handling Flow

```
┌──────────────────────────────┐
│  REQUEST RECEIVED            │
└────────┬─────────────────────┘
         │
         ▼
    ┌────────────┐
    │ Validate   │
    │ Input      │
    └────┬───┬──┘
         │   │
    Valid│   │Invalid
         │   │
         ▼   ▼
      SUCCESS ERROR: 400
      │     Bad Request
      │
      ▼
    ┌──────────────┐
    │ Check Auth   │
    └────┬───┬─────┘
         │   │
    Auth │   │No Auth
         │   │
         ▼   ▼
      SUCCESS ERROR: 401
      │     Unauthorized
      │
      ▼
    ┌──────────────┐
    │ Database     │
    │ Operation    │
    └────┬───┬─────┘
         │   │
    Success   │Error
         │    │
         ▼    ▼
      SUCCESS ERROR: 500
      │     Server Error
      │
      ▼
    ┌──────────────────────────┐
    │ RESPONSE (JSON)          │
    │ {                        │
    │   success: boolean       │
    │   data?: {...}           │
    │   message?: string       │
    │ }                        │
    └──────────────────────────┘
```

---

## 9. Share Link Token Generation & Validation

```
ADMIN CREATES MENU
    │
    ├─ Token Generation:
    │  crypto.randomBytes(32).toString('hex')
    │  Example: "a3f7d9c2b1e6f8a4c5b9d1e3f5a7b9c2d4e6f8..."
    │
    └─ Share Link Format:
       https://app.com/menu-select/a3f7d9c2b1e6f8a4c5b9d1e3f5a7b9c2d4e6f8...
       └── Token stored in DB

CUSTOMER CLICKS LINK
    │
    ├─ Route: /menu-select/:token
    │
    ├─ Query DB:
    │  db.weeklymenus.findOne({
    │    'shareLink.token': token,
    │    'shareLink.isActive': true,
    │    'isPublished': true
    │  })
    │
    ├─ Check Expiry:
    │  if (menu.shareLink.expiresAt > new Date()) ✓ VALID
    │  else ✗ EXPIRED
    │
    └─ Return Menu or Error
       Success: Display MenuSelection component
       Expired: "Link expired, contact admin"
```

---

## 10. Database Indexes for Performance

```
customers collection:
├─ { email: 1 } - UNIQUE, fast lookups by email
├─ { athleatId: 1 } - Fast sync tracking
└─ { currentWeekMenu: 1 } - Find customers in menu

menuitems collection:
├─ { itemDate: 1, mealType: 1 } - Fast filtering by date/type
├─ { mealPlan: 1 } - Filter by plan
└─ { mealName: "text" } - Text search

weeklymenus collection:
├─ { startDate: 1, endDate: 1 } - Range queries
├─ { shareLink.token: 1 } - UNIQUE, fast public access
└─ { isActive: 1, isPublished: 1 } - Filtering
```

---

This architecture ensures:
- ✅ Fast customer lookups
- ✅ Real-time sync with Athleat
- ✅ Secure public sharing
- ✅ Easy analytics
- ✅ Scalable menu management
