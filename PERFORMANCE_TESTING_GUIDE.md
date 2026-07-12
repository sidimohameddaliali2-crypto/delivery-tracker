# QR Scanning Performance Testing Guide

## Quick Test Plan

### Pre-Test Checklist
- [ ] Latest code deployed to client
- [ ] StoreKeeper page loads without errors
- [ ] QR scanner permission granted
- [ ] Browser DevTools open (F12)
- [ ] Performance tab ready to record

---

## Test 1: Rapid Sequential Scanning (5 bags)

**Setup**:
1. Navigate to Store Keeper page
2. Click "Start Assignment" 
3. Select a company
4. Have 5 bags ready

**Steps**:
1. Scan bag 1 - observe page responsiveness
2. Scan bag 2 - check for lag
3. Scan bag 3 - THIS IS WHERE PREVIOUS SLOWDOWN STARTED
4. Scan bag 4 - should still be responsive
5. Scan bag 5 - verify no visible glitching

**Expected Results** ✅:
- All 5 bags assigned successfully
- Page remains responsive throughout
- No visible lag or glitching
- Success sound plays for each assignment
- "Assigning to [Company]" section shows all 5 bags

**Watch for** ❌:
- Delayed button responses
- Janky camera feed
- UI lag after 3rd scan
- Console errors

---

## Test 2: Extended Session (15+ bags)

**Setup**:
1. Have 15+ bags available
2. Open Chrome DevTools → Performance tab
3. Click "Record"

**Steps**:
1. Start assignment session
2. Scan 15 bags continuously
3. Complete session
4. Stop performance recording

**Expected Results** ✅:
- All 15 bags assigned
- Performance timeline shows consistent frame rate
- No major dips in FPS after ~3rd bag
- Main thread not blocked

**Metrics to Check**:
- FPS: Should stay 30+ (60 ideal)
- Main thread: Should not spike > 5ms per task
- Memory: Should not jump > 10MB over scan sequence

---

## Test 3: Memory Leak Detection

**Setup**:
1. Open Chrome DevTools → Memory tab
2. Take initial heap snapshot

**Steps**:
1. Complete 3 full assignment sessions (5 bags each)
2. Click "Done" after each session
3. Take heap snapshot after each session

**Expected Results** ✅:
- Heap size after session 1: ~X MB
- Heap size after session 2: ~X MB (same or slightly higher)
- Heap size after session 3: ~X MB (consistent, not growing)
- No accumulating timeout objects

**Watch for** ❌:
- Heap growing 20%+ per session
- Accumulating Timer objects in detached DOM
- Growing arrays in closure scope

---

## Test 4: Duplicate Prevention (Still Working)

**Setup**:
1. Start assignment session
2. Have 3 bags ready

**Steps**:
1. Scan bag 1 → Should succeed
2. Quickly scan bag 1 again (within 2 seconds) → Should show "already scanned" message
3. Wait 3+ seconds
4. Scan bag 1 again → Should show "was just assigned, wait a moment"
5. Scan bag 2 → Should succeed

**Expected Results** ✅:
- First bag 1 scan: ✓ Assigned
- Second bag 1 scan: ⚠ "already scanned in this session"
- Third bag 1 scan: ⚠ "was just assigned, wait a moment"
- Bag 2: ✓ Assigned successfully
- **Total in assignment list: Only 2 bags** (not 3)

**This ensures duplicate prevention is still working**

---

## Test 5: Error State Handling

**Setup**:
1. Start assignment session
2. Have bags with mixed statuses

**Steps**:
1. Scan a bag that's already assigned (mode: Assign) → Should show error
2. Immediately scan another bag → Should work normally
3. Switch to Return mode
4. Scan a bag that's available (not assigned) → Should show error
5. Scan an assigned bag → Should work

**Expected Results** ✅:
- Error messages appear immediately
- Page doesn't slow down on errors
- Can resume scanning after error
- No state corruption

---

## Test 6: Long Duration Session (30+ scans)

**Setup**:
1. Have 30+ available bags
2. Open DevTools → Memory tab
3. Take initial snapshot

**Steps**:
1. Start assignment session
2. Scan 30 bags continuously (or until manual completion)
3. Take heap snapshot periodically
4. End session

**Expected Results** ✅:
- All scans responsive to scan #30
- No visible slowdown after 10th, 20th, 30th scans
- Memory growth linear, not exponential
- Message display remains smooth
- Can end session without errors

**Red Flags** 🚩:
- Progressive slowdown
- Memory spikes > 50MB
- Timeout accumulation in DevTools
- Locked bags not being released

---

## Debugging Checklist (If Issues Occur)

### If page slows down after N scans:
```javascript
// In browser console:
console.log('Locked bags:', document.querySelector('iframe')?.contentDocument?.defaultView?.lockedBagsRef?.current?.size);
console.log('Pending timeouts:', performance.getEntriesByType('mark').filter(m => m.name.includes('timeout')).length);
```

### If duplicate assignments happen:
- Check lock Map is being populated
- Verify `acquireBagLock()` returns false on conflict
- Check Redux state for duplicate bag entries

### If memory keeps growing:
- Check DevTools Memory tab for detached DOM
- Look for accumulating closures
- Verify useEffect cleanup is running

---

## Expected Improvements Over Previous Build

| Scenario | Before | After | Evidence |
|----------|--------|-------|----------|
| Scan speed at #3 | Noticeable lag | No lag | Consistent frame rate |
| Page responsiveness | Degrades after #5 | Consistent throughout | UI remains interactive |
| Memory after 30 scans | 50+ MB growth | <10 MB growth | DevTools Memory tab |
| Session reset time | 2-3 seconds | <500ms | Immediate readiness |
| Lock accumulation | Grows indefinitely | Stays constant | DevTools Console |

---

## Final Sign-Off Checklist

After completing all tests, verify:

- [ ] Can scan 30+ bags without slowdown
- [ ] Duplicate prevention still works correctly
- [ ] Memory stays stable over long sessions  
- [ ] No console errors during scanning
- [ ] Session cleanup is fast
- [ ] Lock Map doesn't grow infinitely
- [ ] Error handling doesn't cause lag
- [ ] Can perform 5+ sessions without degradation

**When all checks pass** ✅: **Performance issue is RESOLVED**
