// Delivery timing queries for the dashboard's delivery overview (metrics, chart, table).
//
// Timing rules deliberately mirror GET /deliveries/late-early so the numbers on
// the dashboard agree with each other: a delivery is "delivered" when
// status === 'delivered' and it has a deliveredTime; diff = deliveredTime -
// scheduledTime in whole minutes; early = more than 180 min before the
// scheduled time, late = after it, anything else on time. Deliveries that are
// not delivered yet have no timing ("unknown") and are kept out of the rate.
import mongoose from 'mongoose';
import Delivery from '../models/Delivery.js';

const TZ_OFFSET_MINUTES = Number.parseInt(
  process.env.LOCAL_TIMEZONE_OFFSET_MINUTES || process.env.BUSINESS_TZ_OFFSET_MINUTES || '240',
  10
);
const TZ_OFFSET_MS = TZ_OFFSET_MINUTES * 60 * 1000;
const EARLY_THRESHOLD_MINUTES = 180;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MISSING = '__missing__';

export const TIMING_VALUES = ['early', 'on', 'late', 'unknown'];

function mongoTimezone() {
  const sign = TZ_OFFSET_MINUTES < 0 ? '-' : '+';
  const abs = Math.abs(TZ_OFFSET_MINUTES);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
const TZ = mongoTimezone();

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

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (value, max = 100) => String(value ?? '').trim().slice(0, max);

// range match + optional record filters. `skip` lets the filter-option query
// ignore the dimension being listed.
function baseMatch({ from, to }, filters = {}, skip = []) {
  const match = { scheduledTime: { $gte: from, $lt: to }, type: { $ne: 'Task' } };

  const term = clean(filters.search);
  if (term) {
    const regex = new RegExp(escapeRegex(term), 'i');
    match.$or = [{ customerName: regex }, { customerId: regex }];
  }
  const customerId = clean(filters.customerId);
  if (customerId) match.customerId = customerId;

  if (!skip.includes('zone')) {
    const zone = clean(filters.zone);
    if (zone === MISSING) match.zone = { $in: [null, ''] };
    else if (zone) match.zone = zone;
  }
  if (!skip.includes('status')) {
    const status = clean(filters.status);
    if (status === MISSING) match.status = { $in: [null, ''] };
    else if (status) match.status = status;
  }
  if (!skip.includes('driver')) {
    const driver = clean(filters.driver);
    if (driver === MISSING) match.driver = null;
    else if (driver && mongoose.Types.ObjectId.isValid(driver)) match.driver = new mongoose.Types.ObjectId(driver);
  }
  return match;
}

const hourExpr = { $hour: { date: '$scheduledTime', timezone: TZ } };
const dayExpr = { $dateToString: { format: '%Y-%m-%d', date: '$scheduledTime', timezone: TZ } };

const emptyCounts = () => ({ early: 0, on: 0, late: 0, unknown: 0, total: 0 });
function addTo(entry, timing, count) {
  entry[timing] += count;
  entry.total += count;
}

// Per-day counts, per-hour counts (single-day ranges only), lateness stats and the
// zone / driver / status options available in the range.
export async function getTimingOverview(range, filters = {}, { hourly = false } = {}) {
  const main = [
    { $match: baseMatch(range, filters) },
    timingFields,
    timingLabel,
  ];

  const [mainRows, latenessRows, hourRows, optionRows] = await Promise.all([
    Delivery.aggregate([
      ...main,
      { $group: { _id: { day: dayExpr, timing: '$timing' }, count: { $sum: 1 } } },
    ]),
    Delivery.aggregate([
      ...main,
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
    ]),
    hourly
      ? Delivery.aggregate([
        ...main,
        { $group: { _id: { hour: hourExpr, timing: '$timing' }, count: { $sum: 1 } } },
      ])
      : Promise.resolve([]),
    Delivery.aggregate([
      { $match: baseMatch(range, filters, ['zone', 'driver', 'status']) },
      {
        $facet: {
          zones: [{ $match: { zone: { $nin: [null, ''] } } }, { $group: { _id: '$zone' } }],
          statuses: [{ $match: { status: { $nin: [null, ''] } } }, { $group: { _id: '$status' } }],
          drivers: [
            { $match: { driver: { $ne: null } } },
            { $group: { _id: '$driver' } },
            { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
            {
              $project: {
                name: {
                  $trim: {
                    input: {
                      $concat: [
                        { $ifNull: [{ $arrayElemAt: ['$user.profile.firstName', 0] }, ''] },
                        ' ',
                        { $ifNull: [{ $arrayElemAt: ['$user.profile.lastName', 0] }, ''] },
                      ],
                    },
                  },
                },
                email: { $arrayElemAt: ['$user.email', 0] },
              },
            },
          ],
        },
      },
    ]),
  ]);

  const byDay = new Map();
  for (const { _id, count } of mainRows) {
    if (!byDay.has(_id.day)) byDay.set(_id.day, { day: _id.day, ...emptyCounts() });
    addTo(byDay.get(_id.day), _id.timing, count);
  }
  const days = [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));

  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, ...emptyCounts() }));
  for (const { _id, count } of hourRows) addTo(hours[_id.hour], _id.timing, count);

  const [late] = latenessRows;
  let lateness = { median: null, over: { 15: 0, 30: 0, 60: 0 } };
  if (late) {
    const sorted = late.minutes.sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    lateness = {
      median: sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2),
      over: { 15: late.over15, 30: late.over30, 60: late.over60 },
    };
  }

  const options = optionRows[0] || {};
  const facets = {
    zones: (options.zones || []).map((z) => z._id).sort((a, b) => a.localeCompare(b)),
    statuses: (options.statuses || []).map((s) => s._id).sort((a, b) => a.localeCompare(b)),
    drivers: (options.drivers || [])
      .map((d) => ({ id: String(d._id), name: d.name || d.email || 'Unnamed driver' }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  return { days, hours: hourly ? hours : null, lateness, facets };
}

// Paginated records behind the table, a chart segment or an export.
// bucket: optional { hour } narrows to one scheduled Dubai hour.
export async function getTimingRecords(range, filters = {}, {
  timing = 'all', hour = null, page = 1, limit = 25,
} = {}) {
  const pageSize = Math.min(Math.max(Number(limit) || 25, 1), 10000);
  const pageNumber = Math.max(Number(page) || 1, 1);

  const pipeline = [{ $match: baseMatch(range, filters) }];
  const hourNumber = Number.isInteger(Number(hour)) && hour !== null && hour !== '' ? Number(hour) : null;
  if (hourNumber !== null && hourNumber >= 0 && hourNumber < 24) {
    pipeline.push({ $addFields: { schedHour: hourExpr } }, { $match: { schedHour: hourNumber } });
  }
  pipeline.push(timingFields, timingLabel);

  const timingMatch = TIMING_VALUES.includes(timing) ? [{ $match: { timing } }] : [];

  const [result] = await Delivery.aggregate([
    ...pipeline,
    {
      $facet: {
        counts: [{ $group: { _id: '$timing', n: { $sum: 1 } } }],
        total: [...timingMatch, { $count: 'n' }],
        rows: [
          ...timingMatch,
          { $sort: { scheduledTime: -1, _id: 1 } },
          { $skip: (pageNumber - 1) * pageSize },
          { $limit: pageSize },
          { $lookup: { from: 'users', localField: 'driver', foreignField: '_id', as: 'driverUser' } },
          {
            $project: {
              customerName: 1,
              customerId: 1,
              status: 1,
              type: 1,
              zone: 1,
              timing: 1,
              varianceMinutes: 1,
              scheduledTime: 1,
              deliveredTime: 1,
              driverName: {
                $trim: {
                  input: {
                    $concat: [
                      { $ifNull: [{ $arrayElemAt: ['$driverUser.profile.firstName', 0] }, ''] },
                      ' ',
                      { $ifNull: [{ $arrayElemAt: ['$driverUser.profile.lastName', 0] }, ''] },
                    ],
                  },
                },
              },
            },
          },
        ],
      },
    },
  ]);

  const counts = emptyCounts();
  for (const { _id, n } of result?.counts || []) addTo(counts, _id, n);
  const total = result?.total?.[0]?.n || 0;
  return {
    records: result?.rows || [],
    counts,
    total,
    page: pageNumber,
    pageSize,
    pages: Math.max(Math.ceil(total / pageSize), 1),
  };
}
