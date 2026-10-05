// Date-range and bucketing helpers for the dashboard's delivery-history chart.
// All days are Dubai calendar days ("YYYY-MM-DD"); the server does the
// timezone work, so this file only does string/UTC-date arithmetic.
const DAY_MS = 86400000;

export const TIMING_LABELS = Object.freeze({
  early: 'Early',
  on: 'On time',
  late: 'Late',
  unknown: 'Awaiting update',
});

export const PRESETS = [
  ['today', 'Today'],
  ['7', '7 days'],
  ['30', '30 days'],
  ['90', '90 days'],
  ['year', '1 year'],
  ['all', 'All time'],
  ['custom', 'Custom date'],
];

// Earliest day "All time" will ask for.
export const HISTORY_START = '2024-01-01';

export function dubaiToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function shiftDay(day, count) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}

// Same convention as the owner's design: historical presets cover complete days
// before today; "Today" and custom ranges are inclusive.
export function rangeFor(preset, today, custom = {}) {
  if (preset === 'today') return { start: today, end: today };
  if (preset === 'custom') {
    if (!isDay(custom.start) || !isDay(custom.end)) throw new Error('Choose valid start and end dates.');
    if (custom.start > custom.end) throw new Error('Start date must be on or before the end date.');
    if (custom.end > today) throw new Error('History can include dates through today.');
    return { start: custom.start, end: custom.end };
  }
  if (preset === 'all') return { start: HISTORY_START, end: today };
  if (preset === 'year') {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCFullYear(date.getUTCFullYear() - 1);
    return { start: date.toISOString().slice(0, 10), end: shiftDay(today, -1) };
  }
  const days = Number(preset);
  if (![7, 30, 90].includes(days)) throw new Error('Choose a supported date range.');
  return { start: shiftDay(today, -days), end: shiftDay(today, -1) };
}

const emptyBucket = (start, end) => ({
  key: `${start}_${end}`, start, end, early: 0, on: 0, late: 0, unknown: 0, total: 0, recorded: 0,
});

export function summarize(days) {
  const sum = days.reduce((acc, d) => {
    acc.early += d.early; acc.on += d.on; acc.late += d.late; acc.unknown += d.unknown; acc.total += d.total;
    return acc;
  }, { early: 0, on: 0, late: 0, unknown: 0, total: 0 });
  const recorded = sum.early + sum.on + sum.late;
  return { ...sum, recorded, onTimeRate: recorded ? (sum.on / recorded) * 100 : null };
}

// Day buckets up to 45 days, Monday-Sunday weeks up to ~1 year, calendar months beyond.
// Only periods that have deliveries appear (no fabricated zero buckets).
export function groupDays(days, range) {
  const span = (Date.parse(`${range.end}T00:00:00Z`) - Date.parse(`${range.start}T00:00:00Z`)) / DAY_MS + 1;
  const grouping = span <= 45 ? 'day' : span <= 400 ? 'week' : 'month';
  const buckets = new Map();

  for (const d of days) {
    let start = d.day;
    let end = d.day;
    if (grouping === 'week') {
      const dow = (new Date(`${d.day}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
      start = shiftDay(d.day, -dow);
      end = shiftDay(start, 6);
    } else if (grouping === 'month') {
      start = `${d.day.slice(0, 7)}-01`;
      const next = new Date(`${start}T00:00:00Z`);
      next.setUTCMonth(next.getUTCMonth() + 1);
      end = shiftDay(next.toISOString().slice(0, 10), -1);
    }
    // Clip edge weeks/months to the selected range.
    if (start < range.start) start = range.start;
    if (end > range.end) end = range.end;
    const key = `${start}_${end}`;
    if (!buckets.has(key)) buckets.set(key, emptyBucket(start, end));
    const bucket = buckets.get(key);
    bucket.early += d.early; bucket.on += d.on; bucket.late += d.late;
    bucket.unknown += d.unknown; bucket.total += d.total;
    bucket.recorded += d.early + d.on + d.late;
  }
  return { grouping, buckets: [...buckets.values()].sort((a, b) => a.start.localeCompare(b.start)) };
}

const dayFmt = (day, opts) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
export const dayLabel = (day, full = false) => (full
  ? dayFmt(day, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  : dayFmt(day, { day: 'numeric', month: 'short', year: 'numeric' }));
export const periodLabel = (range) => (range.start === range.end
  ? dayLabel(range.start)
  : `${dayLabel(range.start)} – ${dayLabel(range.end)}`);
export const shortDayLabel = (day) => dayFmt(day, { day: 'numeric', month: 'short' });

// Text starting with = + - @ is prefixed with ' so spreadsheets never run it as a formula.
const csvCell = (value) => {
  let text = String(value ?? '');
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function recordsToCsv(records) {
  const header = ['Customer', 'Customer ID', 'Status', 'Timing', 'Scheduled (Dubai)', 'Delivered (Dubai)', 'Variance (min)'];
  const stamp = (value) => (value ? new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Dubai', hourCycle: 'h23' }) : '');
  const lines = records.map((r) => [
    r.customerName, r.customerId, r.status, TIMING_LABELS[r.timing] || r.timing,
    stamp(r.scheduledTime), stamp(r.deliveredTime), r.varianceMinutes ?? '',
  ].map(csvCell).join(','));
  return [header.map(csvCell).join(','), ...lines].join('\n');
}

export function downloadCsv(filename, csv) {
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
