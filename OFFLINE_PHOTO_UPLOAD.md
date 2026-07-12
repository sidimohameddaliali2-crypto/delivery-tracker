# Offline Photo Upload & Delivery Completion

## 🎯 Feature Overview

Drivers can now **complete deliveries and upload photos while completely offline**. Photos and delivery updates are stored locally using IndexedDB and automatically synced when the internet connection is restored.

---

## ✨ Key Features

### **1. Complete Deliveries Offline**
- ✅ Scan QR code (or skip if no code)
- ✅ Capture delivery photo
- ✅ Complete delivery without internet
- ✅ All data stored locally in IndexedDB

### **2. Offline Photo Storage**
- ✅ Photos stored as Base64 in IndexedDB
- ✅ Unlimited storage (browser-dependent, typically 50MB+)
- ✅ Automatic cleanup of synced photos after 7 days
- ✅ Preserves photo quality

### **3. Automatic Sync**
- ✅ Detects when connection is restored
- ✅ Uploads photos first
- ✅ Then completes delivery updates
- ✅ Shows real-time progress (0-100%)
- ✅ Manual "Sync Now" button

### **4. Smart Queue Management**
- ✅ Links photos with their deliveries
- ✅ Syncs in correct order
- ✅ Handles failures gracefully
- ✅ Retries failed uploads

---

## 🔄 How It Works

### **Offline Mode Flow**

```
Driver completes delivery offline:
  1. Scan QR code → stored in memory
  2. Capture photo → stored in IndexedDB
  3. Complete delivery → queued in IndexedDB
  4. See success: "✅ Delivery saved! Will sync when online."
  5. Delivery marked complete locally (faded in UI)

When connection restored:
  1. Auto-sync triggered (2s delay for stability)
  2. Upload photo from IndexedDB
  3. Get photo URL from server
  4. Update delivery with photo URL
  5. Mark as synced
  6. Clean up local storage
```

### **Architecture**

```
┌─────────────────────────────────────────┐
│         Driver Mobile Component         │
│  (Capture photo + Complete delivery)    │
└──────────────┬──────────────────────────┘
               │
               ├─ Online? ──> Upload photo → Complete delivery
               │
               └─ Offline? ──> Store in IndexedDB
                               │
                    ┌──────────▼───────────┐
                    │   IndexedDB Storage  │
                    │  ┌─────────────────┐ │
                    │  │ offlinePhotos   │ │
                    │  │ - id            │ │
                    │  │ - deliveryId    │ │
                    │  │ - photoDataUrl  │ │
                    │  │ - bagId         │ │
                    │  │ - timestamp     │ │
                    │  │ - synced: false │ │
                    │  └─────────────────┘ │
                    │  ┌─────────────────┐ │
                    │  │ syncQueue       │ │
                    │  │ - id            │ │
                    │  │ - deliveryId    │ │
                    │  │ - status        │ │
                    │  │ - proof         │ │
                    │  │ - bagId         │ │
                    │  │ - customerId    │ │
                    │  │ - timestamp     │ │
                    │  └─────────────────┘ │
                    └──────────┬───────────┘
                               │
          When online ─────────┘
                               │
                    ┌──────────▼───────────┐
                    │   Offline Sync       │
                    │  1. Upload photos    │
                    │  2. Complete deliveries
                    │  3. Mark as synced   │
                    │  4. Cleanup old data │
                    └──────────────────────┘
```

---

## 📁 Files Created/Modified

### **New Files**

#### **1. `client/src/utils/offlineStorage.js`**
Handles IndexedDB operations for storing photos and delivery updates.

**Key Functions**:
- `storePhotoOffline(deliveryId, photoDataUrl, bagId)` - Store photo locally
- `queueDeliveryUpdate(deliveryUpdate)` - Queue delivery for sync
- `getPendingPhotos()` - Get all unsynced photos
- `getPendingSyncQueue()` - Get all pending deliveries
- `markPhotoSynced(photoId)` - Mark photo as uploaded
- `markQueueItemSynced(queueId)` - Mark delivery as synced
- `cleanupOldPhotos()` - Delete synced photos older than 7 days
- `getPendingCount()` - Get count of pending items

**IndexedDB Schema**:
```javascript
Database: MatterDeliveryOffline (v1)

Store: offlinePhotos
  - id (autoIncrement)
  - deliveryId
  - photoDataUrl (Base64)
  - bagId
  - timestamp
  - synced (boolean)
  - syncedAt

Store: syncQueue
  - id (autoIncrement)
  - deliveryId
  - status ('pending' | 'synced')
  - proof (object)
  - bagId
  - customerId
  - customerName
  - timestamp
  - syncedAt
```

#### **2. `client/src/utils/offlineSync.js`**
Manages syncing offline data when connection is restored.

**Key Functions**:
- `syncOfflineData()` - Main sync function
- `onSyncStatusChange(callback)` - Subscribe to sync events
- `setupAutoSync()` - Auto-sync on reconnection
- `hasPendingSync()` - Check if sync needed

