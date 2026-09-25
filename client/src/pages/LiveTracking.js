import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { load } from '@2gis/mapgl';
import { RefreshCw, Truck, AlertTriangle } from 'lucide-react';
import api from '../utils/api';

// Live vehicle GPS tracking (owner, 2026-09-24) — real-time positions from
// the Truckoom "Trace" fleet API (server/services/truckoomApiService.js),
// separate from the driver app's own phone-GPS tracking. Polls every
// REFRESH_INTERVAL_MS while this page is open, matching Truckoom's own
// documented ~1-minute request interval for this kind of call.

let mapglLoadPromise = null;
function loadMapglOnce() {
  if (!mapglLoadPromise) mapglLoadPromise = load();
  return mapglLoadPromise;
}
const API_KEY = process.env.REACT_APP_2GIS_API_KEY || '';
const DUBAI_CENTER = [55.2708, 25.2048]; // MapGL uses [lng, lat]
const MAP_ID = 'live-tracking-map-2gis';
const REFRESH_INTERVAL_MS = 60 * 1000;

const safeDestroy = (obj) => { try { obj?.destroy(); } catch (_) { /* already gone */ } };
function destroyMapSuppressingSdkNoise(map) {
  if (!map) return;
  const onRejection = (e) => { if (e.reason === undefined) e.preventDefault(); };
  window.addEventListener('unhandledrejection', onRejection);
  setTimeout(() => window.removeEventListener('unhandledrejection', onRejection), 500);
  safeDestroy(map);
}

function vehicleMarkerHtml(vehicle, isActive) {
  const color = vehicle.driver?.colorCode || '#9CA3AF';
  const label = vehicle.driver ? vehicle.driver.name : `Vehicle ${vehicle.vehicleNo}`;
  return `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;${isActive ? 'z-index:20;' : ''}">
      <div style="background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4);border-radius:9999px;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:15px;">🚚</div>
      <div style="margin-top:2px;background:white;border-radius:6px;padding:1px 6px;font-size:11px;font-weight:600;color:#111827;box-shadow:0 1px 3px rgba(0,0,0,0.3);white-space:nowrap;">${label}</div>
    </div>
  `;
}

function timeAgo(iso) {
  if (!iso) return '';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

const LiveTracking = () => {
  const [vehicles, setVehicles] = useState([]);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeVehicleNo, setActiveVehicleNo] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState('');

  const mapRef = useRef(null);
  const mapglRef = useRef(null);
  const markersRef = useRef([]);

  const fetchVehicles = useCallback(async () => {
    try {
      setError('');
      const res = await api.get('/truckoom/vehicles');
      setVehicles(res.data?.data || []);
      setFetchedAt(res.data?.fetchedAt || new Date().toISOString());
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load vehicle data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchVehicles();
    const interval = setInterval(fetchVehicles, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchVehicles]);

  // Map setup — once.
  useEffect(() => {
    if (!API_KEY) return undefined;
    let cancelled = false;
    loadMapglOnce()
      .then((mapgl) => {
        if (cancelled) return;
        if (typeof mapgl.isSupported === 'function' && !mapgl.isSupported()) {
          setMapError('This browser cannot render the 2GIS map (WebGL is unavailable).');
          return;
        }
        const container = document.getElementById(MAP_ID);
        if (!container) return;
        mapglRef.current = mapgl;
        mapRef.current = new mapgl.Map(container, { center: DUBAI_CENTER, zoom: 11, key: API_KEY });
        setMapReady(true);
      })
      .catch((err) => {
        mapglLoadPromise = null;
        if (!cancelled) setMapError(err?.message || 'Failed to load the 2GIS map script.');
      });
    return () => {
      cancelled = true;
      markersRef.current.forEach(safeDestroy);
      markersRef.current = [];
      destroyMapSuppressingSdkNoise(mapRef.current);
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  const locatedVehicles = useMemo(
    () => vehicles.filter((v) => Number.isFinite(v.latitude) && Number.isFinite(v.longitude)),
    [vehicles]
  );

  // Markers — redrawn whenever the vehicle list refreshes.
  useEffect(() => {
    const map = mapRef.current;
    const mapgl = mapglRef.current;
    if (!mapReady || !map || !mapgl) return;
    markersRef.current.forEach(safeDestroy);
    markersRef.current = [];

    locatedVehicles.forEach((v) => {
      const marker = new mapgl.HtmlMarker(map, {
        coordinates: [v.longitude, v.latitude],
        html: vehicleMarkerHtml(v, activeVehicleNo === v.vehicleNo),
        anchor: [15, 15],
        zIndex: activeVehicleNo === v.vehicleNo ? 20 : 10,
      });
      marker.getContent().addEventListener('click', () => setActiveVehicleNo(v.vehicleNo));
      markersRef.current.push(marker);
    });
  }, [mapReady, locatedVehicles, activeVehicleNo]);

  const panToVehicle = (v) => {
    setActiveVehicleNo(v.vehicleNo);
    if (mapRef.current && Number.isFinite(v.latitude) && Number.isFinite(v.longitude)) {
      mapRef.current.setCenter([v.longitude, v.latitude]);
      mapRef.current.setZoom(14);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-600" />
            Live Tracking
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Real GPS from Truckoom — {locatedVehicles.length} of {vehicles.length} vehicles reporting a location
            {fetchedAt && <span className="text-gray-400"> · updated {timeAgo(fetchedAt)}</span>}
          </p>
        </div>
        <button
          onClick={fetchVehicles}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Vehicle list */}
        <div className="w-80 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          {vehicles.length === 0 && !loading ? (
            <p className="p-4 text-sm text-gray-400">No vehicles found.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {vehicles.map((v) => (
                <li key={v.vehicleNo}>
                  <button
                    onClick={() => panToVehicle(v)}
                    disabled={!Number.isFinite(v.latitude)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      activeVehicleNo === v.vehicleNo ? 'bg-blue-50' : ''
                    }`}
                  >
                    <span
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0"
                      style={{ backgroundColor: v.driver?.colorCode || '#9CA3AF' }}
                    >
                      🚚
                    </span>
                    <span className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {v.driver ? v.driver.name : 'Unassigned vehicle'}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {v.vehicleNo}{v.deviceName ? ` · ${v.deviceName}` : ''}
                      </p>
                      {!Number.isFinite(v.latitude) && (
                        <p className="text-xs text-amber-600 mt-0.5">No location reported</p>
                      )}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Map */}
        <div className="flex-1 relative">
          {!API_KEY ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-gray-500">
              Add <span className="font-mono">REACT_APP_2GIS_API_KEY</span> to <span className="font-mono">client/.env</span> to show the map.
            </div>
          ) : mapError ? (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-red-600">{mapError}</div>
          ) : (
            <div id={MAP_ID} className="absolute inset-0" />
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveTracking;
