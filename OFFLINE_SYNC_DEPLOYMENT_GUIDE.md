# Offline Sync - Deployment Guide

## Pre-Deployment Verification

### Step 1: Code Review
- [ ] Review all code changes in [OFFLINE_SYNC_CODE_CHANGES.md](OFFLINE_SYNC_CODE_CHANGES.md)
- [ ] Verify no console errors from modified files
- [ ] Check imports are correct in all files
- [ ] Verify file paths are correct for your project structure

### Step 2: Build Verification
```bash
cd client
npm run build
```
- [ ] Build completes without errors
- [ ] Check output size: main.js should be similar to before
- [ ] No new warnings in console

### Step 3: Local Testing

#### Test 1: Offline Completion Flow
```
1. Open DevTools → Application → IndexedDB
2. Find matter_tracker database → QUEUE_STORE
3. Enable airplane mode
4. Complete a test delivery in driver mobile
5. Take screenshot of QUEUE_STORE - should show:
   - New entry with syncStatus: 'pending'
   - retries: 0
   - lastSyncAttempt: null
6. Delivery card should show: ⏳ Pending sync
7. Disable airplane mode
8. Watch status change to: 🔄 Syncing...
9. After sync completes: ✅ Synced
10. Check QUEUE_STORE - item syncStatus should be 'synced'
```

#### Test 2: Auto-Retry Flow
```
1. In DevTools → Network tab
2. Filter to 'deliveries' API calls
3. Find the PATCH /deliveries/{id}/status request
4. Right-click → Edit and Replay
5. Modify to return 500 error (or throttle network to fail)
6. Complete delivery offline
7. Come online and watch sync attempt to fail
8. Delivery shows: ❌ Failed: [error]
9. Wait 10+ seconds
10. Watch auto-retry kick in (new API request appears)
11. Status should change back to 🔄 Syncing
12. If you fixed the mock error, should sync successfully
```

#### Test 3: Manual Retry Button
```
1. Create a failed delivery (see Test 2)
2. Delivery shows: ❌ Failed
3. Click "Retry Sync" button
4. Status immediately changes to: 🔄 Syncing
5. Check network tab for new API request
6. If network is up, should sync successfully
7. Status changes to: ✅ Synced
```

#### Test 4: Sync Status Hook
```
1. Open DevTools Console
2. Import the hook: 
   const hook = require('./hooks/useSyncStatus')
3. Create a complete offline delivery
4. Check hook's syncStatus object
5. Should contain: {deliveryId: {status: 'pending', retries: 0, error: null}}
6. Come online
7. Watch status change to 'syncing' then 'synced'
```

#### Test 5: Large Batch Test
```
1. Complete 10-20 deliveries offline
2. Check IndexedDB QUEUE_STORE
3. Should show all 10-20 items with syncStatus: 'pending'
4. Come online
5. Watch all syncs execute
6. Monitor memory in DevTools (should stay <50MB)
7. Monitor CPU (should be <10%)
8. All should sync successfully
```

### Step 4: Device Testing

#### On Low-End Android Phone (Typical Driver Device)
```
1. Deploy to staging environment
2. Open app on old phone (2GB RAM, Android 8.0+)
3. Complete delivery offline
4. Check that UI updates smoothly
5. Check app doesn't crash
6. Come online
7. Verify sync completes without errors
8. Check battery drain is minimal
9. Monitor network requests complete
```

#### On iPhone
```
1. Test on iOS 12+ device
2. Enable offline mode (Settings → Airplane Mode)
3. Complete delivery
4. Disable airplane mode
5. Verify auto-sync works
6. Check status indicators display correctly
```

### Step 5: Performance Testing

```bash
# In browser DevTools Performance tab:

1. Record performance while completing delivery offline
   - Should see minimal CPU usage (<5%)
   
2. Record during sync:
   - Should complete within 30 seconds
   
3. Record 10 deliveries syncing:
   - Should still be responsive
   - No frame drops visible

4. Memory tab:
   - IndexedDB size should be <10MB
   - No memory leaks over time
```

## Staging Deployment

