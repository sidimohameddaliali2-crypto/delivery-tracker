import {
  rangeFor, groupDays, groupHours, summarize, recordsToCsv, bucketLabel, shiftDay,
} from './deliveryTimingModel';

const TODAY = '2026-10-10';

describe('rangeFor', () => {
  test('presets cover complete days before today, Today is inclusive', () => {
    expect(rangeFor('today', TODAY)).toEqual({ start: TODAY, end: TODAY });
    expect(rangeFor('7', TODAY)).toEqual({ start: '2026-10-03', end: '2026-10-09' });
    expect(rangeFor('30', TODAY)).toEqual({ start: '2026-09-10', end: '2026-10-09' });
    expect(rangeFor('year', TODAY)).toEqual({ start: '2025-10-10', end: '2026-10-09' });
    expect(rangeFor('all', TODAY).end).toBe(TODAY);
  });

  test('custom ranges are validated', () => {
    expect(rangeFor('custom', TODAY, { start: '2026-10-01', end: '2026-10-05' })).toEqual({ start: '2026-10-01', end: '2026-10-05' });
    expect(() => rangeFor('custom', TODAY, { start: '2026-10-06', end: '2026-10-05' })).toThrow(/on or before/);
    expect(() => rangeFor('custom', TODAY, { start: '2026-10-01', end: '2026-10-11' })).toThrow(/through today/);
    expect(() => rangeFor('custom', TODAY, { start: 'x', end: 'y' })).toThrow(/valid/);
    expect(() => rangeFor('bogus', TODAY)).toThrow();
  });

  test('shiftDay crosses month ends', () => {
    expect(shiftDay('2026-10-01', -1)).toBe('2026-09-30');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('grouping', () => {
  const days = [
    { day: '2026-09-30', early: 1, on: 5, late: 2, unknown: 0, total: 8 },
    { day: '2026-10-01', early: 0, on: 3, late: 1, unknown: 2, total: 6 },
  ];

  test('short ranges group by day without fabricating empty days', () => {
    const g = groupDays(days, { start: '2026-09-01', end: '2026-10-05' });
    expect(g.grouping).toBe('day');
    expect(g.buckets).toHaveLength(2);
    expect(g.buckets[1]).toMatchObject({ on: 3, late: 1, unknown: 2, recorded: 4, total: 6 });
  });

  test('long ranges group by week then month and clip edges', () => {
    const weekly = groupDays(days, { start: '2026-01-01', end: '2026-10-05' });
    expect(weekly.grouping).toBe('week');
    const monthly = groupDays(days, { start: '2024-01-01', end: '2026-10-05' });
    expect(monthly.grouping).toBe('month');
    expect(monthly.buckets.map((b) => [b.start, b.end])).toEqual([['2026-09-01', '2026-09-30'], ['2026-10-01', '2026-10-05']]);
  });

  test('summarize computes the on-time rate from recorded outcomes only', () => {
    const s = summarize(days);
    expect(s).toMatchObject({ total: 14, recorded: 12, unknown: 2 });
    expect(s.onTimeRate).toBeCloseTo((8 / 12) * 100);
    expect(summarize([]).onTimeRate).toBeNull();
  });

  test('groupHours yields 24 labelled scheduled hours', () => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({
      hour, early: 0, on: hour === 6 ? 4 : 0, late: 0, unknown: hour === 9 ? 3 : 0, total: hour === 6 ? 4 : hour === 9 ? 3 : 0,
    }));
    const g = groupHours(hours, TODAY);
    expect(g.grouping).toBe('hour');
    expect(g.buckets).toHaveLength(24);
    expect(g.buckets[6]).toMatchObject({ hour: 6, hourStart: '06:00', hourEnd: '07:00', recorded: 4 });
    expect(g.buckets[9]).toMatchObject({ recorded: 0, unknown: 3 });
    expect(bucketLabel(g.buckets[6])).toBe('10 Oct 2026 · 06:00–07:00');
  });
});

describe('CSV export', () => {
  const row = {
    customerName: '=HYPERLINK("x")', customerId: 'C1', zone: 'JVC', driverName: 'Ali', status: 'delivered',
    timing: 'late', scheduledTime: '2026-10-10T02:00:00Z', deliveredTime: '2026-10-10T02:30:00Z', varianceMinutes: 30,
  };

  test('includes zone and driver and neutralises formulas', () => {
    const lines = recordsToCsv([row]).split('\n');
    expect(lines[0]).toContain('"Zone","Driver"');
    expect(lines[1]).toContain('"\'=HYPERLINK(""x"")"');
    expect(lines[1]).toContain('"JVC","Ali"');
    expect(lines[1]).toContain('"Late"');
  });
});
