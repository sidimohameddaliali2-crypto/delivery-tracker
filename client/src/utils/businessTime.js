// scheduledTime (and similar delivery timestamps) are stored as UTC instants
// representing a fixed business timezone (Dubai, UTC+4 by default), not the
// viewer's own device timezone. Rendering them with raw `Date.getHours()` /
// `.toLocaleString()` only looks correct when the viewer's OS timezone
// happens to be set to Dubai — anywhere else, times drift by the difference
// between the two zones. These helpers always read/write the fixed business
// offset instead, matching the server's normalizeScheduledTimeInput.
const BUSINESS_TZ_OFFSET_MINUTES = Number(process.env.REACT_APP_LOCAL_TIMEZONE_OFFSET_MINUTES || 0);
const MS_PER_MINUTE = 60 * 1000;

const pad2 = (n) => String(n).padStart(2, '0');

// Business-timezone Y/M/D/H/M for a stored UTC instant.
export function toBusinessComponents(dateInput) {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return null;
  const shifted = new Date(d.getTime() + BUSINESS_TZ_OFFSET_MINUTES * MS_PER_MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(), // 0-indexed
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
  };
}

// "YYYY-MM-DD" in business time — for <input type="date"> values.
export function formatBusinessDateInput(dateInput) {
  const c = toBusinessComponents(dateInput);
  if (!c) return '';
  return `${c.year}-${pad2(c.month + 1)}-${pad2(c.day)}`;
}

// "HH:mm" (24h) in business time — for <input type="time"> values.
export function formatBusinessTimeInput(dateInput) {
  const c = toBusinessComponents(dateInput);
  if (!c) return '';
  return `${pad2(c.hours)}:${pad2(c.minutes)}`;
}

// "HH:mm" (24h) in business time, for display.
export function formatBusinessTime(dateInput) {
  const c = toBusinessComponents(dateInput);
  if (!c) return 'N/A';
  return `${pad2(c.hours)}:${pad2(c.minutes)}`;
}

// "MM/DD/YYYY HH:mm" in business time, for display.
export function formatBusinessDateTime(dateInput) {
  const c = toBusinessComponents(dateInput);
  if (!c) return 'N/A';
  return `${pad2(c.month + 1)}/${pad2(c.day)}/${c.year} ${pad2(c.hours)}:${pad2(c.minutes)}`;
}

// Business-local "YYYY-MM-DD" + "HH:mm" -> the equivalent UTC Date instant.
export function businessComponentsToUtcDate(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (!year || !month || !day || Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  const utcMillis = Date.UTC(year, month - 1, day, hours, minutes) - BUSINESS_TZ_OFFSET_MINUTES * MS_PER_MINUTE;
  const result = new Date(utcMillis);
  return Number.isNaN(result.getTime()) ? null : result;
}
