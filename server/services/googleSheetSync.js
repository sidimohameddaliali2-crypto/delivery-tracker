import axios from 'axios';

// Mirror every delivery into a Google Sheet as ONE row that is updated in
// place as the delivery moves through its lifecycle:
//
//   uploaded (single or bulk)  ->  row created / refreshed
//   dispatcher edits / assigns ->  same row updated
//   driver delivers            ->  same row gets delivered time, proof,
//                                  and the early / on-time / late verdict
//
// Transport is a Google Apps Script web app bound to the target sheet
// (see docs/GOOGLE_SHEET_SYNC.md + docs/google-sheet-sync.gs). Put its
// published /exec URL in GOOGLE_SHEET_WEBHOOK_URL. The script upserts by
// "Delivery ID" (column A), so re-sending a delivery never duplicates it.
//
// Fire-and-forget by design: a build error or a failed POST is logged and
// swallowed. Sheet trouble must never block or fail a delivery request.

const WEBHOOK_URL = process.env.GOOGLE_SHEET_WEBHOOK_URL || '';
const WEBHOOK_SECRET = process.env.GOOGLE_SHEET_WEBHOOK_SECRET || '';
const TIMEOUT_MS = Number.parseInt(process.env.GOOGLE_SHEET_WEBHOOK_TIMEOUT_MS || '8000', 10);
// Chunk large bulk uploads so a single POST stays well inside Apps Script's
// request-size and execution-time limits.
const BATCH_SIZE = Number.parseInt(process.env.GOOGLE_SHEET_WEBHOOK_BATCH_SIZE || '150', 10);

const LOCAL_TZ_OFFSET_MINUTES = Number.parseInt(
  process.env.LOCAL_TIMEZONE_OFFSET_MINUTES || process.env.BUSINESS_TZ_OFFSET_MINUTES || '0',
  10
);
const LOCAL_TZ_OFFSET_MS = LOCAL_TZ_OFFSET_MINUTES * 60 * 1000;

export const isSheetSyncEnabled = () => Boolean(WEBHOOK_URL);

// "YYYY-MM-DD HH:mm" in the configured local timezone (matches the
// formatLocalDateTime helper used elsewhere in routes/deliveries.js).
function fmtLocal(date) {
  if (!date) return '';
  const dt = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(dt.getTime())) return '';
  const local = new Date(dt.getTime() + LOCAL_TZ_OFFSET_MS);
  const pad = (n) => String(n).padStart(2, '0');
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())} ${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`;
}

function driverName(driver) {
  if (!driver || typeof driver === 'string') return '';
  const parts = [driver.profile?.firstName, driver.profile?.lastName].filter(Boolean);
  if (parts.length) return parts.join(' ');
  return driver.name || driver.email || '';
}

// early / on-time / late, recomputed from the two timestamps so it is correct
// even when the persisted lateMinutes/earlyMinutes/deliveryType were never
// written (3-hour early threshold — mirrors enrichDeliveryTiming in
// routes/deliveries.js).
function timing(d) {
  const scheduled = d.scheduledTime ? new Date(d.scheduledTime) : null;
  const doneRaw = d.deliveredTime || d.completedAt || null;
  const delivered = doneRaw ? new Date(doneRaw) : null;
  if (!scheduled || !delivered || Number.isNaN(scheduled.getTime()) || Number.isNaN(delivered.getTime())) {
    return {
      type: d.deliveryType || '',
      lateMinutes: d.lateMinutes || 0,
      earlyMinutes: d.earlyMinutes || 0,
    };
  }
  const diffMin = Math.round((delivered - scheduled) / 60000);
  const earlyThreshold = new Date(scheduled.getTime() - 180 * 60000);
  const lateMinutes = diffMin > 0 ? diffMin : 0;
  const earlyMinutes = delivered < earlyThreshold
    ? Math.max(0, Math.round((earlyThreshold - delivered) / 60000))
    : 0;
  return {
    type: lateMinutes > 0 ? 'late' : earlyMinutes > 0 ? 'early' : 'on-time',
    lateMinutes,
    earlyMinutes,
  };
}

// Flat, sheet-friendly representation of one delivery. Key order here is the
// column order the Apps Script writes.
export function buildDeliveryRow(delivery, event) {
  const d = typeof delivery?.toObject === 'function' ? delivery.toObject() : (delivery || {});
  const t = timing(d);
  const proof = d.proof || {};
  const addr = d.addressDetails || {};
  const collectionPhoto = d.collectionDetails?.collectedPhotoUrl || '';
  return {
    deliveryId: String(d._id || ''),
    event: event || '',
    customerId: d.customerId || '',
    customerName: d.customerName || '',
    company: d.company === 'Other' && d.otherCompany ? d.otherCompany : (d.company || ''),
    type: d.type || 'Delivery',
    address: d.address || '',
    locationType: addr.locationType || '',
    zone: d.zone || '',
    scheduledTime: fmtLocal(d.scheduledTime),
    driver: driverName(d.driver),
    status: d.status || '',
    deliveredTime: fmtLocal(d.deliveredTime || d.completedAt || d.collectionDetails?.collectedAt),
    lateMinutes: t.lateMinutes,
    earlyMinutes: t.earlyMinutes,
    timing: t.type,
    proofPhotoUrl: proof.photoUrl || (Array.isArray(proof.images) && proof.images[0]) || collectionPhoto || '',
    proofNotes: proof.notes || d.notes || '',
    gpsLink:
      d.gpsLocation?.link ||
      (d.gpsLocation?.lat != null && d.gpsLocation?.lng != null
        ? `https://www.google.com/maps?q=${d.gpsLocation.lat},${d.gpsLocation.lng}`
        : ''),
    createdAt: fmtLocal(d.createdAt),
    updatedAt: fmtLocal(d.updatedAt || new Date()),
  };
}

function post(payload, label) {
  return axios
    .post(WEBHOOK_URL, { secret: WEBHOOK_SECRET, ...payload }, { timeout: TIMEOUT_MS })
    .then(() => {
      if (process.env.SHEET_SYNC_DEBUG === '1') console.log(`[sheet-sync] ${label} ok`);
    })
    .catch((err) => {
      console.warn(`[sheet-sync] ${label} failed:`, err.response?.status || err.message);
    });
}

// Upsert a single delivery's row. Never throws.
export function syncDeliveryToSheet(delivery, { event } = {}) {
  if (!WEBHOOK_URL || !delivery) return;
  let row;
  try {
    row = buildDeliveryRow(delivery, event);
  } catch (err) {
    console.warn('[sheet-sync] failed to build row:', err.message);
    return;
  }
  post({ event: event || '', delivery: row }, `${event || 'sync'} ${row.deliveryId}`);
}

// Upsert many deliveries (bulk upload, batch driver-assign). One POST per
// BATCH_SIZE chunk. Never throws.
export function syncDeliveriesToSheet(deliveries, { event } = {}) {
  if (!WEBHOOK_URL || !Array.isArray(deliveries) || deliveries.length === 0) return;
  const rows = [];
  for (const d of deliveries) {
    try {
      rows.push(buildDeliveryRow(d, event));
    } catch (err) {
      console.warn('[sheet-sync] failed to build row (batch):', err.message);
    }
  }
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    post({ event: event || '', deliveries: chunk }, `${event || 'sync'} batch ${chunk.length}`);
  }
}
