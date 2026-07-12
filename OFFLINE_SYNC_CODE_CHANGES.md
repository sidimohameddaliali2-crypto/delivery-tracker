# Offline Sync Implementation - Code Changes Summary

## Files Modified

### 1. client/src/utils/offlineStorage.js

**Line 110-180: Enhanced queueDeliveryUpdate() and added new functions**

```javascript
// NEW FIELDS added to queue items:
{
  deliveryId: string,
  status: string,
  proof: object,
  customerId: string,
  customerName: string,
  customerPhone: string,
  bagIds: array,
  
  // NEW: Sync tracking
  syncStatus: 'pending',        // Initial state
  retries: 0,                   // Retry counter
  lastSyncAttempt: null,        // Timestamp
  syncError: null               // Error message
}

// NEW FUNCTION: updateQueueItemSyncStatus()
export const updateQueueItemSyncStatus = async (id, syncStatus, errorMsg = null) => {
  // Updates queue item with new sync state
  // Tracks retries and last attempt time
  // Used by offlineSync.js to track sync progress
}

// NEW FUNCTION: getQueueItemsByStatus()
export const getQueueItemsByStatus = async (syncStatus) => {
  // Returns array of all queue items with given status
  // Used by UI hook and sync orchestration
}
```

### 2. client/src/utils/offlineSync.js

**Line 7-15: Enhanced imports**

```javascript
import {
  // ... existing imports
  updateQueueItemSyncStatus,    // NEW
  getQueueItemsByStatus          // NEW
} from './offlineStorage';
```

**Line 18-23: Auto-retry configuration**

```javascript
let autoRetryTimer = null;                // NEW: retry timer
const MAX_RETRIES = 10;                   // NEW: max attempts
const RETRY_DELAYS = [                    // NEW: exponential backoff
  1000,           // 1 second
  5000,           // 5 seconds
  30000,          // 30 seconds
  5 * 60000,      // 5 minutes
  10 * 60000      // 10 minutes
];
```

**Line 55-75: Enhanced processDeliveryUpdate()**

```javascript
const processDeliveryUpdate = async (queueItem, photoUrl = null) => {
  try {
    // Mark as syncing (NEW)
    await updateQueueItemSyncStatus(queueItem.id, 'syncing');
    
    // ... existing sync operations ...
    
    // Mark as synced on success (NEW)
    await updateQueueItemSyncStatus(queueItem.id, 'synced');
    
  } catch (error) {
    // Mark as failed with error (NEW)
    await updateQueueItemSyncStatus(queueItem.id, 'failed', error.message);
    throw error;
  }
};
```

**Line 300-365: NEW Auto-retry system**

```javascript
export const setupAutoRetry = () => {
  // Runs every 10 seconds when online
  // Finds failed items with retries < 10
  // Calculates backoff delay based on retry count
  // Resets to 'pending' when ready to retry
  // Triggers sync for pending items
}

export const stopAutoRetry = () => {
  // Cleanup function to stop retry timer
}
```

### 3. client/src/hooks/useSyncStatus.js (NEW FILE)

**Complete new file created**

```javascript
import { useState, useEffect, useCallback } from 'react';
import { getQueueItemsByStatus } from '../utils/offlineStorage';
import { onSyncStatusChange } from '../utils/offlineSync';

/**
 * Custom hook to track sync status of pending deliveries
 * Provides real-time status updates for UI rendering
 */
export const useSyncStatus = () => {
  const [syncStatus, setSyncStatus] = useState({});
  const [isSyncing, setIsSyncing] = useState(false);

  // ... implementation
  
  return {
    syncStatus,          // Map of deliveryId → {status, retries, error}
    isSyncing,          // Is any sync currently running?
    refreshSyncStatus   // Manual refresh function
  };
};

/**
 * Helper to get visual indicator for sync status
 */
export const getSyncStatusIndicator = (status) => {
  // Returns: { icon, label, color }
  // pending: '⏳', syncing: '🔄', synced: '✅', failed: '❌'
};
```

### 4. client/src/pages/DriverMobile.js

**Line 45: Enhanced imports**

```javascript
import { syncOfflineData, setupAutoSync, setupAutoRetry, onSyncStatusChange } from '../utils/offlineSync';
import { useSyncStatus, getSyncStatusIndicator } from '../hooks/useSyncStatus';
```

**Line 175-177: Initialize hook**

```javascript
// Track sync status of pending deliveries
const { syncStatus: deliverySyncStatus, isSyncing } = useSyncStatus();
```

**Line 281-282: Setup auto-retry**

```javascript
// Setup auto-sync for offline data
setupAutoSync();
setupAutoRetry();  // NEW: background retry of failed items
```

**Line 823-835: NEW Retry handler**

```javascript
const handleRetrySync = async (deliveryId) => {
  // Resets delivery status to 'pending'
  // Triggers immediate sync
  // Shows feedback message
}
```

**Line 4451-4487: Sync status summary (TOP of deliveries)**

```javascript
{/* NEW: Sync Status Summary */}
{Object.keys(deliverySyncStatus).length > 0 && (
  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
    {/* Shows overall sync state and counts */}
    {/* Updates in real-time as items sync */}
  </div>
)}
```

