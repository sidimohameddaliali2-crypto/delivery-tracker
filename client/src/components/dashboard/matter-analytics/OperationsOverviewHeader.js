import React, { useRef, useState, useEffect } from 'react';

const TIME_RANGE_OPTIONS = [
  { key: '1day', label: '1 Day' },
  { key: '1week', label: '1 Week' },
  { key: '1month', label: '1 Month' },
  { key: 'custom', label: 'Custom Range' },
];

function exportDeliveriesCsv(rows) {
  const header = ['Customer', 'Zone', 'Scheduled Time', 'Type', 'Late Minutes', 'Early Minutes'];
  const lines = rows.map((d) => [
    d.customerName || '',
    d.zone || d.area || 'Unassigned',
    d.scheduledTime ? new Date(d.scheduledTime).toISOString() : '',
    d.deliveryType || '',
    d.actualLateMinutes ?? '',
    d.earlyMinutes ?? '',
  ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv = [header.join(','), ...lines].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `deliveries-${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function OperationsOverviewHeader({
  timeRange,
  onTimeRangeChange,
  customStartDate,
  customEndDate,
  onCustomStartDateChange,
  onCustomEndDateChange,
  onOpenComms,
  exportRows,
}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setFilterOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:justify-between sm:items-end gap-3">
      <div>
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-1">Operations Overview</h1>
        <p className="text-sm text-gray-500">Real-time logistics command center.</p>
      </div>
      <div className="flex gap-2 flex-wrap">
        <div className="relative" ref={ref}>
          <button
            onClick={() => setFilterOpen((o) => !o)}
            className="px-3 py-1.5 bg-white border border-gray-200 rounded flex items-center gap-2 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">filter_list</span> Filter
          </button>
          {filterOpen && (
            <div className="absolute right-0 top-10 z-30 bg-white border border-gray-200 rounded-lg shadow-lg p-3 w-64">
              <div className="space-y-1 mb-2">
                {TIME_RANGE_OPTIONS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => { onTimeRangeChange(key); if (key !== 'custom') setFilterOpen(false); }}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-sm font-medium ${timeRange === key ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {timeRange === 'custom' && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Start</label>
                    <input type="date" value={customStartDate} onChange={(e) => onCustomStartDateChange(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">End</label>
                    <input type="date" value={customEndDate} onChange={(e) => onCustomEndDateChange(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 text-sm" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onOpenComms}
          className="px-3 py-1.5 bg-white border border-gray-200 rounded flex items-center gap-2 text-sm font-medium hover:bg-gray-50 transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">chat</span> Communication
        </button>
        <button
          onClick={() => exportDeliveriesCsv(exportRows || [])}
          className="px-3 py-1.5 bg-blue-600 text-white rounded flex items-center gap-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          <span className="material-symbols-outlined text-[18px]">download</span> Export
        </button>
      </div>
    </div>
  );
}

export default OperationsOverviewHeader;
