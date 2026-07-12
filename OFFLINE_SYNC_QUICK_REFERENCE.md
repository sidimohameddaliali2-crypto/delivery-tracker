# Offline Sync - Quick Reference Card for Drivers

## Status Indicators (on each delivery card)

| Icon | Color | Meaning | What to Do |
|------|-------|---------|-----------|
| ⏳ | Yellow | Pending sync | Nothing - will sync automatically |
| 🔄 | Blue | Syncing... | Wait a moment, connection uploading |
| ✅ | Green | Synced | Complete! Saved on server |
| ❌ | Red | Failed | Click "Retry Sync" or move to better signal |

## Main Scenarios

### ✅ Perfect Scenario
```
Building (no internet):
  Complete delivery → ⏳ Pending

Leave building:
  Phone reconnects → 🔄 Syncing → ✅ Synced
  
Result: No action needed, all automatic
```

### ❌ Problem Scenario
```
Building (no internet):
  Complete delivery → ⏳ Pending

Leave building:
  Network issue → 🔄 Syncing → ❌ Failed

Your options:
  1. Move to better signal → Auto-retry starts
  2. Click "Retry Sync" button → Immediate retry
  3. Wait 5+ seconds → Auto-retry kicks in
  
Result: Delivery will sync (with or without action)
```

## Quick Tips

### Before You Start Deliveries
- ✅ Make sure your phone is charged
- ✅ Check you have app installed and updated
- ✅ Note buildings with known poor signal

### During Deliveries
- ✅ Don't worry about internet in buildings
- ✅ Complete deliveries normally
- ✅ Use offline mode features if needed
- ✅ Watch for ✅ Synced status when back outside

### If Something Goes Wrong
- ❌ Delivery shows "Failed"?
  → Check signal strength (bars in status bar)
  → Click "Retry Sync"
  → Move closer to window/door
  → Check sync status at end of route

## Status Summary Box

At top of deliveries, you'll see:
```
🔄 Syncing offline deliveries...
2 pending, 1 syncing, 1 failed
```

This means:
- 2 deliveries waiting to sync (⏳)
- 1 currently syncing (🔄)
- 1 had problem (❌)
- **Total:** Nothing for you to do yet, system handles it

If you see "2 pending, 0 syncing, 0 failed" → All synced! ✅

## Troubleshooting

**Q: Delivery stuck on ⏳ for too long?**
A: Move to area with better signal (outside), app will auto-retry

**Q: ❌ Failed - what should I do?**
A: Click "Retry Sync" button, or move to better signal and wait

**Q: Should I turn off app/phone?**
A: No, let it keep running. Sync happens automatically when you reconnect

**Q: Can I turn off internet while completing?**
A: Yes! Airplane mode is fine. App saves everything. Just reconnect after.

**Q: Is my completion safe if I turn off phone?**
A: Yes! Saved on phone. Syncs when you turn it back on and reconnect.

**Q: What if I deliver in many buildings without internet?**
A: No problem! App saves all of them. They'll all sync when you're back outside.

**Q: Will I lose any completions?**
A: No. System keeps retrying automatically up to 10 times.

## Visual Guide

### Delivery Card (Example)

```
┌──────────────────────────────────────────┐
│ John Doe          [Company] ✅ Synced    │  ← Status here
│ 2:30 PM                                  │
├──────────────────────────────────────────┤
│ 📍 123 Main St, Apt 4B                   │
├──────────────────────────────────────────┤
│ [Call]        [Start Delivery]           │
│               [Retry Sync]               │  ← If failed
└──────────────────────────────────────────┘
```

### At Top of List

```
🔄 Syncing offline deliveries...
1 pending, 0 syncing, 0 failed
```

```
✅ All synced
(no box shown if nothing to sync)
```

## Key Reminders

✅ **Offline delivery is NORMAL** - Designed to work this way
✅ **Automatic = No action needed** - You don't have to do anything
✅ **Status shows real-time** - Updates as sync happens
✅ **Failures are temporary** - Auto-retry keeps trying
✅ **Manual retry always available** - One-click if you want to speed up

## When to Contact Support

📞 Contact your manager if:
- Delivery stuck ❌ Failed after 10+ attempts
- Sync status not updating after 5 minutes
- Same delivery failing repeatedly
- Getting unusual error messages
- Sync eating up too much battery

**Provide them with:**
- Delivery ID
- Error message (screenshot)
- Your location/network type
- Phone model and OS

---

**Remember:** Just complete your deliveries like normal. The system automatically saves everything and syncs when you get back to your bike. You'll see green ✅ checkmarks when everything is synced.

**No action needed for 99% of cases!** 🎯