**Line 4515-4552: Enhanced delivery card**

```javascript
{pendingDeliveries.map((delivery) => {
  const status = getDeliveryStatus(delivery);
  const syncInfo = deliverySyncStatus[delivery._id];  // NEW
  const syncIndicator = syncInfo ? getSyncStatusIndicator(syncInfo) : null;  // NEW
  
  return (
    <div key={delivery._id} className={...}>
      {/* ... header content ... */}
      
      {/* NEW: Sync indicator next to Current badge */}
      {syncIndicator && (
        <div style={{ backgroundColor: syncIndicator.color + '20', ... }}>
          <span>{syncIndicator.icon} {syncIndicator.label}</span>
        </div>
      )}
      
      {/* NEW: Retry button for failed deliveries */}
      {syncInfo?.status === 'failed' && (
        <button onClick={() => handleRetrySync(delivery._id)}>
          Retry Sync
        </button>
      )}
    </div>
  );
})}
```

## Data Structure Examples

### Queue Item Example (Offline Delivery)

```javascript
{
  id: 'uuid-123',
  deliveryId: 'delivery-456',
  timestamp: 1703000000000,
  
  // Delivery details
  status: 'completed',
  proof: {
    images: ['blob:...'],
    bags: ['BAG001', 'BAG002'],
    returnedBags: []
  },
  customerId: 'cust-789',
  customerName: 'John Doe',
  customerPhone: '+1234567890',
  bagIds: ['BAG001', 'BAG002'],
  
  // NEW: Sync tracking
  syncStatus: 'pending',
  retries: 0,
  lastSyncAttempt: null,
  syncError: null
}
```

### Sync Status Map Example (Hook Return)

```javascript
{
  'delivery-456': {
    status: 'pending',
    retries: 0,
    error: null
  },
  'delivery-789': {
    status: 'syncing',
    retries: 0,
    error: null
  },
  'delivery-012': {
    status: 'failed',
    retries: 2,
    error: 'Network timeout'
  }
}
```

## Flow Diagrams

### Offline Completion Flow

```
User completes delivery
         ↓
queueDeliveryUpdate()
  - Saves to IndexedDB
  - syncStatus = 'pending'
  - retries = 0
         ↓
useSyncStatus refreshes
  - Queries getQueueItemsByStatus('pending')
  - Updates UI: shows ⏳ Pending sync
         ↓
User regains connectivity
         ↓
setupAutoSync() triggers
  - Calls syncOfflineData()
  - processDeliveryUpdate() marks 'syncing'
  - UI updates: shows 🔄 Syncing
         ↓
Sync succeeds/fails
  - updateQueueItemSyncStatus('synced' | 'failed')
  - useSyncStatus refreshes
  - UI updates: shows ✅ or ❌
```

### Auto-Retry Flow

```
Sync fails
  - updateQueueItemSyncStatus(id, 'failed', errorMsg)
  - retries incremented
  - lastSyncAttempt = now
         ↓
setupAutoRetry() runs every 10s
  - getQueueItemsByStatus('failed')
  - Checks if retries < MAX_RETRIES
  - Calculates backoff delay
  - Checks if time elapsed since lastSyncAttempt
         ↓
Backoff delay elapsed
  - updateQueueItemSyncStatus(id, 'pending')
  - Calls syncOfflineData() for pending items
         ↓
Retry executes
  - processDeliveryUpdate() runs again
  - Attempts sync again
  - Succeeds: marks 'synced'
  - Fails: marks 'failed' with new retries++
```

### Exponential Backoff Schedule

```
Attempt 1: Retry immediately (on failure)
Attempt 2: Wait 1 second
Attempt 3: Wait 5 seconds
Attempt 4: Wait 30 seconds
Attempt 5: Wait 5 minutes
Attempt 6-10: Wait 10 minutes

If all 10 attempts fail:
- Delivery marked as failed
- Shows: ❌ Failed: [error message]
- Driver can manually click "Retry Sync"
```

## Console Log Examples

### Successful Sync

```
📤 Processing delivery update: delivery-456
🟢 Syncing true 
📤 Sending delivery update to server: { deliveryId: ..., status: ..., hasProof: true }
✅ Delivery update response: { success: true, ... }
✅ Delivery update processed successfully

useSyncStatus hook: Detected sync completion, refreshing...
```

### Failed Sync → Auto-Retry

```
📤 Processing delivery update: delivery-789
❌ Failed to process delivery update: Network timeout
Marked as failed with error: "Network timeout"

⏱️ Auto-retry: Found 1 failed items
⏱️ Auto-retry: Waiting 5s before retry on delivery-789

// After 5 seconds...
🔄 Auto-retry: Retrying delivery-789 (attempt 2)
🔄 Auto-retry: Starting sync for 1 pending items

📤 Processing delivery update: delivery-789
✅ Delivery update response: { success: true, ... }
✅ Delivery update processed successfully
Marked as synced
```

### Max Retries Exceeded

```
⏱️ Auto-retry: Found 2 failed items
⚠️ Auto-retry: Skipping delivery-456 - max retries (10) exceeded
⏱️ Auto-retry: Waiting 10m before retry on delivery-789
```

---

**Reference Guide:** Use this document to understand exactly what code changed and where.
