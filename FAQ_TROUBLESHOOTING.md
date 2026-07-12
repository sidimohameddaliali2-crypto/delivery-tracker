# FAQ & Troubleshooting Guide

## ❓ Frequently Asked Questions

### General Questions

**Q: How do I get started with the menu system?**
A: Follow the Quick Start guide in `QUICK_START_MENU_SYSTEM.md`. It takes about 5 minutes to set up.

**Q: Do customers need to log in to select meals?**
A: No! They just need to click the share link and enter their email. No login required.

**Q: How long are share links valid?**
A: Links are valid for 30 days by default. You can create new menus and links anytime.

**Q: Where is the customer data coming from?**
A: The system first checks your local database. If not found, it automatically syncs with the Athleat FileMaker API.

**Q: Can I update a menu after publishing?**
A: Yes, you can edit the menu before customers finalize selections. Once selections are saved, the menu is locked.

**Q: What meal plans are supported?**
A: Standard, Customized, Premium, Vegan, Keto, and Paleo.

**Q: Can customers change their meal selections after confirmation?**
A: Currently no, but this can be added as a future feature.

---

### Technical Questions

**Q: What database does this use?**
A: MongoDB. Three new collections are created: `customers`, `menuitems`, and `weeklymenus`.

**Q: How is the Athleat API authentication handled?**
A: The `athleatService.js` manages session tokens automatically. Tokens are cached and refreshed every 15 minutes.

**Q: Can I import existing menu items from Athleat?**
A: Yes, through the `getMenuItems()` API method. You can build a bulk import script using this endpoint.

**Q: What happens if Athleat API is down?**
A: The system checks the local database first. If the API is down, existing local customer data is used.

**Q: How are share links secured?**
A: They use 32-byte random tokens (cryptographically secure) with 30-day expiry. No authentication needed for access.

---

## 🐛 Troubleshooting

### Server Won't Start

**Problem**: "Cannot find module 'mongoose'" or similar error
```
✗ Error: Cannot find module
```

**Solution**: Install dependencies
```bash
cd server
npm install
```

**Problem**: "MONGODB_URI is not defined"
```
✗ Error: MongoDB connection failed
```

**Solution**: Check `.env` file has `MONGODB_URI` set
```bash
# In server/.env
MONGODB_URI=mongodb+srv://username:password@host/dbname
```

---

### Athleat API Issues

**Problem**: "Athleat authentication failed"
```
✗ Error: Athleat authentication failed: Connection refused
```

**Solution**: 
1. Verify Athleat server is online: `ping fmserver19.hulexo.online`
2. Check credentials in `.env`:
   ```bash
   ATHLEAT_BASE_URL=http://fmserver19.hulexo.online:3000
   ATHLEAT_BASIC_AUTH=V2ViQVBJOldlYkFQSUF0aGxlYXQ=
   ```
3. Test connection with curl:
   ```bash
   curl -X POST https://fmserver19.hulexo.online:3000/fmi/data/vLatest/databases/Athleat%20Dev/sessions \
     -H "Authorization: Basic V2ViQVBJOldlYkFQSUF0aGxlYXQ="
   ```

**Problem**: "Customer not found"
```
✗ Error: Customer profile not found
```

**Solution**:
1. Verify email exists in Athleat database (Customer or Leads table)
2. Check email format (should be lowercase, valid email)
3. Try querying Athleat directly
4. Check Athleat database name in `.env`

---

### Menu & Selection Issues

**Problem**: "Menu not found or link expired"
```
✗ Error: Menu not found or link expired
```

**Solution**:
1. Verify menu is published: `isPublished: true`
2. Check share link token is correct
3. Verify token hasn't expired (created > 30 days ago)
4. Create a new menu if link is old
5. Test with admin share link endpoint:
   ```bash
   GET /api/menus/:id/share-link
   ```

**Problem**: "Failed to save meal selections"
```
✗ Error: Cannot save selections
```

**Solution**:
1. Check database connection
2. Verify customer email is correct
3. Ensure menu exists: `GET /api/menus/:id`
4. Check selections array is properly formatted
5. View server logs for detailed error

---

### Frontend Issues

**Problem**: "Menu page shows 'No menus yet'"
```
✗ Admin page empty even after creating menus
```

**Solution**:
1. Refresh the page (hard refresh: Ctrl+Shift+R)
2. Check browser console for errors (F12 → Console)
3. Verify API endpoint is responding:
   ```bash
   curl http://localhost:5000/api/menus
   ```
4. Check auth token is valid
5. Check user role is 'admin'

**Problem**: "Share link button doesn't show URL"
```
✗ Cannot copy share link
```

**Solution**:
1. Verify menu is published first
2. Check `FRONTEND_URL` in `.env`
3. Clear browser cache
4. Restart server to pick up new env variables
5. Check browser console for errors

**Problem**: "Email input won't accept input"
```
✗ Menu selection page frozen at step 1
```

**Solution**:
1. Clear browser cache and cookies
2. Try incognito/private window
3. Check browser console for JavaScript errors
4. Verify API is responding: `GET /api/menus/share/:token`
5. Try different browser

---

### Database Issues

**Problem**: "Duplicate key error"
```
✗ MongoError: E11000 duplicate key error
```

**Solution**:
1. Customer email already exists with same value
2. Drop collection and recreate:
   ```bash
   # In MongoDB shell
   db.customers.deleteMany({})
   ```
3. Or update existing document instead of inserting

**Problem**: "Database connection timeout"
```
✗ Error: MongoDB connection timeout
```

**Solution**:
1. Check MongoDB server is running
2. Verify connection string in `.env`
3. Check network connectivity
4. Test connection:
   ```bash
   mongosh "mongodb+srv://username:password@host/dbname"
   ```

