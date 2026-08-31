import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GoogleMap, useLoadScript, Marker, InfoWindow, Circle } from '@react-google-maps/api';
import { Navigation, Package, MapPin, Clock, Phone } from 'lucide-react';
import api from '../utils/api';

const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

const mapOptions = {
  disableDefaultUI: false,
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
};

// Helper function to extract coordinates from delivery
const getDeliveryCoords = (delivery) => {
  if (delivery.gpsLocation && delivery.gpsLocation.lat && delivery.gpsLocation.lng) {
    return { lat: delivery.gpsLocation.lat, lng: delivery.gpsLocation.lng };
  }
  
  if (delivery.coordinates && delivery.coordinates.lat && delivery.coordinates.lng) {
    return { lat: delivery.coordinates.lat, lng: delivery.coordinates.lng };
  }
  
  return null;
};

// Format time helper
const formatTime = (time) => {
  if (!time) return 'Not scheduled';
  const date = new Date(time);
  return date.toLocaleTimeString('en-US', { 
    hour: '2-digit', 
    minute: '2-digit',
    hour12: true 
  });
};

const DriverDeliveryMap = ({ 
  deliveries = [], 
  driverLocation = null,
  selectedDelivery = null,
  onDeliverySelect = () => {},
  onNavigateToDelivery = () => {},
  onCallCustomer = () => {}
}) => {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: GOOGLE_MAPS_API_KEY
  });
  
  const mapRef = useRef(null);
  const [activeMarker, setActiveMarker] = useState(null);
  const [center, setCenter] = useState({ lat: 25.2048, lng: 55.2708 }); // Dubai default
  const [geocodedCoords, setGeocodedCoords] = useState({}); // cache by delivery _id
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [manualTargetId, setManualTargetId] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');
  const [manualHint, setManualHint] = useState('Select a delivery, then tap the map to place the pin');
  const [pendingPin, setPendingPin] = useState(null); // { lat, lng }

  // Geocode addresses missing coordinates (limited batch to avoid quota issues)
  useEffect(() => {
    if (!isLoaded || !window.google || !window.google.maps) return;

    const geocoder = new window.google.maps.Geocoder();
    const missing = deliveries
      .filter(d => d && d.address && d._id && !getDeliveryCoords(d) && !geocodedCoords[d._id]);

    if (missing.length === 0) return;

    const toProcess = missing.slice(0, 5); // limit per batch
    let cancelled = false;
    setIsGeocoding(true);

    const processNext = (idx) => {
      if (cancelled || idx >= toProcess.length) {
        setIsGeocoding(false);
        return;
      }

      const delivery = toProcess[idx];
      geocoder.geocode({ address: delivery.address }, (results, status) => {
        if (!cancelled && status === 'OK' && results && results[0]) {
          const loc = results[0].geometry.location;
          setGeocodedCoords(prev => ({
            ...prev,
            [delivery._id]: { lat: loc.lat(), lng: loc.lng() }
          }));
          // Persist to backend so we don't geocode again later
          api.post(`/deliveries/${delivery._id}/manual-coords`, {
            lat: loc.lat(),
            lng: loc.lng(),
            mapsUrl: delivery.mapsUrl || delivery.gpsLocation?.link,
            address: delivery.address
          }).catch(() => {});
        }
        processNext(idx + 1);
      });
    };

    processNext(0);
    return () => { cancelled = true; };
  }, [deliveries, geocodedCoords, isLoaded]);

  const getCoordsWithFallback = useCallback((delivery) => {
    if (!delivery) return null;
    const direct = getDeliveryCoords(delivery);
    if (direct) return direct;
    if (delivery._id && geocodedCoords[delivery._id]) return geocodedCoords[delivery._id];
    return null;
  }, [geocodedCoords]);

  const handleMapClickForManual = useCallback(async (e) => {
    if (manualSaving) return;
    if (!manualTargetId) {
      setManualError('Select a delivery to pin first');
      return;
    }
    setManualError('');
    const latLng = e.latLng;
    if (!latLng) return;
    const lat = latLng.lat();
    const lng = latLng.lng();
    setPendingPin({ lat, lng });
    setManualHint('Preview placed. Confirm to save.');
  }, [manualTargetId, manualSaving]);

  const handleConfirmPendingPin = useCallback(async () => {
    if (!pendingPin || !manualTargetId) return;
    try {
      setManualSaving(true);
      await api.post(`/deliveries/${manualTargetId}/manual-coords`, {
        lat: pendingPin.lat,
        lng: pendingPin.lng
      });
      setGeocodedCoords(prev => ({ ...prev, [manualTargetId]: { lat: pendingPin.lat, lng: pendingPin.lng } }));
      setManualHint('Saved. Select another delivery to pin if needed.');
      setManualTargetId('');
      setPendingPin(null);
    } catch (err) {
      setManualError(err?.response?.data?.message || 'Failed to save location');
    } finally {
      setManualSaving(false);
    }
  }, [pendingPin, manualTargetId]);

  const handleCancelPendingPin = useCallback(() => {
    setPendingPin(null);
    setManualHint('Select a delivery, then tap the map to place the pin');
  }, []);

  // Calculate map center based on available data
  useEffect(() => {
    if (driverLocation && driverLocation.lat && driverLocation.lng) {
      setCenter({ lat: driverLocation.lat, lng: driverLocation.lng });
    } else {
      const deliveriesWithCoords = deliveries.filter(d => getCoordsWithFallback(d) !== null);
      if (deliveriesWithCoords.length > 0) {
        const coords = getCoordsWithFallback(deliveriesWithCoords[0]);
        if (coords) setCenter(coords);
      }
    }
  }, [driverLocation, deliveries, getCoordsWithFallback]);

  // Fit bounds when deliveries or driver location changes
  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
    
    if (!window.google || !window.google.maps) return;
    
    const bounds = new window.google.maps.LatLngBounds();
    let hasValidBounds = false;

    if (driverLocation && driverLocation.lat && driverLocation.lng) {
      bounds.extend({ lat: driverLocation.lat, lng: driverLocation.lng });
      hasValidBounds = true;
    }

    deliveries.forEach(delivery => {
      const coords = getCoordsWithFallback(delivery);
      if (coords) {
        bounds.extend(coords);
        hasValidBounds = true;
      }
    });

    if (hasValidBounds) {
      map.fitBounds(bounds);
      // Ensure we don't zoom in too much
      const listener = window.google.maps.event.addListener(map, 'idle', () => {
        if (map.getZoom() > 15) map.setZoom(15);
        window.google.maps.event.removeListener(listener);
      });
    }
  }, [deliveries, driverLocation, getCoordsWithFallback]);

  // Center on selected delivery
  useEffect(() => {
    if (selectedDelivery && mapRef.current) {
      const coords = getCoordsWithFallback(selectedDelivery);
      if (coords) {
        mapRef.current.panTo(coords);
        mapRef.current.setZoom(16);
        setActiveMarker(selectedDelivery._id);
      }
    }
  }, [selectedDelivery, getCoordsWithFallback]);

  const deliveriesWithCoords = deliveries.filter(delivery => getCoordsWithFallback(delivery) !== null);
  const deliveriesMissingCoords = deliveries.filter(delivery => getCoordsWithFallback(delivery) === null && delivery.address);

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center p-6">
          <MapPin className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <p className="text-red-600 font-medium">Error loading maps</p>
          <p className="text-gray-500 text-sm mt-2">Please check your internet connection</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center p-6">
          <MapPin className="w-16 h-16 text-blue-400 mx-auto mb-4 animate-pulse" />
          <p className="text-gray-600 font-medium">Loading maps...</p>
        </div>
      </div>
    );
  }

  if (deliveriesWithCoords.length === 0 && !driverLocation) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center p-6">
          <MapPin className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">No delivery locations available</p>
          <p className="text-gray-500 text-sm mt-2">Deliveries will appear here once they have GPS coordinates</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      {deliveriesMissingCoords.length > 0 && (
        <div className="absolute top-4 right-4 bg-white shadow-lg rounded-lg p-3 z-[1100] w-80">
          <p className="text-sm font-semibold text-gray-900 mb-2">Missing locations ({deliveriesMissingCoords.length})</p>
          <p className="text-xs text-gray-600 mb-2">Select a delivery, then tap the map to drop the pin.</p>
          <select
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-2"
            value={manualTargetId}
            onChange={(e) => {
              setManualTargetId(e.target.value);
              setManualHint('Tap the map to place the pin');
              setManualError('');
              setPendingPin(null);
            }}
          >
            <option value="">Select delivery to pin</option>
            {deliveriesMissingCoords.map(d => (
              <option key={d._id} value={d._id}>
                {d.customerName} - {d.address?.slice(0, 40)}
              </option>
            ))}
          </select>
          {manualError && <p className="text-xs text-red-600 mb-1">{manualError}</p>}
          <p className="text-xs text-gray-700 mb-2">{manualSaving ? 'Saving pin...' : manualHint}</p>
          {pendingPin && (
            <div className="flex items-center gap-2 text-xs text-gray-700 mb-2">
              <span className="font-semibold">Preview:</span>
              <span>{pendingPin.lat.toFixed(5)}, {pendingPin.lng.toFixed(5)}</span>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={!pendingPin || manualSaving || !manualTargetId}
              onClick={handleConfirmPendingPin}
              className="flex-1 bg-blue-600 text-white text-sm font-medium py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              type="button"
              disabled={!pendingPin || manualSaving}
              onClick={handleCancelPendingPin}
              className="px-3 py-2 bg-gray-200 text-gray-800 text-sm font-medium rounded-lg hover:bg-gray-300 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <GoogleMap
        mapContainerStyle={mapContainerStyle}
        center={center}
        zoom={13}
        onLoad={onMapLoad}
        onClick={handleMapClickForManual}
        options={mapOptions}
      >
          {/* Pending pin preview */}
          {pendingPin && (
            <Marker
              position={pendingPin}
              icon={{
                path: window.google.maps.SymbolPath.CIRCLE,
                scale: 8,
                fillColor: '#f97316',
                fillOpacity: 0.9,
                strokeColor: '#fff',
                strokeWeight: 2,
              }}
              title="Pending pin"
            />
          )}
          {/* Driver's current location */}
          {driverLocation && driverLocation.lat && driverLocation.lng && window.google && window.google.maps && (
            <>
              <Marker
                position={{ lat: driverLocation.lat, lng: driverLocation.lng }}
                icon={{
                  path: window.google.maps.SymbolPath.CIRCLE,
                  scale: 10,
                  fillColor: '#f97316',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 3,
                }}
                title="Your Location"
              />
              
              {driverLocation.accuracy && (
                <Circle
                  center={{ lat: driverLocation.lat, lng: driverLocation.lng }}
                  radius={driverLocation.accuracy}
                  options={{
                    fillColor: '#f97316',
                    fillOpacity: 0.1,
                    strokeColor: '#f97316',
                    strokeOpacity: 0.3,
                    strokeWeight: 1,
                  }}
                />
              )}
            </>
          )}

          {/* Delivery markers */}
          {deliveriesWithCoords.map((delivery, index) => {
            const coords = getCoordsWithFallback(delivery);
            if (!coords) return null;

            const isCurrent = selectedDelivery && selectedDelivery._id === delivery._id;
            
            return (
              <Marker
                key={delivery._id || index}
                position={coords}
                onClick={() => {
                  setActiveMarker(delivery._id);
                  onDeliverySelect(delivery);
                }}
                icon={{
                  path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
                  scale: 6,
                  fillColor: isCurrent ? '#22c55e' : '#3b82f6',
                  fillOpacity: 1,
                  strokeColor: '#fff',
                  strokeWeight: 2,
                  rotation: 180,
                }}
                title={delivery.customerName || 'Delivery'}
              >
                {activeMarker === delivery._id && (
                  <InfoWindow
                    position={coords}
                    onCloseClick={() => setActiveMarker(null)}
                  >
                    <div className="p-2 min-w-[200px]">
                      <div className="flex items-start gap-2 mb-3">
                        <Package className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <p className="font-bold text-gray-900 text-base">
                            {delivery.customerName || 'Customer'}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {delivery.bagId || delivery._id}
                          </p>
                        </div>
                      </div>

                      {delivery.address && (
                        <div className="flex items-start gap-2 mb-2">
                          <MapPin className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
                          <p className="text-sm text-gray-700">{delivery.address}</p>
                        </div>
                      )}

                      {delivery.scheduledTime && (
                        <div className="flex items-center gap-2 mb-3">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <p className="text-sm text-gray-700">{formatTime(delivery.scheduledTime)}</p>
                        </div>
                      )}

                      {delivery.phone && (
                        <div className="flex items-center gap-2 mb-3">
                          <Phone className="w-4 h-4 text-gray-500" />
                          <p className="text-sm text-gray-700">{delivery.phone}</p>
                        </div>
                      )}

                      <div className="flex gap-2 mt-3">
                        {delivery.phone && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onCallCustomer(delivery.phone);
                            }}
                            className="flex-1 bg-green-500 text-white py-2 px-3 rounded-lg text-xs font-medium hover:bg-green-600"
                          >
                            Call
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onNavigateToDelivery(delivery);
                          }}
                          className="flex-1 bg-blue-500 text-white py-2 px-3 rounded-lg text-xs font-medium hover:bg-blue-600 flex items-center justify-center gap-1"
                        >
                          <Navigation className="w-3 h-3" />
                          Navigate
                        </button>
                      </div>
                    </div>
                  </InfoWindow>
                )}
              </Marker>
            );
          })}
      </GoogleMap>
      
      {/* Info Badge */}
      {deliveriesWithCoords.length > 0 && (
        <div className="absolute top-4 left-4 bg-white rounded-lg shadow-lg px-3 py-2 z-[1000]">
          <p className="text-sm font-semibold text-gray-900">
            {deliveriesWithCoords.length} {deliveriesWithCoords.length === 1 ? 'Delivery' : 'Deliveries'}
          </p>
        </div>
      )}

      {isGeocoding && (
        <div className="absolute top-4 right-4 bg-white rounded-lg shadow-lg px-3 py-2 z-[1000] text-sm text-gray-700">
          Geocoding addresses...
        </div>
      )}

      {/* Recenter button */}
      {(deliveriesWithCoords.length > 0 || driverLocation) && mapRef.current && window.google && window.google.maps && (
        <button
          onClick={() => {
            if (!mapRef.current || !window.google || !window.google.maps) return;
            
            const bounds = new window.google.maps.LatLngBounds();
            let hasValidBounds = false;

            if (driverLocation && driverLocation.lat && driverLocation.lng) {
              bounds.extend({ lat: driverLocation.lat, lng: driverLocation.lng });
              hasValidBounds = true;
            }

            deliveriesWithCoords.forEach(delivery => {
              const coords = getCoordsWithFallback(delivery);
              if (coords) {
                bounds.extend(coords);
                hasValidBounds = true;
              }
            });

            if (hasValidBounds) {
              mapRef.current.fitBounds(bounds);
              setTimeout(() => {
                if (mapRef.current && mapRef.current.getZoom() > 15) {
                  mapRef.current.setZoom(15);
                }
              }, 100);
            }
          }}
          className="absolute bottom-4 right-4 bg-blue-500 text-white p-3 rounded-full shadow-lg hover:bg-blue-600 z-[1000]"
        >
          <Navigation className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export default DriverDeliveryMap;
