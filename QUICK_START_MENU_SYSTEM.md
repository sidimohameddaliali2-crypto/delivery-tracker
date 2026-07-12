# Quick Start: Athleat Integration & Menu System

## 🚀 Getting Started (5 Minutes)

### Step 1: Configure Environment Variables
Add to `server/.env`:
```env
ATHLEAT_BASE_URL=http://fmserver19.hulexo.online:3000
ATHLEAT_DATABASE=Athleat%20Dev
ATHLEAT_BASIC_AUTH=V2ViQVBJOldlYkFQSUF0aGxlYXQ=
FRONTEND_URL=https://matterapp.online
```

### Step 2: Start Your Server
```bash
cd server
npm install  # if needed
npm run dev
```

### Step 3: Access the Features

#### For Admins - Create & Share Weekly Menus
1. Navigate to `/menus` (admin panel)
2. Click "Create Menu"
3. Fill in:
   - Title: "Week of Feb 10-16"
   - Dates: Feb 10 - Feb 16
   - Click Create
4. Click "Publish" to activate
5. Click "Copy Link" to share with customers
6. Share the generated link with customers

#### For Customers - Select Meals
1. Receive share link: `https://yourapp.com/menu-select/abc123xyz...`
2. Click link
3. Enter email address
4. View your meal preferences (from Athleat)
5. Select meals one by one
6. Confirm selection
7. Done! Your selections are saved

#### In Customer Page
1. Go to `/customers`
2. Click on a customer
3. Scroll to "Meal Preferences" section
4. View/edit dietary info, allergies, preferences

---

## 📊 Data Flow

```
┌─────────────┐
│  Athleat    │
│  FileMaker  │
└──────┬──────┘
       │ (API Integration)
       ↓
┌─────────────────────────────────┐
│  Customer Meal Profile          │
│  - mealPerDay: 2                │
│  - mealPlan: "Customized"       │
│  - breakfastInclude: true       │
│  - mealExclusion: "nuts"        │
└────────────┬────────────────────┘
             │
    ┌────────┴────────┐
    ↓                 ↓
 Weekly Menu      Menu Selection
 (Admin)          (Customer)
    │                 │
    └────────┬────────┘
             ↓
     Customer Selections
     (Saved to DB)
```

---

## 🔑 Key Endpoints

### Customer Meal Profile
```bash
# Get customer's meal preferences
GET http://localhost:5000/api/menus/customers/john@example.com/meal-profile

# Update preferences
POST http://localhost:5000/api/menus/customers/john@example.com/meal-profile
{
  "mealPerDay": 2,
  "allergies": ["peanuts", "shellfish"],
  "dietaryRestrictions": ["vegetarian"]
}
```

### Weekly Menus (Admin)
```bash
# Create menu
POST http://localhost:5000/api/menus
{
  "title": "Week of Feb 10-16",
  "startDate": "2025-02-10",
  "endDate": "2025-02-16",
  "mealPlans": ["Standard", "Customized"]
}

# Get all menus
GET http://localhost:5000/api/menus

# Publish menu
PUT http://localhost:5000/api/menus/:id
{ "isPublished": true }

# Get share link
GET http://localhost:5000/api/menus/:id/share-link
```

### Public Menu Access
```bash
# Customer views menu (no auth needed)
GET http://localhost:5000/api/menus/share/token123abc

# Customer selects meals
POST http://localhost:5000/api/menus/customers/john@example.com/select-meals
{
  "weeklyMenuId": "menu_id",
  "selections": [
    {
      "date": "2025-02-10",
      "mealType": "breakfast",
      "menuItemId": "item_id"
    }
  ]
}
```

---

## 📱 UI Navigation

### Admin Routes
- `/menus` - Weekly menu management
- `/customers` - View customer meal preferences

### Public Routes
- `/menu-select/:token` - Customer meal selection (shareable link)

---

## 🗄️ Database Collections

| Collection | Purpose |
|-----------|---------|
| `customers` | Customer meal profiles & selections |
| `menuitems` | Individual menu items (meals) |
| `weeklymenus` | Weekly menu definitions |

---

## ✅ Verification Checklist

After setup, verify:

- [ ] Server starts without errors
- [ ] Athleat credentials are correct (no connection errors)
- [ ] Can access `/menus` page (admin)
- [ ] Can create a weekly menu
- [ ] Can get share link
- [ ] Can access menu-select page with token
- [ ] Can enter email and see customer data
- [ ] Can select meals and get confirmation
- [ ] Customer profile shows in `/customers` page
- [ ] Meal preferences visible in customer detail

---

## 🧪 Testing with cURL

### Test Athleat Connection
```bash
# This will fail gracefully if Athleat is unreachable
curl -X GET http://localhost:5000/api/menus/customers/test@example.com/meal-profile
```

### Test Menu Creation (Requires Auth)
```bash
# First login to get token
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password"}'

# Then create menu with token
curl -X POST http://localhost:5000/api/menus \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title":"Test Week",
    "startDate":"2025-02-10",
    "endDate":"2025-02-16"
  }'
```

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| "Athleat API unreachable" | Check network, verify ATHLEAT_BASE_URL in .env |
| "Customer not found" | Email must exist in Athleat database |
| "Share link expired" | Links expire after 30 days, create new menu |
| "Menu not published" | Click "Publish" button on menu before sharing |
| "401 Unauthorized" | Login again, token may have expired |

---

## 📚 Additional Resources

- Full documentation: See `ATHLEAT_INTEGRATION_GUIDE.md`
- API routes: `server/routes/menus.js`
- Services: `server/services/athleatService.js`
- Component code: `client/src/components/MenuSelection.jsx`

---

## 🎯 Next Steps

1. **Add Menu Items**: Create MenuItem records via API or bulk import
2. **Customize UI**: Modify TypeForm-like selection styles
3. **Add Notifications**: Send emails after selection
4. **Analytics**: Track popular meals and preferences
5. **Integration**: Link selections to delivery records

---

## 💡 Tips

- Test with your own email first
- Create multiple menus for different weeks
- Share links via QR code or short URL
- Monitor `selectionCount` and `viewCount` on menu dashboard
- Export customer preferences for meal planning

