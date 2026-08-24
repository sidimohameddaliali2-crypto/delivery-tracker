import React from 'react';

function TrendChip({ pct }) {
  const positive = pct >= 0;
  return (
    <div className={`flex items-center text-xs font-medium px-1.5 py-0.5 rounded mb-1 ${positive ? 'text-emerald-600 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
      <span className="material-symbols-outlined text-[14px]">{positive ? 'arrow_upward' : 'arrow_downward'}</span>
      {Math.abs(pct)}%
    </div>
  );
}

function TotalDeliveriesCard({ total, trendPct, sparkline }) {
  return (
    <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Deliveries Today</h3>
        <span className="material-symbols-outlined text-blue-600">local_shipping</span>
      </div>
      <div className="flex items-end gap-3 mb-3">
        <div className="text-4xl font-bold text-gray-900 leading-tight">{total.toLocaleString()}</div>
        <TrendChip pct={trendPct} />
      </div>
      <div className="w-full h-8 flex items-end gap-[2px]">
        {sparkline.map((point, index) => {
          const maxCount = Math.max(1, ...sparkline.map((p) => p.count));
          const heightPct = Math.max(6, Math.round((point.count / maxCount) * 100));
          const isToday = index === sparkline.length - 1;
          return (
            <div
              key={point.day}
              title={`${point.day}: ${point.count}`}
              className={`flex-1 rounded-t-sm ${isToday ? 'bg-blue-600' : 'bg-blue-600/20'}`}
              style={{ height: `${heightPct}%` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function DeliverySplitCard({ earlyPct, onTimePct, latePct, notUpdatedPct }) {
  const rows = [
    { label: 'Early', pct: earlyPct, dotCls: 'bg-yellow-500', textCls: 'text-yellow-600' },
    { label: 'On-Time', pct: onTimePct, dotCls: 'bg-emerald-500', textCls: 'text-emerald-600' },
    { label: 'Late', pct: latePct, dotCls: 'bg-red-500', textCls: 'text-red-600' },
    { label: 'Not Updated', pct: notUpdatedPct, dotCls: 'bg-gray-400', textCls: 'text-gray-500' },
  ];
  return (
    <div className="col-span-6 sm:col-span-6 lg:col-span-3 bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Delivery Split</h3>
          <span className="material-symbols-outlined text-blue-600">pie_chart</span>
        </div>

        {/* Mobile: compact stacked rows */}
        <div className="sm:hidden mt-2 space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-gray-600">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.dotCls}`} />
                {r.label}
              </span>
              <span className={`font-semibold ${r.textCls}`}>{r.pct}%</span>
            </div>
          ))}
        </div>

        {/* sm and up: original grid layout */}
        <div className="hidden sm:grid grid-cols-4 gap-2 mt-2">
          <div className="flex flex-col">
            <span className="text-lg font-bold text-yellow-500">{earlyPct}%</span>
            <span className="text-xs text-gray-500">Early</span>
          </div>
          <div className="flex flex-col text-center">
            <span className="text-lg font-bold text-emerald-500">{onTimePct}%</span>
            <span className="text-xs text-gray-500">On-Time</span>
          </div>
          <div className="flex flex-col text-center">
            <span className="text-lg font-bold text-red-500">{latePct}%</span>
            <span className="text-xs text-gray-500">Late</span>
          </div>
          <div className="flex flex-col text-right">
            <span className="text-lg font-bold text-gray-400">{notUpdatedPct}%</span>
            <span className="text-xs text-gray-500">Not Updated</span>
          </div>
        </div>
      </div>
      <div className="hidden sm:flex mt-4 w-full h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="bg-yellow-500 h-full" style={{ width: `${earlyPct}%` }} />
        <div className="bg-emerald-500 h-full" style={{ width: `${onTimePct}%` }} />
        <div className="bg-red-500 h-full" style={{ width: `${latePct}%` }} />
        <div className="bg-gray-300 h-full" style={{ width: `${notUpdatedPct}%` }} />
      </div>
    </div>
  );
}

function ActiveIncidentsCard({ count, trend, high, medium, onAddIncident }) {
  return (
    <div className="col-span-6 sm:col-span-6 lg:col-span-3 bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-start mb-2">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Active Incidents</h3>
          <button onClick={onAddIncident} title="Add incident" className="text-red-500 hover:text-red-600">
            <span className="material-symbols-outlined">warning</span>
          </button>
        </div>

        {/* Mobile: big number + short status line */}
        <div className="sm:hidden">
          <div className="text-4xl font-bold text-red-600 leading-tight mb-1">{count}</div>
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <span className="material-symbols-outlined text-[14px]">warning</span>
            {count > 0 ? 'Action Required' : 'All Clear'}
          </div>
        </div>

        {/* sm and up: original trend + count */}
        <div className="hidden sm:flex items-end gap-3 mb-4">
          <div className="text-4xl font-bold text-gray-900 leading-tight">{count}</div>
          {trend !== null && <TrendChip pct={trend} />}
        </div>
      </div>
      <div className="hidden sm:flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-red-50 text-red-600 text-xs font-medium rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> High: {high}
          </span>
          <span className="px-2 py-1 bg-amber-50 text-amber-600 text-xs font-medium rounded flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Med: {medium}
          </span>
        </div>
        <button onClick={onAddIncident} className="text-xs font-medium text-blue-600 hover:underline flex-shrink-0">
          + Add
        </button>
      </div>
    </div>
  );
}

const PERFORMANCE_STATUS_CONFIG = {
  excellent: { label: 'Excellent', textCls: 'text-emerald-600', iconCls: 'text-emerald-500' },
  good: { label: 'Good', textCls: 'text-amber-600', iconCls: 'text-amber-500' },
  needsImprovement: { label: 'Needs Improvement', textCls: 'text-red-600', iconCls: 'text-red-500' },
};

function PerformanceStatusCard({ status }) {
  const config = PERFORMANCE_STATUS_CONFIG[status] || PERFORMANCE_STATUS_CONFIG.good;
  return (
    <div className="col-span-12 sm:col-span-6 lg:col-span-3 bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Performance Status</h3>
        <span className={`material-symbols-outlined ${config.iconCls}`}>check_circle</span>
      </div>
      <div className={`text-3xl font-bold uppercase leading-tight ${config.textCls}`}>{config.label}</div>
    </div>
  );
}

function MetricCardsRow({ totalDeliveries, deliverySplit, incidents, performanceStatus }) {
  return (
    <div className="grid grid-cols-12 gap-4">
      <TotalDeliveriesCard {...totalDeliveries} />
      <DeliverySplitCard {...deliverySplit} />
      <ActiveIncidentsCard {...incidents} />
      <PerformanceStatusCard status={performanceStatus} />
    </div>
  );
}

export default MetricCardsRow;
