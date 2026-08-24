import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const WEEKDAY_LABELS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DELIVERY_SKIP_STATUSES = new Set(['failed', 'cancelled']);

// Dates throughout are plain "YYYY-MM-DD" strings, built from date parts
// (never `new Date(isoString)` directly) so a user's local timezone can't
// shift a day forward or backward.
const toISODateLocal = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Monday-first weekday index (0=Mon..6=Sun) instead of JS's Sunday-first getDay().
const mondayFirstWeekday = (year, monthIndex, day = 1) => {
  const jsDay = new Date(year, monthIndex, day).getDay();
  return (jsDay + 6) % 7;
};

const buildMonth = (year, monthIndex) => {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = mondayFirstWeekday(year, monthIndex);
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return { firstWeekday, days };
};

const STATUS_STYLE = {
  skipped: { cell: 'bg-matter-red/10', number: 'text-matter-red', dot: 'bg-matter-red' },
  delivered: { cell: 'bg-matter-green/30', number: 'text-matter-navy', dot: 'bg-matter-charcoal' },
  scheduled: { cell: 'bg-matter-sky/15', number: 'text-matter-navy', dot: 'bg-matter-sky' },
  upcoming: { cell: 'bg-stone-100', number: 'text-gray-500', dot: 'bg-gray-300' },
  none: { cell: '', number: 'text-gray-300', dot: '' },
};

const LEGEND = [
  { key: 'delivered', label: 'Delivered', dot: 'bg-matter-charcoal' },
  { key: 'scheduled', label: 'Scheduled', dot: 'bg-matter-sky' },
  { key: 'upcoming', label: 'Upcoming', dot: 'bg-gray-300' },
  { key: 'skipped', label: 'Skipped', dot: 'bg-matter-red' },
];

export default function DeliveryCalendar({ pauses, deliverySchedule, customerId }) {
  const navigate = useNavigate();
  const today = new Date();
  const todayISO = toISODateLocal(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [deliveredDates, setDeliveredDates] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pausedDates = useMemo(
    () => new Set((pauses?.paused_days || []).map((d) => String(d).slice(0, 10))),
    [pauses]
  );
  const resumedDates = useMemo(
    () => new Set((pauses?.resumed_days || []).map((d) => String(d).slice(0, 10))),
    [pauses]
  );
  const scheduledActiveDates = useMemo(
    () => new Set(
      (deliverySchedule || [])
        .filter((entry) => entry.status === 'active')
        .map((entry) => String(entry.date).slice(0, 10))
    ),
    [deliverySchedule]
  );

  useEffect(() => {
    if (!customerId) {
      setDeliveredDates(new Map());
      return;
    }
    let mounted = true;
    setLoading(true);
    setError('');
    api.get('/deliveries', {
      params: { customerId, dateFrom: `${viewYear}-01-01`, dateTo: `${viewYear}-12-31`, limit: 500 },
    })
      .then((res) => {
        if (!mounted) return;
        const list = res.data?.data?.deliveries || [];
        const dates = new Map(
          list
            .filter((d) => d.type !== 'Task' && d.type !== 'Collection' && !DELIVERY_SKIP_STATUSES.has(d.status))
            .map((d) => [toISODateLocal(new Date(d.scheduledTime)), { id: d._id, deliveryType: d.deliveryType || 'on-time' }])
        );
        setDeliveredDates(dates);
      })
      .catch((err) => {
        console.error('Failed to load delivery history for calendar:', err);
        if (mounted) setError('Could not load delivery history.');
      })
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [customerId, viewYear]);

  const dayStatus = (iso) => {
    if (pausedDates.has(iso)) return 'skipped';
    if (deliveredDates.has(iso)) return 'delivered';
    if (scheduledActiveDates.has(iso) || resumedDates.has(iso)) return 'scheduled';
    if (iso > todayISO) return 'upcoming';
    return 'none';
  };

  const goToPrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goToNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const { firstWeekday, days } = buildMonth(viewYear, viewMonth);
  const cells = [...Array(firstWeekday).fill(null), ...days];

  const legendCounts = useMemo(() => {
    const counts = { delivered: 0, scheduled: 0, upcoming: 0, skipped: 0 };
    days.forEach((iso) => {
      const status = dayStatus(iso);
      if (counts[status] !== undefined) counts[status] += 1;
    });
    return counts;
  }, [days, deliveredDates, pausedDates, scheduledActiveDates, resumedDates, todayISO]);

  return (
    <div>
      {loading && <p className="text-xs text-gray-400 mb-2">Loading delivery history…</p>}
      {error && <p className="text-xs text-matter-red mb-2">{error}</p>}
      {!customerId && (
        <p className="text-xs text-gray-400 mb-2">No internal customer match — showing scheduled/paused/resumed days from Matter only, no confirmed delivery history.</p>
      )}

      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 text-gray-600 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
        <p className="font-serif-mgmt text-base font-bold text-gray-900">{MONTH_NAMES[viewMonth]} {viewYear}</p>
        <button
          type="button"
          onClick={goToNextMonth}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 text-gray-600 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2 mb-2">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="text-[10px] font-semibold text-gray-400 text-center tracking-wide">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {cells.map((iso, idx) => {
          if (!iso) return <div key={`blank-${idx}`} />;
          const status = dayStatus(iso);
          const style = STATUS_STYLE[status] || STATUS_STYLE.none;
          const day = Number(iso.slice(8, 10));
          const isToday = iso === todayISO;
          const entry = deliveredDates.get(iso);
          const deliveryId = entry?.id;
          const tooltip = `${iso}${status !== 'none' ? ` · ${status}${entry?.deliveryType && status === 'delivered' ? ` (${entry.deliveryType})` : ''}` : ''}${deliveryId ? ' · click to view delivery' : ''}`;

          return (
            <button
              type="button"
              key={iso}
              title={tooltip}
              onClick={deliveryId ? () => navigate(`/deliveries/${deliveryId}`) : undefined}
              disabled={!deliveryId}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center gap-1 transition-colors ${style.cell || 'bg-stone-50'} ${
                isToday ? 'ring-2 ring-matter-sky' : ''
              } ${deliveryId ? 'cursor-pointer hover:brightness-95' : 'cursor-default'}`}
            >
              <span className={`text-sm font-semibold ${isToday ? 'text-gray-900' : style.number}`}>{day}</span>
              {status !== 'none' && <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-gray-500 flex-wrap">
        {LEGEND.map((l) => (
          <span key={l.key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full inline-block ${l.dot}`} />
            {l.label} ({legendCounts[l.key]})
          </span>
        ))}
      </div>
    </div>
  );
}