### Prerequisites
- [ ] Code merged to main branch
- [ ] Build created and tested
- [ ] No new errors in console
- [ ] All manual tests passed

### Deployment Steps

```bash
# 1. Build production bundle
cd client
npm run build

# 2. Copy build to staging server
# (Depends on your deployment process)

# 3. Deploy to staging frontend
# (Instructions depend on your hosting - DigitalOcean, etc.)

# 4. Test complete flow on staging
# - Log in with test driver account
# - Complete test deliveries
# - Verify sync works
# - Monitor API responses
```

### Staging Validation

```
✅ App loads without errors
✅ No console errors on startup
✅ Driver can complete deliveries
✅ Offline completion saves to IndexedDB
✅ Sync executes when online
✅ Status indicators update
✅ Failed syncs retry automatically
✅ No API errors on staging backend
✅ Network requests complete successfully
✅ Memory usage stays reasonable
```

## Production Deployment

### Pre-Production Checklist
- [ ] All staging tests passed
- [ ] All browser types tested (Chrome, Firefox, Safari)
- [ ] All device types tested (Android, iOS, tablet)
- [ ] Low-end device performance acceptable
- [ ] Slow network conditions tested
- [ ] Error scenarios handled correctly
- [ ] No reported issues from testing phase

### Deployment Process

1. **Backup Current Production**
   ```bash
   # Create backup of current bundle
   cp -r client/build client/build.backup.$(date +%s)
   ```

2. **Deploy New Build**
   ```bash
   # Follow your normal deployment process
   # Build → Upload → Deploy
   ```

3. **Verify Deployment**
   ```
   - Open app in browser
   - Check for console errors
   - Complete test delivery
   - Verify sync works
   - Check all status indicators
   ```

4. **Monitor for Issues**
   - Check server logs for errors
   - Monitor API response times
   - Track sync success rates
   - Monitor for crashes/errors from drivers

### Rollback Plan (if needed)

```bash
# If critical issues discovered:

# 1. Identify issue in logs/monitoring
# 2. Restore from backup
cp -r client/build.backup.latest client/build
# 3. Re-deploy previous version
# 4. Notify drivers of issue
# 5. Fix issue and create new build
# 6. Schedule re-deployment
```

## Post-Deployment Monitoring

### Metrics to Track (First 24 Hours)

| Metric | Target | Alert If |
|--------|--------|----------|
| Sync Success Rate | >99% | <95% |
| Auto-Retry Rate | ~5% | >20% |
| Avg Time to Sync | <2 min | >5 min |
| Max Retries Hit | ~0% | >1% |
| API Error Rate | ~0.1% | >1% |
| Memory Usage | <50MB | >100MB |
| CPU Usage | <10% | >30% |

### Monitoring Commands

```javascript
// Monitor sync success rate
getQueueItemsByStatus('synced').length / 
(getQueueItemsByStatus('synced').length + getQueueItemsByStatus('failed').length)

// Check max retries exceeded
getQueueItemsByStatus('failed').filter(item => item.retries >= 10).length

// Monitor average time to sync
(synced items) → (lastSyncAttempt - timestamp)
```

### User Monitoring

```
Check with drivers:
- Are status indicators clear?
- Are syncs completing successfully?
- Is battery impact noticeable?
- Any unexpected crashes?
- Is offline completion working?
```

## Training Materials

### For Drivers

1. **How to Use Offline Sync**
   - Show status indicators (⏳ ❌ 🔄 ✅)
   - Explain when to expect each status
   - Show "Retry Sync" button

2. **Common Scenarios**
   - Building without internet → Status shows ⏳
   - Walk outside → Status shows 🔄 then ✅
   - Network error → Status shows ❌, auto-retry happens
   - Retry button → For manual retry if desired

3. **What NOT to Do**
   - Don't turn off app during sync
   - Don't try to complete delivery again if showing ⏳
   - Don't force-close app if sync in progress

### For Managers/Dispatchers

1. **What Changed**
   - Drivers can now complete offline deliveries
   - Deliveries show sync status
   - No action needed for most cases

2. **What to Monitor**
   - Sync success rates in reports
   - Any failed deliveries at end of day
   - Driver complaints about offline issues

