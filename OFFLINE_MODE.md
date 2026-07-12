# Offline Mode Implementation

## Overview

The Matter Delivery Tracker now supports **offline functionality** for the driver mobile page, allowing drivers to work without internet connectivity. Changes are automatically synced when the connection is restored.

## Features

✅ **Service Worker Caching**: Static assets and API responses cached for offline access  
✅ **Offline Detection**: Visual banner alerts drivers when offline  
✅ **Background Sync**: Queued requests automatically sync when online  
✅ **Progressive Web App (PWA)**: Can be installed on mobile devices  
✅ **Network Strategies**: Smart caching strategies for optimal performance  

---

## How It Works

### 1. **Service Worker** (`client/public/service-worker.js`)

The service worker implements intelligent caching strategies:

#### **Network-First (API Requests)**
```javascript
// For /api/* requests
fetch(request) → Cache successful responses
  ↓ (if network fails)
Return cached response
  ↓ (if cache also fails)
Return offline indicator: { success: false, offline: true }
```

**Benefits**: 
- Always tries to get fresh data
- Falls back to cached data if offline
- Provides offline status to the app

#### **Cache-First (Static Assets & Navigation)**
```javascript
// For pages, CSS, JS, images
Check cache first → Return immediately
  ↓ (if not in cache)
Fetch from network → Cache the result
```

**Benefits**:
- Instant page loads from cache
- Works completely offline after first visit
- Updates cache when online

### 2. **Background Sync**

Failed POST/PUT/PATCH requests are automatically retried when the connection is restored:

```javascript
// Service worker queues failed requests
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-deliveries') {
    // Retry all queued requests
  }
});
```

### 3. **Offline Detection UI** (`DriverMobile.js`)

**Offline Banner**:
```
⚠️ Offline Mode
Changes will sync automatically when online
```

**Sync Indicator** (when online with pending changes):
```
🔄 Syncing...
Uploading 3 pending action(s)
```

---

## Files Modified

### 1. **Service Worker** (NEW)
**File**: `client/public/service-worker.js`  
**Size**: 200+ lines  
**Purpose**: Handles caching, offline requests, background sync

**Cache Strategy**:
- Cache name: `delivery-tracker-v1`
- Cached assets: Root page, driver mobile page, CSS, manifest, images
- Auto-cleanup of old caches on activation

### 2. **Service Worker Registration**
**File**: `client/src/index.js`  
**Changes**:
- Registers service worker on page load
- Checks for updates every minute
- Handles service worker updates

### 3. **PWA Manifest**
**File**: `client/public/manifest.json`  
**Changes**:
- `start_url`: `/driver-mobile` (opens directly to driver page)
- `display`: `standalone` (looks like a native app)
- `orientation`: `portrait` (locked to portrait mode)
- `theme_color`: `#3b82f6` (blue header color)

### 4. **Driver Mobile Page**
**File**: `client/src/pages/DriverMobile.js`  
**Changes**:
- Added `isOnline` state (tracks connection status)
- Added `offlineQueue` state (tracks pending changes)
- Online/offline event listeners
- Offline banner UI (yellow warning)
- Sync indicator UI (blue, animated spinner)

---

## Testing Offline Mode

### **Test Scenario 1: View Deliveries Offline**

1. Open driver page while online
2. Wait for deliveries to load
3. Open Chrome DevTools → Network tab
4. Set throttling to "Offline"
5. ✅ Verify: Page still works, deliveries still visible
6. ✅ Verify: Yellow offline banner appears

### **Test Scenario 2: Update Delivery Status Offline**

1. Go offline (DevTools → Network → Offline)
2. Try to start/complete a delivery
3. ✅ Verify: Action appears to work (service worker returns offline response)
4. Go back online
5. ✅ Verify: Changes sync automatically
6. ✅ Verify: Blue sync indicator shows during sync

### **Test Scenario 3: Service Worker Update**

1. Make changes to service-worker.js
2. Change cache name: `delivery-tracker-v1` → `delivery-tracker-v2`
3. Reload the page
4. ✅ Verify: Console shows "New service worker available"
5. Hard refresh (Ctrl+Shift+R)
6. ✅ Verify: New service worker activates

### **Test Scenario 4: PWA Installation**

1. Open driver page on mobile Chrome/Edge
2. Look for "Add to Home Screen" prompt
3. Tap "Install"
4. ✅ Verify: App appears on home screen
5. Open from home screen
6. ✅ Verify: Opens in standalone mode (no browser UI)

---

## Development Notes

### **Debugging Service Worker**

