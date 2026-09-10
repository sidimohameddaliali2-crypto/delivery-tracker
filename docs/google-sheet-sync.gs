/**
 * Matter Delivery Tracker — Google Sheet sync
 * ------------------------------------------------------------------
 * Paste this into the Apps Script editor of the Google Sheet you want
 * deliveries mirrored into (Extensions ▸ Apps Script), then deploy it
 * as a Web app:
 *
 *   Deploy ▸ New deployment ▸ type "Web app"
 *     Execute as:      Me
 *     Who has access:  Anyone
 *
 * Copy the resulting /exec URL into the server's .env as
 * GOOGLE_SHEET_WEBHOOK_URL. If you set a shared secret, add the SAME
 * value here under Project Settings ▸ Script properties as
 * SHEET_SYNC_SECRET and in .env as GOOGLE_SHEET_WEBHOOK_SECRET.
 *
 * The server upserts by "Delivery ID" (column A): the first event for a
 * delivery appends a row, every later event updates that same row.
 * ------------------------------------------------------------------
 */

var SHEET_NAME = 'Deliveries';

// [header shown in the sheet, key sent by the server] — order = column order.
var COLUMNS = [
  ['Delivery ID',    'deliveryId'],
  ['Last Event',     'event'],
  ['Customer ID',    'customerId'],
  ['Customer Name',  'customerName'],
  ['Company',        'company'],
  ['Type',           'type'],
  ['Address',        'address'],
  ['Location Type',  'locationType'],
  ['Zone',           'zone'],
  ['Scheduled Time', 'scheduledTime'],
  ['Driver',         'driver'],
  ['Status',         'status'],
  ['Delivered Time', 'deliveredTime'],
  ['Late (min)',     'lateMinutes'],
  ['Early (min)',    'earlyMinutes'],
  ['Timing',         'timing'],
  ['Proof Photo',    'proofPhotoUrl'],
  ['Proof / Notes',  'proofNotes'],
  ['GPS Link',       'gpsLink'],
  ['Created At',     'createdAt'],
  ['Last Updated',   'updatedAt']
];

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000); // serialize writes so concurrent events don't collide
  try {
    var body = JSON.parse(e.postData.contents || '{}');

    var expected = PropertiesService.getScriptProperties().getProperty('SHEET_SYNC_SECRET');
    if (expected && body.secret !== expected) {
      return json_({ ok: false, error: 'bad secret' });
    }

    var rows = [];
    if (body.deliveries && body.deliveries.length) rows = body.deliveries;
    else if (body.delivery) rows = [body.delivery];
    if (!rows.length) return json_({ ok: false, error: 'no delivery payload' });

    var sheet = getSheet_();
    var idColValues = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues();
    var rowById = {};
    for (var i = 0; i < idColValues.length; i++) {
      var id = String(idColValues[i][0] || '').trim();
      if (id) rowById[id] = i + 2; // sheet row number
    }

    var updated = 0, appended = 0;
    for (var r = 0; r < rows.length; r++) {
      var values = COLUMNS.map(function (c) {
        var v = rows[r][c[1]];
        return (v === undefined || v === null) ? '' : v;
      });
      var id = String(rows[r].deliveryId || '').trim();
      var existing = id && rowById[id];
      if (existing) {
        sheet.getRange(existing, 1, 1, values.length).setValues([values]);
        updated++;
      } else {
        sheet.appendRow(values);
        if (id) rowById[id] = sheet.getLastRow();
        appended++;
      }
    }

    return json_({ ok: true, updated: updated, appended: appended });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return json_({ ok: true, service: 'matter-delivery-sheet-sync' });
}

function getSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  var headers = COLUMNS.map(function (c) { return c[0]; });
  var firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  var needHeader = false;
  for (var i = 0; i < headers.length; i++) {
    if (firstRow[i] !== headers[i]) { needHeader = true; break; }
  }
  if (needHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function json_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