3. **What to Tell Drivers**
   - Complete deliveries normally, even offline
   - Status shows what's happening
   - Sync happens automatically
   - Report any ❌ failed items that don't auto-recover

## Support Plan

### For Drivers
- [ ] User guide available: [OFFLINE_SYNC_DRIVER_GUIDE.md](OFFLINE_SYNC_DRIVER_GUIDE.md)
- [ ] Quick reference card printed: [OFFLINE_SYNC_QUICK_REFERENCE.md](OFFLINE_SYNC_QUICK_REFERENCE.md)
- [ ] Manager training completed
- [ ] Support contact information distributed

### For Managers
- [ ] Technical documentation available: [OFFLINE_SYNC_TECHNICAL.md](OFFLINE_SYNC_TECHNICAL.md)
- [ ] Troubleshooting guide shared
- [ ] Escalation procedures defined
- [ ] Support contact information available

### For Developers
- [ ] Technical docs available: [OFFLINE_SYNC_TECHNICAL.md](OFFLINE_SYNC_TECHNICAL.md)
- [ ] Code reference available: [OFFLINE_SYNC_CODE_CHANGES.md](OFFLINE_SYNC_CODE_CHANGES.md)
- [ ] On-call support plan in place
- [ ] Issue tracking system configured

## Success Criteria

### Day 1-7
- ✅ No critical errors or crashes
- ✅ Sync success rate >98%
- ✅ Positive driver feedback
- ✅ No unusual API errors
- ✅ Memory usage stable

### Week 2-4
- ✅ Sync success rate >99%
- ✅ Auto-retry handles most failures
- ✅ <1% require manual intervention
- ✅ No reported data loss
- ✅ System stable under normal load

### Week 4+
- ✅ Production ready with full confidence
- ✅ Can enable by default for all drivers
- ✅ Minimal ongoing support needed
- ✅ Happy drivers completing offline deliveries

## Communication Timeline

### T-1 Day Before Deployment
```
Send message to drivers:
"Tomorrow we're deploying new offline delivery features.
Deliveries will show sync status (⏳ 🔄 ✅ ❌).
No changes to how you work - everything is automatic!"
```

### Day of Deployment
```
- Deploy in morning (low traffic time)
- Monitor closely for first hour
- Have support team on standby
- Watch for error spikes
```

### T+1 Hour
```
Check with first drivers using app:
- Any errors or crashes?
- Status indicators showing?
- Sync completing?
```

### T+24 Hours
```
Review metrics:
- Sync success rate
- Any failed deliveries
- Driver feedback
- System performance
```

## Rollback Criteria

Consider rollback if:
- Sync success rate drops below 90%
- Frequent crashes reported
- Major API errors occurring
- Data loss suspected
- Performance severely degraded

**Rollback decision:** Can be made by tech lead within 2 hours

---

## Deployment Checklist

### Pre-Deployment
- [ ] Code reviewed and approved
- [ ] Build created and tested locally
- [ ] All unit tests passing
- [ ] No console errors
- [ ] No linting warnings
- [ ] Device testing completed
- [ ] Performance testing done
- [ ] Staging tests passed
- [ ] Rollback plan ready
- [ ] Communication drafted

### Deployment
- [ ] Backup created
- [ ] Build uploaded
- [ ] Deployment executed
- [ ] Smoke tests passed
- [ ] Monitoring active
- [ ] Team alerted

### Post-Deployment
- [ ] Metrics monitored (24hr)
- [ ] User feedback collected
- [ ] Issues documented
- [ ] Success confirmed
- [ ] Documentation updated
- [ ] Team debriefing scheduled

---

**Status:** Ready for Deployment
**Last Updated:** [Today]
**Contact:** [Development Lead]

For questions, see:
- [OFFLINE_SYNC_README.md](OFFLINE_SYNC_README.md) - Overview
- [OFFLINE_SYNC_TECHNICAL.md](OFFLINE_SYNC_TECHNICAL.md) - Technical details
- [OFFLINE_SYNC_CHECKLIST.md](OFFLINE_SYNC_CHECKLIST.md) - Implementation checklist