**Chrome DevTools**:
1. Open DevTools → Application tab
2. Service Workers section → View registered workers
3. Check "Update on reload" for development
4. Use "Unregister" to remove service worker

**Console Logs**:
```javascript
// Service worker logs
console.log('Service Worker registered:', registration.scope);
console.log('🟢 Network connection restored');
console.log('🔴 Network connection lost');
```

### **Cache Management**

**Clear all caches**:
```javascript
// From browser console
caches.keys().then(names => {
  names.forEach(name => caches.delete(name));
});
```

**Message service worker to clear cache**:
```javascript
navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_CACHE' });
```

### **Common Issues**

**Issue**: Service worker not updating  
**Solution**: 
- Hard refresh (Ctrl+Shift+R)
- Check "Update on reload" in DevTools
- Change cache version name

**Issue**: Offline banner not showing  
**Solution**:
- Check network status: `console.log(navigator.onLine)`
- Verify event listeners are attached
- Check DevTools Network tab throttling

**Issue**: API requests not caching  
**Solution**:
- Verify request URL starts with `/api/`
- Check Network tab → Service Worker column
- Inspect cache contents in DevTools → Application → Cache Storage

---

## Future Enhancements

### **Planned Improvements**:

1. **IndexedDB Storage**
   - Store deliveries locally
   - Sync on reconnection
   - Better offline data management

2. **Retry Queue UI**
   - Show list of pending actions
   - Manual retry button
   - Clear queue option

3. **Offline Indicators**
   - Badge on delivery cards showing "offline update"
   - Timestamp of last sync
   - Conflict resolution for concurrent updates

4. **Smart Pre-caching**
   - Pre-cache tomorrow's deliveries
   - Pre-cache frequent routes
   - Background fetch API for large datasets

5. **App Icons**
   - Create 192x192 and 512x512 PNG icons
   - Add maskable icons for Android
   - Update manifest.json

---

## Browser Support

| Feature | Chrome | Edge | Safari | Firefox |
|---------|--------|------|--------|---------|
| Service Worker | ✅ | ✅ | ✅ | ✅ |
| Background Sync | ✅ | ✅ | ❌ | ❌ |
| PWA Installation | ✅ | ✅ | ✅ (iOS 11.3+) | ❌ |
| Cache API | ✅ | ✅ | ✅ | ✅ |

**Note**: Safari iOS supports PWAs but with limited background sync. Background sync will work on Android Chrome/Edge.

---

## Production Deployment

### **Checklist**:

- [x] Service worker created and tested
- [x] Manifest.json configured
- [x] Service worker registered
- [x] Offline UI added
- [ ] Create app icons (192x192, 512x512)
- [ ] Test on real mobile devices
- [ ] Test offline → online sync
- [ ] Configure HTTPS (required for service workers)
- [ ] Add analytics for offline usage

### **HTTPS Requirement**

⚠️ **Important**: Service workers only work on HTTPS or localhost.

**For production**:
1. Ensure your server has SSL certificate
2. Force HTTPS redirects
3. Update manifest start_url to use https://

**Check HTTPS**:
```bash
# Your site should be accessible at
https://yourdomain.com/driver-mobile
```

---

## Monitoring

### **Metrics to Track**:

1. **Service Worker Registration Rate**
   - % of users with service worker active
   - Errors during registration

2. **Offline Usage**
   - How often drivers go offline
   - Average offline duration
   - Actions performed while offline

3. **Sync Success Rate**
   - % of offline actions successfully synced
   - Sync failures and reasons

4. **Cache Hit Rate**
   - % of requests served from cache
   - Cache size and efficiency

---

## Quick Reference

### **Enable Offline Mode** (Development)
```javascript
// Chrome DevTools → Network tab
Throttling: Offline
```

### **Check Service Worker Status**
```javascript
navigator.serviceWorker.getRegistrations()
  .then(regs => console.log('Active workers:', regs.length));
```

### **Manual Sync Trigger**
```javascript
navigator.serviceWorker.ready
  .then(reg => reg.sync.register('sync-deliveries'));
```

### **Clear All Caches**
```javascript
caches.keys().then(keys => 
  Promise.all(keys.map(key => caches.delete(key)))
);
```

---

## Support

For issues or questions:
1. Check console logs for service worker errors
2. Verify HTTPS is enabled in production
3. Test in incognito mode to rule out cache issues
4. Check DevTools → Application → Service Workers

**Common Fix**: Hard refresh (Ctrl+Shift+R) or unregister service worker and reload.