**Sync Process**:
1. Get all pending photos and deliveries
2. Link photos with their deliveries
3. Upload photo → Get URL
4. Complete delivery with photo URL
5. Mark both as synced
6. Clean up old data
7. Notify listeners of progress

### **Modified Files**

#### **3. `client/src/pages/DriverMobile.js`**

**Changes**:
- Added `syncStatus` state for tracking sync progress
- Added `offlineQueue` count from IndexedDB
- Modified `handleFinalizeDelivery()` to detect offline mode
- Stores photo in IndexedDB when offline
- Queues delivery update when offline
- Shows "Sync Now" button when pending items exist
- Updates queue count after sync

**New Imports**:
```javascript
import { storePhotoOffline, queueDeliveryUpdate, getPendingCount } from '../utils/offlineStorage';
import { syncOfflineData, setupAutoSync, onSyncStatusChange } from '../utils/offlineSync';
```

**New State**:
```javascript
const [syncStatus, setSyncStatus] = useState({ syncing: false, progress: 0 });
```

**Offline Detection in `handleFinalizeDelivery()`**:
```javascript
if (!navigator.onLine) {
  // Store photo in IndexedDB
  await storePhotoOffline(currentDelivery._id, capturedPhoto, bagIdToUse);
  
  // Queue delivery update
  await queueDeliveryUpdate({
    deliveryId: currentDelivery._id,
    status: 'delivered',
    proof: proofData,
    bagId: bagIdToUse,
    customerId: currentDelivery.customerId,
    customerName: currentDelivery.customerName
  });
  
  setScanSuccess('✅ Delivery saved! Will sync when online.');
}
```

---

## 🧪 Testing Guide

### **Test 1: Complete Delivery Offline**

**Steps**:
1. Open driver page (`/driver-mobile`)
2. Login as driver
3. Open DevTools → Network tab
4. Set throttling to **Offline**
5. Select a delivery
6. Click "Complete Delivery"
7. Scan QR code (or skip)
8. Capture photo
9. Complete delivery

**Expected Results**:
- ✅ Photo captured successfully
- ✅ Success message: "✅ Delivery saved! Will sync when online."
- ✅ Delivery marked complete locally (faded in list)
- ✅ No errors in console

### **Test 2: Auto-Sync When Online**

**Steps**:
1. Complete delivery offline (Test 1)
2. Set Network throttling back to **No throttling**
3. Wait 2-3 seconds

**Expected Results**:
- ✅ Blue sync indicator appears
- ✅ Progress shows: "Syncing... Progress: 50%"
- ✅ Photo uploads to server
- ✅ Delivery updates on server
- ✅ Sync indicator disappears
- ✅ Queue count becomes 0

### **Test 3: Multiple Deliveries Offline**

**Steps**:
1. Go offline
2. Complete 3-5 deliveries with photos
3. Check offline queue count
4. Go back online
5. Watch sync progress

**Expected Results**:
- ✅ All deliveries queued
- ✅ Queue count shows correct number (e.g., "5 pending action(s)")
- ✅ Sync uploads all photos sequentially
- ✅ All deliveries completed on server
- ✅ Progress bar goes from 0% to 100%

### **Test 4: Manual Sync Button**

**Steps**:
1. Complete delivery offline
2. Go online
3. Wait for auto-sync to finish (or interrupt it)
4. Click **"Sync Now"** button

**Expected Results**:
- ✅ Sync starts immediately
- ✅ Progress updates in real-time
- ✅ Button becomes disabled during sync
- ✅ Success when complete

### **Test 5: IndexedDB Storage**

**Steps**:
1. Complete delivery offline
2. Open DevTools → Application tab
3. Navigate to **IndexedDB** → `MatterDeliveryOffline`
4. Check `offlinePhotos` store
5. Check `syncQueue` store

**Expected Results**:
- ✅ Photo entry exists with:
  - `deliveryId`
  - `photoDataUrl` (Base64 string)
  - `synced: false`
  - `timestamp`
- ✅ Queue entry exists with:
  - `deliveryId`
  - `status: 'pending'`
  - `proof` object

### **Test 6: Sync Failure Handling**

**Steps**:
1. Complete delivery offline
2. Go online
3. During sync, go offline again (quickly)
4. Check if partially synced
5. Go online again

**Expected Results**:
- ✅ Sync stops gracefully when offline
- ✅ Successfully synced items marked as synced
- ✅ Failed items remain pending
- ✅ Retry works when back online

---

## 🎨 UI Updates

### **Offline Banner** (Yellow)
```
⚠️ Offline Mode
Changes will sync automatically when online
```

### **Sync Indicator** (Blue, Animated)
```
🔄 Syncing...
Progress: 67% (2 synced)
```

### **Ready to Sync** (Blue, Static)
```
🔄 Ready to Sync
5 pending action(s)
[Sync Now]
```

### **Offline Success Message** (Green)
```
✅ Delivery saved! Will sync when online.
```

---

## 📊 Storage Limits

### **IndexedDB Capacity**

| Browser | Typical Limit | Max Limit |
|---------|---------------|-----------|
| Chrome | 60% of disk space | ~280GB |
| Firefox | 50% of disk space | ~2GB per origin |
| Safari | 1GB | 1GB |
| Edge | 60% of disk space | ~280GB |

