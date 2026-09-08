import React, { useState } from 'react';
import { Repeat, MapPin, Phone, Navigation, Package, CheckCircle } from 'lucide-react';
import api from '../../utils/api';

const displayName = (u) => [u?.profile?.firstName, u?.profile?.lastName].filter(Boolean).join(' ') || 'Driver';

// Planned times are seconds from shift start (the optimizer doesn't know the
// clock time a shift begins), so show them as an offset into the shift.
const formatShiftOffset = (s) => (s == null ? '—' : `+${Math.floor(s / 3600)}h${String(Math.round((s % 3600) / 60)).padStart(2, '0')}`);

const STATUS_LABEL = {
  planned: 'Planned',
  van_arrived: 'Van has arrived',
  bike_arrived: 'Bike has arrived',
  completed: 'Handoff done',
  cancelled: 'Cancelled'
};

/**
 * A van↔bike meeting shown in the driver's route. The bike collects its
 * second trip's bags here; the van hands them over. Either driver taps
 * "I've arrived" independently, and whoever finishes the transfer taps done.
 *
 * @param {object} props.handoff  populated Handoff doc from /deliveries/driver/today
 * @param {string} props.currentUserId
 * @param {boolean} props.due     true once this is the driver's next thing to do
 * @param {() => void} props.onChanged  called after a status update succeeds
 */
export default function HandoffCard({ handoff, currentUserId, due, onChanged }) {
  const isKitchenReturn = handoff.type === 'kitchen_return';
  const isBike = String(handoff.bike?._id ?? handoff.bike) === String(currentUserId);
  const counterpart = isKitchenReturn ? null : (isBike ? handoff.van : handoff.bike);
  const bags = Array.isArray(handoff.deliveryIds) ? handoff.deliveryIds : [];
  const mp = handoff.meetingPoint || {};
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const myArrivedStatus = isBike ? 'bike_arrived' : 'van_arrived';
  const done = handoff.status === 'completed';
  const iHaveArrived = done || handoff.status === myArrivedStatus;
  const mapsHref = Number.isFinite(mp.lat) && Number.isFinite(mp.lng)
    ? `https://www.google.com/maps/dir/?api=1&destination=${mp.lat},${mp.lng}`
    : null;
  const phone = counterpart?.profile?.phone;

  const setStatus = async (status) => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/handoffs/${handoff._id}/status`, { status });
      onChanged?.();
    } catch (err) {
      setError(err.response?.data?.message || 'Could not update the handoff.');
    } finally {
      setBusy(false);
    }
  };

  const whenLabel = isKitchenReturn
    ? (due ? 'Next: ride back to the kitchen for trip 2' : 'Later: after your first 20 stops')
    : due
      ? (isBike ? 'Next: collect your trip-2 bags' : 'Next: hand over bags')
      : (isBike
        ? 'Later: after your first 20 stops'
        : `Later: after stop ${(handoff.vanAfterRouteOrder ?? 0) + 1}`);

  return (
    <div className={`rounded-lg border p-3 ${done ? 'bg-emerald-50 border-emerald-200' : due ? 'bg-violet-50 border-violet-300' : 'bg-white border-violet-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex-shrink-0 w-7 h-7 rounded-full bg-violet-200 text-violet-800 flex items-center justify-center">
            <Repeat className="w-4 h-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {isKitchenReturn ? 'Return to the kitchen for trip 2' : (isBike ? `Meet van ${displayName(counterpart)}` : `Meet bike ${displayName(counterpart)}`)}
            </p>
            <p className="text-xs text-violet-700">{whenLabel}</p>
          </div>
        </div>
        <span className={`flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
          {STATUS_LABEL[handoff.status] || handoff.status}
        </span>
      </div>

      <p className="text-sm text-gray-700 flex items-start gap-1.5">
        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
        <span>{mp.name || (isKitchenReturn ? 'The kitchen' : 'Meeting point')}</span>
      </p>
      {isKitchenReturn ? (
        <p className="text-xs text-gray-500 mt-1 ml-5.5 pl-0.5">
          Adds about {Math.round((handoff.detourSeconds || 0) / 60)} min for the round trip and reload — no van needed.
        </p>
      ) : (
        <p className="text-xs text-gray-500 mt-1 ml-5.5 pl-0.5">
          You {formatShiftOffset(isBike ? handoff.plannedBikeArrivalSeconds : handoff.plannedVanArrivalSeconds)} into shift
          {' · '}{displayName(counterpart)} {formatShiftOffset(isBike ? handoff.plannedVanArrivalSeconds : handoff.plannedBikeArrivalSeconds)}
          {' · '}wait up to {Math.round((handoff.expectedWaitSeconds || 0) / 60)} min
          {mp.poiType === 'unsnapped' ? ' · at the van\'s stop — no petrol station/parking nearby' : ''}
        </p>
      )}

      <div className="mt-2 flex items-center gap-1.5 text-sm text-gray-700">
        <Package className="w-4 h-4 text-gray-400 flex-shrink-0" />
        <span>
          {bags.length} {bags.length === 1 ? 'bag' : 'bags'}{isKitchenReturn || isBike ? ' for your trip 2' : ` for ${displayName(counterpart)}`}
        </span>
      </div>
      {bags.length > 0 && (
        <ul className="mt-1 ml-5.5 pl-0.5 text-xs text-gray-600 space-y-0.5 max-h-28 overflow-y-auto">
          {bags.map((d) => (
            <li key={d._id || d}>• {d.customerName || d}</li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {mapsHref && (
          <a
            href={mapsHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold"
          >
            <Navigation className="w-3.5 h-3.5" /> Open in Maps
          </a>
        )}
        {phone && (
          <a
            href={`tel:${phone}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-300 text-gray-700 text-xs font-semibold"
          >
            <Phone className="w-3.5 h-3.5" /> Call {displayName(counterpart).split(' ')[0]}
          </a>
        )}
        {!done && isKitchenReturn && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setStatus('completed')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" /> Picked up trip 2
          </button>
        )}
        {!done && !isKitchenReturn && (
          <>
            <button
              type="button"
              disabled={busy || iHaveArrived}
              onClick={() => setStatus(myArrivedStatus)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              <MapPin className="w-3.5 h-3.5" /> {iHaveArrived ? 'Arrived' : "I've arrived"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setStatus('completed')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50"
            >
              <CheckCircle className="w-3.5 h-3.5" /> Handoff done
            </button>
          </>
        )}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
