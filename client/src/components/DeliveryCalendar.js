import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
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

const buildMonth = (year, monthIndex) => {
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(`${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }
  return { firstWeekday, days };
};

export default function DeliveryCalendar({ cycleStartDate, pauses, deliverySchedule, customerId }) {
  const navigate = useNavigate();
  const year = cycleStartDate ? Number(String(cycleStartDate).slice(0, 4)) : new Date().getFullYear();
  const [deliveredDates, setDeliveredDates] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pausedDates = new Set((pauses?.paused_days || []).map((d) => String(d).slice(0, 10)));
  const resumedDates = new Set((pauses?.resumed_days || []).map((d) => String(d).slice(0, 10)));
  const scheduledActiveDates = new Set(
    (deliverySchedule || [])
      .filter((entry) => entry.status === 'active')
      .map((entry) => String(entry.date).slice(0, 10))
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
      params: { customerId, dateFrom: `${year}-01-01`, dateTo: `${year}-12-31`, limit: 500 },
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
  }, [customerId, year]);

  const dayStatus = (iso) => {
    if (pausedDates.has(iso)) return 'paused';
    if (deliveredDates.has(iso)) {
      const { deliveryType } = deliveredDates.get(iso);
      if (deliveryType === 'late') return 'late';
      if (deliveryType === 'early') return 'early';
      return 'delivered';
    }
    if (scheduledActiveDates.has(iso) || resumedDates.has(iso)) return 'scheduled';
    return 'none';
  };

  const colorFor = (status) => {
    if (status === 'paused') return 'bg-amber-400';
    if (status === 'late') return 'bg-red-500';
    if (status === 'early') return 'bg-yellow-400';
    if (status === 'delivered') return 'bg-emerald-700';
    if (status === 'scheduled') return 'bg-emerald-400';
    return 'bg-gray-100';
  };

  return (
    <div>
      {loading && <p className="text-xs text-gray-400 mb-2">Loading delivery history…</p>}
      {error && <p className="text-xs text-rose-500 mb-2">{error}</p>}
      {!customerId && (
        <p className="text-xs text-gray-400 mb-2">No internal customer match — showing scheduled/paused/resumed days from Matter only, no confirmed delivery history.</p>
      )}
      <div className="overflow-x-auto">
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 min-w-[560px]">
          {MONTH_NAMES.map((name, monthIndex) => {
            const { firstWeekday, days } = buildMonth(year, monthIndex);
            const cells = [...Array(firstWeekday).fill(null), ...days];
            return (
              <div key={name} className="border border-gray-100 rounded-lg p-2">
                <p className="text-[11px] font-semibold text-gray-600 mb-1 text-center">{name}</p>
                <div className="grid grid-cols-7 gap-0.5">
                  {WEEKDAYS.map((w, i) => (
                    <div key={`${name}-wd-${i}`} className="text-[8px] text-gray-300 text-center">{w}</div>
                  ))}
                  {cells.map((iso, idx) => {
                    if (!iso) return <div key={`${name}-blank-${idx}`} />;
                    const status = dayStatus(iso);
                    const day = Number(iso.slice(8, 10));
                    const deliveryId = deliveredDates.get(iso)?.id;
                    return (
                      <div
                        key={iso}
                        title={`${iso}${status !== 'none' ? ` · ${status}` : ''}${deliveryId ? ' · click to view delivery' : ''}`}
                        onClick={deliveryId ? () => navigate(`/deliveries/${deliveryId}`) : undefined}
                        className={`w-4 h-4 rounded-sm text-[7px] flex items-center justify-center ${colorFor(status)} ${status === 'none' ? 'text-gray-400' : 'text-white'} ${deliveryId ? 'cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-purple-400' : ''}`}
                      >
                        {day}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-700 inline-block" /> Delivered on time</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-400 inline-block" /> Delivered early</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-500 inline-block" /> Delivered late</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-400 inline-block" /> Scheduled</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-400 inline-block" /> Paused</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 border border-gray-200 inline-block" /> No delivery</span>
      </div>
    </div>
  );
}