### **Photo Storage**

Assuming average photo size: **500KB**

| Storage | Photos |
|---------|--------|
| 10MB | ~20 photos |
| 50MB | ~100 photos |
| 100MB | ~200 photos |

**Recommendation**: Clean up after 7 days (automatic)

---

## 🔧 Developer Reference

### **Subscribe to Sync Events**

```javascript
import { onSyncStatusChange } from '../utils/offlineSync';

useEffect(() => {
  const unsubscribe = onSyncStatusChange((status) => {
    console.log('Sync status:', status);
    // status.syncing - boolean
    // status.progress - 0-100
    // status.successCount - number
    // status.failedCount - number
  });
  
  return () => unsubscribe();
}, []);
```

### **Manually Trigger Sync**

```javascript
import { syncOfflineData } from '../utils/offlineSync';

const handleSync = async () => {
  const result = await syncOfflineData();
  console.log(`Synced: ${result.success}, Failed: ${result.failed}`);
};
```

### **Check Pending Count**

```javascript
import { getPendingCount } from '../utils/offlineStorage';

const count = await getPendingCount();
console.log(`Photos: ${count.photos}, Queue: ${count.queue}`);
```

### **Store Photo Manually**

```javascript
import { storePhotoOffline } from '../utils/offlineStorage';

const photoId = await storePhotoOffline(
  'delivery-123',    // deliveryId
  'data:image/jpeg...', // Base64 photo
  'bag-456'          // bagId (optional)
);
```

---

## 🐛 Troubleshooting

### **Problem: Photos not syncing**

**Check**:
1. Browser console for errors
2. DevTools → Application → IndexedDB → `MatterDeliveryOffline`
3. Network tab during sync

**Solution**:
```javascript
// Check pending items
const count = await getPendingCount();
console.log('Pending:', count);

// Manually trigger sync
await syncOfflineData();
```

### **Problem: IndexedDB not working**

**Check**:
- Browser supports IndexedDB: `console.log('indexedDB' in window)`
- Not in private/incognito mode (may have restrictions)
- Storage not full

**Solution**:
- Clear browser data
- Check browser storage settings
- Try different browser

### **Problem: Queue count not updating**

**Solution**:
```javascript
// Manually update queue count
const count = await getPendingCount();
setOfflineQueue(Array(count.total).fill(null));
```

### **Problem: Old photos taking up space**

**Solution**:
```javascript
// Manually cleanup
import { cleanupOldPhotos, cleanupOldQueueItems } from '../utils/offlineStorage';

await cleanupOldPhotos();
await cleanupOldQueueItems();
```

---

## 📈 Performance

### **Photo Compression**

Currently photos are stored as captured. For optimization:

```javascript
// Future enhancement: Compress before storing
const compressPhoto = (dataUrl, quality = 0.8) => {
  const canvas = document.createElement('canvas');
  const img = new Image();
  img.src = dataUrl;
  
  canvas.width = img.width * 0.5; // 50% size
  canvas.height = img.height * 0.5;
  
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  
  return canvas.toDataURL('image/jpeg', quality);
};
```

### **Batch Upload**

Currently uploads sequentially. For faster sync:

```javascript
// Future: Parallel uploads (max 3 concurrent)
const uploadBatch = async (photos) => {
  const batches = chunk(photos, 3);
  for (const batch of batches) {
    await Promise.all(batch.map(photo => uploadSinglePhoto(photo)));
  }
};
```

---

## ✅ Feature Summary

| Feature | Status | Description |
|---------|--------|-------------|
| **Offline Photo Capture** | ✅ | Capture photos without internet |
| **Local Storage** | ✅ | Store in IndexedDB |
| **Auto-Sync** | ✅ | Sync when connection restored |
| **Manual Sync** | ✅ | "Sync Now" button |
| **Progress Tracking** | ✅ | Real-time 0-100% progress |
| **Queue Management** | ✅ | Link photos with deliveries |
| **Cleanup** | ✅ | Auto-delete after 7 days |
| **Error Handling** | ✅ | Graceful failure handling |
| **Retry Logic** | ✅ | Automatic retry when online |

---

## 🎉 What's New

**Before**:
- ❌ Could not complete deliveries offline
- ❌ Photos required internet connection
- ❌ Lost work if connection dropped

**After**:
- ✅ Complete deliveries 100% offline
- ✅ Photos stored locally, uploaded later
- ✅ Work never lost, auto-syncs when online
- ✅ Real-time sync progress
- ✅ Manual sync control

---

## 🚀 Production Checklist

- [x] IndexedDB storage implementation
- [x] Offline photo capture
- [x] Sync manager with progress tracking
- [x] Auto-sync on reconnection
- [x] Manual sync button
- [x] Queue count display
- [x] Error handling
- [x] Automatic cleanup (7 days)
- [ ] Photo compression (optional enhancement)
- [ ] Parallel uploads (optional enhancement)

---

**Ready to test!** Go offline, complete a delivery with photo, go online, and watch it sync automatically! 🎊
