// Delivery timing history for the dashboard's delivery-history chart.
//
// Timing rules deliberately mirror GET /deliveries/late-early so the numbers on
// the dashboard agree with each other: a delivery is "delivered" when
// status === 'delivered' and it has a deliveredTime; diff = deliveredTime -
// scheduledTime in whole minutes; early = more than 180 min before the
// scheduled time, late = after it, anything else on time. Deliveries that are
// not delivered yet have no timing ("unknown") and are kept out of the rate.
import Delivery from '../models/Delivery.js';

const TZ_OFFSET_MINUTES = Number.parseInt(
  process.env.LOCAL_TIMEZONE_OFFSET_MINUTES || process.env.BUSINESS_TZ_OFFSET_MINUTES || '240',
  10
);
const TZ_OFFSET_MS = TZ_OFFSET_MINUTES * 60 * 1000;
const EARLY_THRESHOLD_MINUTES = 180;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export const TIMING_VALUES = ['early', 'on', 'late', 'unknown'];

function mongoTimezone() {
  const sign = TZ_OFFSET_MINUTES < 0 ? '-' : '+';
  const abs = Math.abs(TZ_OFFSET_MINUTES);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

// Inclusive business-day range ("YYYY-MM-DD".."YYYY-MM-DD") -> [start, endExclusive) Dates.
export function businessRangeBounds(start, end) {
  if (!DAY_RE.test(start || '') || !DAY_RE.test(end || '')) {
    throw new Error('start and end must be YYYY-MM-DD');
  }
  const toUtc = (day, extraDays = 0) => {
    const [y, m, d] = day.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + extraDays) - TZ_OFFSET_MS);
  };
  const from = toUtc(start);
  const to = toUtc(end, 1);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
    throw new Error('End date must be on or after the start date');
  }
  return { from, to };
}

const diffMinutesExpr = {
  $round: [{ $divide: [{ $subtract: ['$deliveredTime', '$scheduledTime'] }, 60000] }, 0],
};

const timingFields = {
  $addFields: {
    varianceMinutes: {
      $cond: [
        { $and: [{ $eq: ['$status', 'delivered'] }, { $ne: [{ $type: '$deliveredTime' }, 'missing'] }] },
        diffMinutesExpr,
        null,
      ],
    },
  },
};

const timingLabel = {
  $addFields: {
    timing: {
      $switch: {
        branches: [
          { case: { $eq: ['$varianceMinutes', null] }, then: 'unknown' },
          { case: { $lt: ['$varianceMinutes', -EARLY_THRESHOLD_MINUTES] }, then: 'early' },
          { case: { $gt: ['$varianceMinutes', 0] }, then: 'late' },
        ],
        default: 'on',
      },
    },
  },
};

function baseMatch({ from, to }) {
  return { scheduledTime: { $gte: from, $lt: to }, type: { $ne: 'Task' } };
}

// One row per business day that has deliveries: { day, early, on, late, unknown, total }.
export async function getDailyTimingCounts(range) {
  const rows = await Delivery.aggregate([
    { $match: baseMatch(range) },
    timingFields,
    timingLabel,
    {
      $group: {
        _id: {
          day: { $dateToString: { format: '%Y-%m-%d', date: '$scheduledTime', timezone: mongoTimezone() } },
          timing: '$timing',
        },
        count: { $sum: 1 },
      },
    },
  ]);

  const byDay = new Map();
  for (const { _id, count } of rows) {
    if (!byDay.has(_id.day)) {
      byDay.set(_id.day, { day: _id.day, early: 0, on: 0, late: 0, unknown: 0, total: 0 });
    }
    const entry = byDay.get(_id.day);
    entry[_id.timing] += count;
    entry.total += count;
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

// Median lateness (minutes) of late deliveries plus counts over fixed thresholds.
export async function getLatenessStats(range) {
  const [row] = await Delivery.aggregate([
    { $match: baseMatch(range) },
    timingFields,
    timingLabel,
    { $match: { timing: 'late' } },
    {
      $group: {
        _id: null,
        minutes: { $push: '$varianceMinutes' },
        over15: { $sum: { $cond: [{ $gt: ['$varianceMinutes', 15] }, 1, 0] } },
        over30: { $sum: { $cond: [{ $gt: ['$varianceMinutes', 30] }, 1, 0] } },
        over60: { $sum: { $cond: [{ $gt: ['$varianceMinutes', 60] }, 1, 0] } },
      },
    },
  ]);
  if (!row) return { median: null, over: { 15: 0, 30: 0, 60: 0 } };
  const sorted = row.minutes.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  return { median, over: { 15: row.over15, 30: row.over30, 60: row.over60 } };
}

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Paginated records behind a chart segment / stat; limit is capped for CSV export.
export async function getTimingRecords(range, { timing = 'all', search = '', page = 1, limit = 25 } = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || 25, 1), 10000);
  const pageNumber = Math.max(Number(page) || 1, 1);

  const match = baseMatch(range);
  const term = String(search || '').trim().slice(0, 100);
  if (term) {
    const regex = new RegExp(escapeRegex(term), 'i');
    match.$or = [{ customerName: regex }, { customerId: regex }];
  }

  const pipeline = [{ $match: match }, timingFields, timingLabel];
  if (TIMING_VALUES.includes(timing)) pipeline.push({ $match: { timing } });

  const [result] = await Delivery.aggregate([
    ...pipeline,
    {
      $facet: {
        total: [{ $count: 'n' }],
        rows: [
          { $sort: { scheduledTime: -1, _id: 1 } },
          { $skip: (pageNumber - 1) * pageSize },
          { $limit: pageSize },
          {
            $project: {
              customerName: 1,
              customerId: 1,
              status: 1,
              type: 1,
              timing: 1,
              varianceMinutes: 1,
              scheduledTime: 1,
              deliveredTime: 1,
            },
          },
        ],
      },
    },
  ]);

  const total = result?.total?.[0]?.n || 0;
  return {
    records: result?.rows || [],
    total,
    page: pageNumber,
    pageSize,
    pages: Math.max(Math.ceil(total / pageSize), 1),
  };
}
