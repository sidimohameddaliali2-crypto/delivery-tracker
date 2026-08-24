import React from 'react';

function EfficiencyTile({ icon, label, value, unit, trend, trendUp, trendLabel, tone }) {
  return (
    <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
      <div className="flex items-center gap-2 mb-2">
        <span className={`material-symbols-outlined ${tone === 'error' ? 'text-red-500' : 'text-blue-600'}`}>{icon}</span>
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</h4>
      </div>
      <div className="text-3xl font-bold text-gray-900">
        {value} {unit && <span className="text-lg font-semibold text-gray-500">{unit}</span>}
      </div>
      {trendLabel && (
        <p className={`text-sm mt-2 flex items-center gap-1 ${trendUp ? 'text-emerald-600' : 'text-red-600'}`}>
          <span className="material-symbols-outlined text-sm">{trendUp ? 'trending_up' : 'trending_down'}</span>
          {trendLabel}
        </p>
      )}
    </div>
  );
}

function EfficiencyPairCard({ tone, label, value, volumeLabel, volume }) {
  const positive = tone !== 'error';
  return (
    <div className={`rounded-xl border p-3 flex flex-col gap-2 ${positive ? 'bg-emerald-50/50 border-emerald-200' : 'bg-red-50/50 border-red-200'}`}>
      <h4 className={`text-[10px] font-semibold uppercase tracking-wide ${positive ? 'text-emerald-700' : 'text-red-700'}`}>{label}</h4>
      <div className="text-2xl font-bold text-gray-900">
        {value} <span className="text-sm font-semibold text-gray-500">mins</span>
      </div>
      <div className={`mt-1 pt-2 border-t flex justify-between items-center ${positive ? 'border-emerald-100' : 'border-red-100'}`}>
        <span className="text-xs text-gray-500">{volumeLabel}</span>
        <span className="text-sm font-semibold text-gray-900">{volume}</span>
      </div>
    </div>
  );
}

function DeliveryEfficiencyCard({ avgEarlyTime, earlyVolume, avgLateTime, lateVolume, earlyTrend, lateTrend }) {
  return (
    <div className="col-span-12 lg:col-span-7 bg-white border border-gray-200 rounded-xl p-4 sm:p-5">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 sm:mb-6">Delivery Efficiency</h3>

      {/* Mobile: two combined average+volume cards, matching the mobile design */}
      <div className="grid grid-cols-2 gap-3 sm:hidden">
        <EfficiencyPairCard tone="success" label="Average Early" value={avgEarlyTime} volumeLabel="Total Vol" volume={earlyVolume.toLocaleString()} />
        <EfficiencyPairCard tone="error" label="Average Late" value={avgLateTime} volumeLabel="Total Vol" volume={lateVolume.toLocaleString()} />
      </div>

      {/* Tablet/desktop: 4 separate tiles with trend indicators */}
      <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 gap-4">
        <EfficiencyTile
          icon="schedule"
          label="Average Early Time"
          value={avgEarlyTime}
          unit="mins"
          trendLabel={earlyTrend?.label}
          trendUp={earlyTrend?.up}
        />
        <EfficiencyTile icon="inventory_2" label="Total Early Volume" value={earlyVolume.toLocaleString()} />
        <EfficiencyTile
          icon="schedule"
          label="Average Late Time"
          value={avgLateTime}
          unit="mins"
          tone="error"
          trendLabel={lateTrend?.label}
          trendUp={lateTrend?.up}
        />
        <EfficiencyTile icon="inventory_2" label="Total Late Volume" value={lateVolume.toLocaleString()} tone="error" />
      </div>
    </div>
  );
}

export default DeliveryEfficiencyCard;