---

### Authentication Issues

**Problem**: "401 Unauthorized"
```
✗ Error: Unauthorized access to /api/menus
```

**Solution**:
1. Log in again to get fresh token
2. Check token is in Authorization header:
   ```
   Authorization: Bearer <token>
   ```
3. Verify user role includes admin permissions
4. Check token hasn't expired (usually 7 days)
5. Refresh page and try again

---

## 🔍 Debugging Tips

### Enable Detailed Logging

Add to `server/routes/menus.js`:
```javascript
console.log('🔍 Request:', req.method, req.path);
console.log('🔍 Body:', req.body);
console.log('🔍 Query:', req.query);
```

### Check API Responses

In browser Console (F12):
```javascript
// Test API endpoint
fetch('/api/menus')
  .then(r => r.json())
  .then(d => console.log('Response:', d));
```

### Monitor Database

```bash
# MongoDB Atlas web console
# or local MongoDB:
mongosh
use your_database
db.customers.find()
db.weeklymenus.find()
db.menuitems.find()
```

### View Server Logs

```bash
# If running with npm run dev
# Check terminal output for errors

# Or check log file
tail -f server/server.log
```

### Test API with Postman

1. Import endpoints into Postman
2. Set Authorization header with token
3. Test each endpoint manually
4. Check request/response in detail

---

## ⚠️ Common Mistakes

### 1. Forgetting to Publish Menu
**Mistake**: Creating menu but share link doesn't work
**Fix**: Click "Publish" button before sharing

### 2. Wrong Email Format
**Mistake**: Customer enters "John@Email.com" but data is for "john@email.com"
**Fix**: Normalize email to lowercase in Athleat

### 3. Token in Wrong Header
**Mistake**: Putting token in Authorization without "Bearer"
**Fix**: Use `Authorization: Bearer <token>` format

### 4. Env Variables Not Reloaded
**Mistake**: Changed `.env` but server still using old values
**Fix**: Restart server: `npm run dev`

### 5. MongoDB Not Connected
**Mistake**: Creating documents but they don't appear in database
**Fix**: Check connection string, verify MongoDB is running

---

## 📋 Health Check Procedure

Follow this to verify everything is working:

```bash
# 1. Check server is running
curl http://localhost:5000/api/health
# Expected: { status: "ok" }

# 2. Check API routes exist
curl http://localhost:5000/api/menus
# Expected: { success: true, data: [...] } or 401 (needs auth)

# 3. Check Athleat connection
curl http://localhost:5000/api/menus/customers/test@example.com/meal-profile
# Expected: { success: true, data: {...} } or "Customer not found"

# 4. Check MongoDB
mongosh
> db.customers.count()
> db.weeklymenus.count()
> db.menuitems.count()

# 5. Check frontend loads
# Navigate to http://localhost:5173
# Should load without errors

# 6. Check admin page
# Navigate to http://localhost:5173/menus
# Should show menu list (admin only)

# 7. Check public page
# Navigate to http://localhost:5173/menu-select/test-token
# Should show email form

# All green? ✅ System is working!
```

---

## 🆘 Getting Help

### If You Get Stuck

1. **Check the Logs**
   - Browser console (F12)
   - Server terminal
   - MongoDB output

2. **Try Simple Tests**
   - Test API with curl/Postman
   - Check database directly
   - Verify environment variables

3. **Read Documentation**
   - ATHLEAT_INTEGRATION_GUIDE.md (detailed)
   - QUICK_START_MENU_SYSTEM.md (quick)
   - Source code comments

4. **Common Solutions**
   - Restart server
   - Clear browser cache
   - Reinstall dependencies
   - Check credentials
   - Verify network connection

---

## 📞 Support Contacts

- **Athleat API Issues**: Check Athleat documentation or contact FileMaker support
- **MongoDB Issues**: Refer to MongoDB documentation
- **Code Issues**: Review comments in source files

---

## 🚀 Quick Recovery Checklist

| Issue | Check | Fix |
|-------|-------|-----|
| Server crashes | Logs | Restart, check errors |
| API 404 | Routes | Verify endpoint path |
| API 401 | Token | Login again, check auth |
| API 500 | Logs | Fix code error, restart |
| DB connection fail | Connection string | Update `.env`, restart |
| Athleat unreachable | Network | Check credentials, ping |
| Share link broken | Menu published | Publish menu first |
| No menus showing | Browser cache | Hard refresh (Ctrl+Shift+R) |
| Email not found | Athleat database | Add customer to Athleat |
| Meals don't save | DB connection | Check MongoDB running |

---

## 💡 Pro Tips

✅ Always restart server after changing `.env`
✅ Use hard refresh (Ctrl+Shift+R) to clear browser cache
✅ Test with valid data from Athleat first
✅ Check server logs before database
✅ Use Postman to test API endpoints
✅ Verify token includes "Bearer " prefix
✅ Keep Athleat credentials in `.env`, never in code
✅ Use console.log for debugging
✅ Check network tab in DevTools for request details

---

## 🎯 Quick Reference

```bash
# Restart everything
cd server && npm run dev        # Terminal 1
cd client && npm run dev        # Terminal 2

# Test API endpoint
curl http://localhost:5000/api/menus

# Check Athleat
curl https://fmserver19.hulexo.online:3000/

# Check MongoDB
mongosh
db.customers.count()

# View logs
tail -f server/server.log       # Server logs
# Press F12 in browser          # Client logs

# Hard refresh browser
Ctrl + Shift + R (Windows/Linux)
Cmd + Shift + R (Mac)
```

---

Stuck? Check the logs first! 🔍

