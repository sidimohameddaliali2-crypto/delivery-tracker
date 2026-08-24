import React, { useMemo, useState } from 'react';

function buildZoneStats(lateEarlyDeliveries) {
  const zoneStats = {};
  (lateEarlyDeliveries || []).forEach((d) => {
    const zone = d.zone || d.area || 'Unassigned';
    if (!zoneStats[zone]) zoneStats[zone] = { early: 0, onTime: 0, late: 0 };
    if (d.deliveryType === 'early') zoneStats[zone].early += 1;
    else if (d.deliveryType === 'late') zoneStats[zone].late += 1;
    else zoneStats[zone].onTime += 1;
  });
  return Object.entries(zoneStats)
    .map(([zone, counts]) => {
      const total = counts.early + counts.onTime + counts.late;
      const otdPct = total ? Math.round(((counts.early + counts.onTime) / total) * 100) : 0;
      return { zone, ...counts, total, otdPct };
    })
    .sort((a, b) => b.total - a.total);
}

function ZoneBar({ zone, early, onTime, late, total, otdPct }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-900 font-medium">{zone}</span>
        <span className="text-gray-500">{otdPct}% OTD</span>
      </div>
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden flex">
        <div className="bg-yellow-500 h-full" style={{ width: `${total ? (early / total) * 100 : 0}%` }} />
        <div className="bg-emerald-500 h-full" style={{ width: `${total ? (onTime / total) * 100 : 0}%` }} />
        <div className="bg-red-500 h-full" style={{ width: `${total ? (late / total) * 100 : 0}%` }} />
      </div>
    </div>
  );
}

function ZoneLegend() {
  return (
    <div className="flex gap-3 justify-center mt-4 pt-2 border-t border-gray-100">
      <div className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded bg-yellow-500" /> Early</div>
      <div className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded bg-emerald-500" /> On-Time</div>
      <div className="flex items-center gap-1 text-xs text-gray-500"><span className="w-2 h-2 rounded bg-red-500" /> Late</div>
    </div>
  );
}

function AllZonesModal({ zones, onClose }) {
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">Zone Performance — All Zones</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 overflow-y-auto space-y-4">
          {zones.map((z) => <ZoneBar key={z.zone} {...z} />)}
        </div>
        <div className="px-6 pb-4 flex-shrink-0">
          <ZoneLegend />
        </div>
      </div>
    </div>
  );
}

function ZonePerformanceCard({ lateEarlyDeliveries }) {
  const zones = useMemo(() => buildZoneStats(lateEarlyDeliveries), [lateEarlyDeliveries]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="col-span-12 lg:col-span-4 bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-gray-900">Zone Performance</h3>
        {zones.length > 0 && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="text-blue-600 font-medium text-sm hover:underline"
          >
            View All
          </button>
        )}
      </div>
      {zones.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-8">No zone data for this range.</div>
      ) : (
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="w-full text-left space-y-4 cursor-pointer"
        >
          {zones.slice(0, 6).map((z) => <ZoneBar key={z.zone} {...z} />)}
          <ZoneLegend />
        </button>
      )}

      {isModalOpen && <AllZonesModal zones={zones} onClose={() => setIsModalOpen(false)} />}
    </div>
  );
}

export default ZonePerformanceCard;
