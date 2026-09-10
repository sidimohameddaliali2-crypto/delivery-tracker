# Google Sheet delivery sync

Mirrors every delivery into a Google Sheet as **one row per delivery**, updated
in place as the delivery moves through its lifecycle:

| When | What lands in the sheet |
| --- | --- |
| Delivery uploaded (single **or** bulk import) | A new row: customer, company, address, zone, scheduled time, driver, status |
| Dispatcher edits or assigns a driver | The same row is refreshed |
| Driver marks it delivered / collected | The same row gets **Delivered Time**, **Late (min)**, **Early (min)**, **Timing** (early / on-time / late), **Proof Photo**, **GPS Link** |

The sheet upserts by **Delivery ID** (column A), so a delivery is never
duplicated no matter how many events it goes through.

It is a no-op until `GOOGLE_SHEET_WEBHOOK_URL` is set — nothing changes for
existing deployments until you configure it.

## One-time setup

### 1. Create the sheet + script

1. Create a new Google Sheet (any name).
2. **Extensions ▸ Apps Script**. Delete the sample code, paste the contents of
   [`docs/google-sheet-sync.gs`](./google-sheet-sync.gs), and **Save**.
3. *(optional but recommended)* Set a shared secret: **Project Settings ▸ Script
   properties ▸ Add script property**
   - Property: `SHEET_SYNC_SECRET`
   - Value: any random string (keep it)
4. **Deploy ▸ New deployment ▸** gear icon ▸ **Web app**
   - Description: `Matter delivery sync`
   - **Execute as:** Me
   - **Who has access:** Anyone
   - **Deploy**, authorize when prompted, and copy the **Web app URL** (ends in
     `/exec`).

### 2. Point the server at it

Add to the server `.env` (then `pm2 restart matter-d`):

```
GOOGLE_SHEET_WEBHOOK_URL=https://script.google.com/macros/s/AKfyc.../exec
GOOGLE_SHEET_WEBHOOK_SECRET=the-same-random-string-as-step-3   # omit if you skipped it
```

That's it. Upload a delivery and a row appears; mark one delivered and its row
fills in.

## Optional `.env` knobs

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_SHEET_WEBHOOK_URL` | — | Apps Script `/exec` URL. **Sync is off when unset.** |
| `GOOGLE_SHEET_WEBHOOK_SECRET` | — | Shared secret; must match the script property `SHEET_SYNC_SECRET`. |
| `GOOGLE_SHEET_WEBHOOK_TIMEOUT_MS` | `8000` | Per-request timeout. |
| `GOOGLE_SHEET_WEBHOOK_BATCH_SIZE` | `150` | Rows per POST for bulk uploads. |
| `SHEET_SYNC_DEBUG` | — | Set to `1` to log every successful sync. |
| `LOCAL_TIMEZONE_OFFSET_MINUTES` | `0` | Already used app-wide; sheet timestamps are written in this local time as `YYYY-MM-DD HH:mm`. |

## How it works

- `server/services/googleSheetSync.js` builds a flat row from a delivery and
  POSTs `{ secret, event, delivery }` (or `{ ..., deliveries: [...] }` for bulk)
  to the Apps Script.
- It is **fire-and-forget**: a failed POST is logged (`[sheet-sync] ... failed`)
  and swallowed — the sheet can never block or fail a delivery request.
- Call sites in `server/routes/deliveries.js`: create (`POST /`), bulk
  (`POST /bulk`), dispatcher edit (`PUT /:id`), driver assign
  (`PATCH /assign-driver`), collect (`POST /:id/collect`), complete
  (`POST /:id/complete`), status change (`PATCH /:id/status`).
- **Timing** is recomputed from `scheduledTime` vs `deliveredTime` with the same
  3-hour early threshold the rest of the app uses, so it's correct even if the
  persisted `lateMinutes`/`earlyMinutes` were never written.

## Backfilling / re-syncing

There's no bulk backfill endpoint. To seed the sheet with existing deliveries,
re-save them (any edit via the dispatcher UI re-fires the sync), or add a
one-off script that loads deliveries and calls `syncDeliveryToSheet`.
