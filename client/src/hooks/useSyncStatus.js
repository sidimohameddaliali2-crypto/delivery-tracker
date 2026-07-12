import { useState, useEffect, useCallback } from 'react';
import { getQueueItemsByStatus } from '../utils/offlineStorage';
import { onSyncStatusChange } from '../utils/offlineSync';

/**
 * Hook to track sync status of pending deliveries
 * Returns object mapping deliveryId to syncStatus
 */
export const useSyncStatus = () => {
  const [syncStatus, setSyncStatus] = useState({});
  const [isSyncing, setIsSyncing] = useState(false);

  // Refresh sync status from IndexedDB
  const refreshSyncStatus = useCallback(async () => {
    try {
      const [pending, syncing, failed] = await Promise.all([
        getQueueItemsByStatus('pending'),
        getQueueItemsByStatus('syncing'),
        getQueueItemsByStatus('failed')
      ]);

      const newStatus = {};
      
      // Map pending items
      pending.forEach(item => {
        newStatus[item.deliveryId] = {
          status: 'pending',
          retries: item.retries || 0,
          error: null
        };
      });

      // Map syncing items
      syncing.forEach(item => {
        newStatus[item.deliveryId] = {
          status: 'syncing',
          retries: item.retries || 0,
          error: null
        };
      });

      // Map failed items with error message
      failed.forEach(item => {
        newStatus[item.deliveryId] = {
          status: 'failed',
          retries: item.retries || 0,
          error: item.syncError || 'Unknown error'
        };
      });

      setSyncStatus(newStatus);
    } catch (error) {
      console.error('Failed to refresh sync status:', error);
    }
  }, []);

  // Initial load and setup listeners
  useEffect(() => {
    // Load initial status
    refreshSyncStatus();

    // Subscribe to sync status changes
    const unsubscribe = onSyncStatusChange((status) => {
      if (status.syncing !== undefined) {
        setIsSyncing(status.syncing);
      }
      // Refresh status when sync starts or completes
      if (status.syncing === false || status.completed) {
        setTimeout(() => {
          refreshSyncStatus();
        }, 500); // Wait a bit for IndexedDB updates
      }
    });

    // Set up periodic refresh (every 2 seconds while syncing)
    const refreshInterval = setInterval(() => {
      refreshSyncStatus();
    }, 2000);

    return () => {
      unsubscribe();
      clearInterval(refreshInterval);
    };
  }, [refreshSyncStatus]);

  return {
    syncStatus,
    isSyncing,
    refreshSyncStatus
  };
};

/**
 * Get visual indicator for sync status
 */
export const getSyncStatusIndicator = (status) => {
  switch (status?.status) {
    case 'pending':
      return { icon: '⏳', label: 'Pending sync', color: '#fbbf24' };
    case 'syncing':
      return { icon: '🔄', label: 'Syncing...', color: '#60a5fa' };
    case 'synced':
      return { icon: '✅', label: 'Synced', color: '#10b981' };
    case 'failed':
      return { icon: '❌', label: `Failed: ${status.error || 'Unknown error'}`, color: '#ef4444' };
    default:
      return { icon: '•', label: 'Unknown', color: '#6b7280' };
  }
};
