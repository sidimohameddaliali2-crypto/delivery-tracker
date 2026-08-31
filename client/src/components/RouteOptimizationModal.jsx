import React, { useState } from 'react';
import { X, Route, MapPin, AlertTriangle, Loader2 } from 'lucide-react';
import api from '../utils/api';

const getDriverDisplayName = (driver) => {
  if (!driver) return 'Unnamed driver';
  const parts = [driver.profile?.firstName, driver.profile?.lastName].filter(Boolean);
  return parts.join(' ') || driver.email || 'Unnamed driver';
};

// Builds a single Google Maps multi-stop navigation link for a driver's
// ordered route — no Directions API needed, this is just a URL scheme
// Google Maps already supports. Google's URLs API caps this at 9 waypoints
// on desktop (only 3 on mobile browsers) — this is opened from the
// dispatcher's desktop preview, so 9 is the relevant ceiling. Beyond that,
// the link is left out rather than silently generating a broken/truncated
// one; the per-stop order in the list below still fully reflects the plan.
const MAX_WAYPOINTS_DESKTOP = 9;

const buildMultiStopMapsLink = (stops) => {
  if (!stops.length || stops.length > MAX_WAYPOINTS_DESKTOP + 1) return null;
  const encoded = stops.map((s) => encodeURIComponent(s.address || s.customerName || ''));
  const destination = encoded[encoded.length - 1];
  const waypoints = encoded.slice(0, -1).join('|');
  const params = new URLSearchParams({ api: '1', destination });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

export default function RouteOptimizationModal({ open, onClose, deliveries = [], drivers = [], onApplied }) {
  const [selectedDriverIds, setSelectedDriverIds] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState(null);

  if (!open) return null;

  const toggleDriver = (driverId) => {
    setSelectedDriverIds((prev) => (
      prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId]
    ));
  };

  const handleGenerate = async () => {
    if (selectedDriverIds.length === 0) {
      setError('Select at least one driver.');
      return;
    }
    setError('');
    setGenerating(true);
    setPlan(null);
    try {
      const res = await api.post('/deliveries/optimize-routes', {
        deliveryIds: deliveries.map((d) => d._id),
        driverIds: selectedDriverIds
      });
      setPlan(res.data?.data || null);
    } catch (err) {
      console.error('Optimize routes error:', err);
      setError(err.response?.data?.message || 'Failed to generate routes.');
    } finally {
      setGenerating(false);
    }
  };

  const handleApply = async () => {
    if (!plan) return;
    setError('');
    setApplying(true);
    try {
      const routes = plan.routes
        .filter((r) => r.stops.length > 0)
        .map((r) => ({
          driverId: r.driverId,
          stops: r.stops.map((s) => ({ deliveryId: s.deliveryId, routeOrder: s.routeOrder }))
        }));
      await api.post('/deliveries/optimize-routes/apply', { routes });
      onApplied?.();
      handleClose();
    } catch (err) {
      console.error('Apply route plan error:', err);
      setError(err.response?.data?.message || 'Failed to apply the route plan.');
    } finally {
      setApplying(false);
    }
  };

  const handleClose = () => {
    setSelectedDriverIds([]);
    setPlan(null);
    setError('');
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Route className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Optimize Routes</h2>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-sm text-gray-500">
            {deliveries.length} selected {deliveries.length === 1 ? 'delivery' : 'deliveries'} — pick which drivers
            to split them across, then generate an optimized route for each.
          </p>

          {!plan && (
            <>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Drivers</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {drivers.map((driver) => (
                    <label
                      key={driver._id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${
                        selectedDriverIds.includes(driver._id)
                          ? 'bg-blue-50 border-blue-300 text-blue-900'
                          : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDriverIds.includes(driver._id)}
                        onChange={() => toggleDriver(driver._id)}
                        className="accent-blue-600"
                      />
                      {getDriverDisplayName(driver)}
                    </label>
                  ))}
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
                {generating ? 'Generating routes…' : 'Generate Routes'}
              </button>
            </>
          )}

          {plan && (
            <>
              {plan.unresolvedDeliveries?.length > 0 && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    {plan.unresolvedDeliveries.length} {plan.unresolvedDeliveries.length === 1 ? 'delivery has' : 'deliveries have'} no
                    resolvable address/location and were left out of this plan:{' '}
                    {plan.unresolvedDeliveries.map((d) => d.customerName || d.id).join(', ')}
                  </span>
                </div>
              )}

              <div className="space-y-4">
                {plan.routes.map((route) => {
                  const mapsLink = buildMultiStopMapsLink(route.stops);
                  return (
                    <div key={route.driverId} className="border border-gray-200 rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
                        <span className="font-semibold text-gray-900">{route.driverName}</span>
                        <span className="text-xs text-gray-500">
                          {route.stops.length} {route.stops.length === 1 ? 'stop' : 'stops'}
                        </span>
                      </div>
                      {route.stops.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-gray-400">No stops assigned.</p>
                      ) : (
                        <>
                          <ol className="divide-y divide-gray-100">
                            {route.stops.map((stop) => (
                              <li key={stop.deliveryId} className="flex items-start gap-3 px-4 py-2.5 text-sm">
                                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center mt-0.5">
                                  {stop.routeOrder + 1}
                                </span>
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-900 truncate">{stop.customerName || 'Unknown customer'}</p>
                                  <p className="text-gray-500 truncate flex items-center gap-1">
                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                    {stop.address || '—'}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ol>
                          {mapsLink ? (
                            <a
                              href={mapsLink}
                              target="_blank"
                              rel="noreferrer"
                              className="block px-4 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 border-t border-gray-100"
                            >
                              Open full route in Google Maps →
                            </a>
                          ) : route.stops.length > MAX_WAYPOINTS_DESKTOP + 1 ? (
                            <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                              Too many stops ({route.stops.length}) for a single Google Maps link — navigate stop by
                              stop instead, in the order shown above.
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => setPlan(null)}
                  className="px-4 py-2.5 bg-white border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50"
                >
                  Back
                </button>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
                >
                  {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Route className="w-4 h-4" />}
                  {applying ? 'Applying…' : 'Apply Routes'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
