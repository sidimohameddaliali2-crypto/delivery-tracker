# DriverMobile.js State Migration Guide

## State Variable Mapping

### Old State → New Grouped State

Replace all instances throughout the file (4030 lines):

#### Flow State Group (`flowState`)
- `showReturnFlow` → `flowState.showReturnFlow`
- `showBagReturnFlow` → `flowState.showBagReturnFlow`
- `isBagCollectionFlow` → `flowState.isBagCollectionFlow`
- `showReturnBagsQuestion` → `flowState.showReturnBagsQuestion`
- `isReturningBags` → `flowState.isReturningBags`
- `setShowReturnFlow` → `setFlowState(prev => ({ ...prev, showReturnFlow: value }))`

#### Bag State Group (`bagState`)
- `scannedBagId` → `bagState.scannedBagId`
- `scannedBags` → `bagState.scannedBags`
- `returnedBags` → `bagState.returnedBags`
- `bagCollectionScans` → `bagState.collectionScans`
- `bagsToReturn` → `bagState.toReturn`
- `qrSkipped` → `bagState.qrSkipped`
- `setScannedBags` → `setBagState(prev => ({ ...prev, scannedBags: value }))`

#### Camera State Group (`cameraState`)
- `cameraFacingMode` → `cameraState.facingMode`
- `flashSupported` → `cameraState.flashSupported`
- `flashOn` → `cameraState.flashOn`
- `cameraSupport` → `cameraState.support`
- `capturedPhoto` → `cameraState.capturedPhoto`
- `bagReturnPhoto` → `cameraState.bagReturnPhoto`
- `setFlashOn` → `setCameraState(prev => ({ ...prev, flashOn: value }))`

#### Feedback State Group (`feedback`)
- `scanError` → `feedback.scanError`
- `scanSuccess` → `feedback.scanSuccess`
- `isUploading` → `feedback.isUploading`
- `setScanError` → `setFeedback(prev => ({ ...prev, scanError: value }))`
- `setScanSuccess` → `setFeedback(prev => ({ ...prev, scanSuccess: value }))`

#### Filter State Group (`filterState`)
- `searchTerm` → `filterState.searchTerm`
- `selectedLetter` → `filterState.selectedLetter`
- `sortAlphabetical` → `filterState.sortAlphabetical`
- `showAlphabetFilter` → `filterState.showAlphabetFilter`
- `setSearchTerm` → `setFilterState(prev => ({ ...prev, searchTerm: value }))`

#### Return State Group (`returnState`)
- `returnReason` → `returnState.reason`
- `returnNotes` → `returnState.notes`
- `setReturnReason` → `setReturnState(prev => ({ ...prev, reason: value }))`

#### History State Group (`historyState`)
- `historyPeriod` → `historyState.period`
- `historyDeliveries` → `historyState.deliveries`
- `loadingHistory` → `historyState.loading`
- `setHistoryPeriod` → `setHistoryState(prev => ({ ...prev, period: value }))`

#### Offline State Group (`offlineState`)
- `isOnline` → `offlineState.isOnline`
- `offlineQueue` → `offlineState.queue`
- `syncStatus` → `offlineState.syncStatus`
- `setIsOnline` → `setOfflineState(prev => ({ ...prev, isOnline: value }))`

## Performance Benefits

1. **Reduced Re-renders**: Grouped state reduces the number of state update calls
2. **Better Memoization**: Related data changes together, improving useMemo/useCallback dependencies
3. **Clearer Code**: Logical groupings make the code more maintainable
4. **Optimized Filtering**: Multi-stage memoization prevents unnecessary recalculations

## Next Steps

Due to the file size (4030 lines), completing this migration requires:
1. Systematic find/replace for each state variable
2. Update all setter calls to use object spread syntax
3. Update all useEffect dependencies
4. Test each flow (delivery, scanning, camera, returns, offline sync)

**Estimated time**: 2-3 hours for complete migration and testing
