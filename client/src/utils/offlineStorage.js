/**
 * Offline Storage Utility
 * Handles storing photos and delivery updates in IndexedDB for offline support
 */

const DB_NAME = 'MatterDeliveryOffline';
const DB_VERSION = 2;
const PHOTOS_STORE = 'offlinePhotos';
const QUEUE_STORE = 'syncQueue';

/**
 * Initialize IndexedDB
 */
const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // Create photos store
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        const photoStore = db.createObjectStore(PHOTOS_STORE, { keyPath: 'id', autoIncrement: true });
        photoStore.createIndex('deliveryId', 'deliveryId', { unique: false });
        photoStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Create or upgrade sync queue store
      let queueStore;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        queueStore = db.createObjectStore(QUEUE_STORE, { keyPath: 'id', autoIncrement: true });
        queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        queueStore.createIndex('syncStatus', 'syncStatus', { unique: false });
      } else {
        queueStore = event.currentTarget.transaction.objectStore(QUEUE_STORE);
        // Ensure new index exists
        if (!queueStore.indexNames.contains('syncStatus')) {
          queueStore.createIndex('syncStatus', 'syncStatus', { unique: false });
        }
        // Ensure timestamp index exists (older DBs should already have it)
        if (!queueStore.indexNames.contains('timestamp')) {
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }

        // Migrate existing records: copy legacy status -> syncStatus if missing
        try {
          const migrateRequest = queueStore.openCursor();
          migrateRequest.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
              const value = cursor.value;
              if (value && !value.syncStatus && typeof value.status === 'string') {
                value.syncStatus = value.status;
                cursor.update(value);
              }
              cursor.continue();
            }
          };
        } catch (e) {
          // Best-effort migration; ignore errors
          console.warn('Queue store migration skipped:', e?.message || e);
        }
      }
    };
  });
};

/**
 * Store photo offline
 * @param {string} deliveryId - Delivery ID
 * @param {string} photoDataUrl - Base64 photo data URL
 * @param {string} bagId - Optional bag ID
 * @returns {Promise<number>} Photo ID
 */
export const storePhotoOffline = async (deliveryId, photoDataUrl, bagId = null) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
    const store = transaction.objectStore(PHOTOS_STORE);

    const photo = {
      deliveryId,
      photoDataUrl,
      bagId,
      timestamp: new Date().toISOString(),
      synced: false
    };

    return new Promise((resolve, reject) => {
      const request = store.add(photo);
      request.onsuccess = () => {
        console.log('📸 Photo stored offline, ID:', request.result);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to store photo offline:', error);
    throw error;
  }
};

/**
 * Add delivery update to sync queue
 * @param {object} deliveryUpdate - Delivery update data
 * @returns {Promise<number>} Queue item ID
 */
export const queueDeliveryUpdate = async (deliveryUpdate) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(QUEUE_STORE);

    const queueItem = {
      ...deliveryUpdate,
      timestamp: new Date().toISOString(),
      syncStatus: 'pending', // 'pending' | 'syncing' | 'synced' | 'failed'
      retries: 0,
      lastSyncAttempt: null,
      syncError: null
    };

    return new Promise((resolve, reject) => {
      const request = store.add(queueItem);
      request.onsuccess = () => {
        console.log('📋 Delivery update queued, ID:', request.result);
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to queue delivery update:', error);
    throw error;
  }
};

/**
 * Get all pending photos
 * @returns {Promise<Array>} Array of photos
 */
export const getPendingPhotos = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([PHOTOS_STORE], 'readonly');
    const store = transaction.objectStore(PHOTOS_STORE);
    const index = store.index('timestamp');

    return new Promise((resolve, reject) => {
      const request = index.getAll();
      request.onsuccess = () => {
        const photos = request.result.filter(p => !p.synced);
        console.log('📸 Found pending photos:', photos.length);
        resolve(photos);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get pending photos:', error);
    return [];
  }
};

/**
 * Get all pending sync queue items
 * @returns {Promise<Array>} Array of queue items
 */
export const getPendingSyncQueue = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([QUEUE_STORE], 'readonly');
    const store = transaction.objectStore(QUEUE_STORE);
    let index;
    try {
      index = store.index('syncStatus');
    } catch (e) {
      // Fallback for legacy DBs
      try {
        index = store.index('status');
      } catch {
        throw e; // Re-throw original if no legacy index
      }
    }

    return new Promise((resolve, reject) => {
      const request = index.getAll('pending');
      request.onsuccess = () => {
        const pending = request.result || [];
        console.log('📋 Found pending sync items:', pending.length);
        resolve(pending);
      };
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error('Failed to get pending sync queue:', error);
    return [];
  }
};

/**
 * Mark photo as synced
 * @param {number} photoId - Photo ID
 */
export const markPhotoSynced = async (photoId) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
    const store = transaction.objectStore(PHOTOS_STORE);

    const photo = await new Promise((resolve, reject) => {
      const request = store.get(photoId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (photo) {
      photo.synced = true;
      photo.syncedAt = new Date().toISOString();

      await new Promise((resolve, reject) => {
        const request = store.put(photo);
        request.onsuccess = () => {
          console.log('✅ Photo marked as synced:', photoId);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    }
  } catch (error) {
    console.error('Failed to mark photo as synced:', error);
  }
};

/**
 * Mark queue item as synced
 * @param {number} queueId - Queue item ID
 */
export const markQueueItemSynced = async (queueId) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(QUEUE_STORE);

    const item = await new Promise((resolve, reject) => {
      const request = store.get(queueId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    if (item) {
      item.syncStatus = 'synced';
      item.syncedAt = new Date().toISOString();

      await new Promise((resolve, reject) => {
        const request = store.put(item);
        request.onsuccess = () => {
          console.log('✅ Queue item marked as synced:', queueId);
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    }
  } catch (error) {
    console.error('Failed to mark queue item as synced:', error);
  }
};

/**
 * Delete synced photos older than 7 days
 */
export const cleanupOldPhotos = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([PHOTOS_STORE], 'readwrite');
    const store = transaction.objectStore(PHOTOS_STORE);
    const index = store.index('timestamp');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const request = index.openCursor();
    let deletedCount = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const photo = cursor.value;
        const photoDate = new Date(photo.timestamp);
        
        if (photo.synced && photoDate < sevenDaysAgo) {
          cursor.delete();
          deletedCount++;
        }
        cursor.continue();
      } else {
        console.log(`🧹 Cleaned up ${deletedCount} old photos`);
      }
    };
  } catch (error) {
    console.error('Failed to cleanup old photos:', error);
  }
};

/**
 * Delete synced queue items older than 7 days
 */
export const cleanupOldQueueItems = async () => {
  try {
    const db = await initDB();
    const transaction = db.transaction([QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(QUEUE_STORE);
    const index = store.index('timestamp');

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const request = index.openCursor();
    let deletedCount = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        const item = cursor.value;
        const itemDate = new Date(item.timestamp);
        
        if (item.syncStatus === 'synced' && itemDate < sevenDaysAgo) {
          cursor.delete();
          deletedCount++;
        }
        cursor.continue();
      } else {
        console.log(`🧹 Cleaned up ${deletedCount} old queue items`);
      }
    };
  } catch (error) {
    console.error('Failed to cleanup old queue items:', error);
  }
};

/**
 * Get total count of pending items
 * @returns {Promise<{photos: number, queue: number}>}
 */
export const getPendingCount = async () => {
  try {
    const [photos, queue] = await Promise.all([
      getPendingPhotos(),
      getPendingSyncQueue()
    ]);

    return {
      photos: photos.length,
      queue: queue.length,
      total: photos.length + queue.length
    };
  } catch (error) {
    console.error('Failed to get pending count:', error);
    return { photos: 0, queue: 0, total: 0 };
  }
};

/**
 * Update sync status of a queue item
 * @param {number} id - Queue item ID
 * @param {string} syncStatus - 'pending', 'syncing', 'synced', 'failed'
 * @param {string} errorMsg - Optional error message
 * @returns {Promise<void>}
 */
export const updateQueueItemSyncStatus = async (id, syncStatus, errorMsg = null) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([QUEUE_STORE], 'readwrite');
    const store = transaction.objectStore(QUEUE_STORE);

    return new Promise((resolve, reject) => {
      const getRequest = store.get(id);
      
      getRequest.onsuccess = () => {
        const item = getRequest.result;
        if (item) {
          item.syncStatus = syncStatus;
          item.lastSyncAttempt = new Date().toISOString();
          if (errorMsg) item.syncError = errorMsg;
          if (syncStatus === 'failed') item.retries = (item.retries || 0) + 1;
          
          const updateRequest = store.put(item);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          reject(new Error('Queue item not found'));
        }
      };
      
      getRequest.onerror = () => reject(getRequest.error);
    });
  } catch (error) {
    console.error('Failed to update queue item sync status:', error);
    throw error;
  }
};

/**
 * Get queue items by sync status
 * @param {string} syncStatus - 'pending', 'syncing', 'synced', 'failed'
 * @returns {Promise<Array>}
 */
export const getQueueItemsByStatus = async (syncStatus) => {
  try {
    const db = await initDB();
    const transaction = db.transaction([QUEUE_STORE], 'readonly');
    const store = transaction.objectStore(QUEUE_STORE);
    const index = store.index('syncStatus');

    return new Promise((resolve, reject) => {
      const request = index.getAll(syncStatus);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (error) {
    console.error(`Failed to get queue items with status ${syncStatus}:`, error);
    return [];
  }
};
