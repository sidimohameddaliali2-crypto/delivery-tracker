import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Tooltip } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { motion } from 'framer-motion';
import { 
  RefreshCw, 
  Navigation, 
  User, 
  Package,
  Clock,
  MapPin
} from 'lucide-react';
import { fetchDriverLocations } from '../store/slices/driverSlice';

// Fix for default markers in react-leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons
const createDriverIcon = (status) => {
  const color = status === 'available' ? 'green' : status === 'busy' ? 'orange' : 'gray';
  
  return new L.DivIcon({
    html: `
      <div class="relative">
        <div class="w-8 h-8 bg-${color}-500 rounded-full border-2 border-white shadow-lg flex items-center justify-center">
          <svg class="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clip-rule="evenodd" />
          </svg>
        </div>
        <div class="absolute -top-1 -right-1 w-3 h-3 bg-${color}-500 rounded-full border border-white"></div>
      </div>
    `,
    className: 'driver-marker',
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

const LiveMap = () => {
  const dispatch = useDispatch();
  const { driverLocations, isLoading } = useSelector(state => state.driver);
  const [map, setMap] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [isMapInteractive, setIsMapInteractive] = useState(false);
  const defaultCenter = useMemo(() => [40.7128, -74.006], []);
  const refreshInterval = useRef(null);
  const hasAutoFitRef = useRef(false);

  const normalizeCoordinate = (value) => {
    if (value === null || value === undefined) return null;
    const numeric = typeof value === 'string' ? parseFloat(value) : Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const safeDriverLocations = useMemo(() => {
    if (!Array.isArray(driverLocations)) return [];
    return driverLocations.filter(Boolean);
  }, [driverLocations]);

  const driversWithCoordinates = useMemo(
    () =>
      safeDriverLocations
        .map((driver) => {
          if (!driver || !driver.location) return null;
          const latitude = normalizeCoordinate(driver.location.latitude);
          const longitude = normalizeCoordinate(driver.location.longitude);
          if (latitude === null || longitude === null) return null;

          return {
            ...driver,
            location: {
              ...driver.location,
              latitude,
              longitude,
            },
          };
        })
        .filter(Boolean),
    [safeDriverLocations]
  );

  const latestUpdate = useMemo(() => {
    let latest = null;
    driversWithCoordinates.forEach((driver) => {
      const value = driver.location?.lastUpdated;
      if (!value) return;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return;
      if (!latest || date > latest) {
        latest = date;
      }
    });
    return latest;
  }, [driversWithCoordinates]);

  useEffect(() => {
    loadDriverLocations();

    if (autoRefresh) {
      refreshInterval.current = setInterval(() => {
        loadDriverLocations();
      }, 30000); // Refresh every 30 seconds
    }

    return () => {
      if (refreshInterval.current) {
        clearInterval(refreshInterval.current);
      }
    };
  }, [autoRefresh]);

  const loadDriverLocations = () => {
    dispatch(fetchDriverLocations());
  };

  const handleRefresh = () => {
    loadDriverLocations();
  };

  const handleAutoRefreshToggle = () => {
    setAutoRefresh(!autoRefresh);
  };

  useEffect(() => {
    if (!map) return;
    const toggle = isMapInteractive ? 'enable' : 'disable';
    map.dragging[toggle]();
    map.scrollWheelZoom[toggle]();
    map.doubleClickZoom[toggle]();
    map.boxZoom[toggle]();
    map.keyboard[toggle]();
    if (map.touchZoom) map.touchZoom[toggle]();
  }, [map, isMapInteractive]);

  const handleMapInteractionToggle = () => {
    setIsMapInteractive(prev => !prev);
  };

  const fitMapToDrivers = () => {
    if (map && driversWithCoordinates.length > 0) {
      const group = new L.FeatureGroup(
        driversWithCoordinates.map(driver =>
          L.marker([driver.location.latitude, driver.location.longitude])
        )
      );
      map.fitBounds(group.getBounds().pad(0.1));
    }
  };

  useEffect(() => {
    if (!map) return;

    if (driversWithCoordinates.length > 0) {
      fitMapToDrivers();
      hasAutoFitRef.current = true;
    } else {
      hasAutoFitRef.current = false;
    }
  }, [map, driversWithCoordinates]);

  const getDriverStatusColor = (status) => {
    switch (status) {
      case 'available': return 'text-green-600 bg-green-100';
      case 'busy': return 'text-orange-600 bg-orange-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatLastUpdated = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    const now = new Date();
    const diffMinutes = Math.floor((now - date) / (1000 * 60));
    
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-6 h-screen flex flex-col">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:gap-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Live Driver Map</h1>
          <p className="text-sm sm:text-base text-gray-500">Real-time tracking of driver locations</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
          <button
            onClick={handleAutoRefreshToggle}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              autoRefresh 
                ? 'bg-green-500 text-white' 
                : 'bg-gray-200 text-gray-700'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:inline">Auto:</span> {autoRefresh ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center justify-center gap-2 px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm font-medium whitespace-nowrap"
            disabled={isLoading}
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleMapInteractionToggle}
            className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
              isMapInteractive ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            <span className="hidden sm:inline">Drag:</span> {isMapInteractive ? 'ON' : 'OFF'}
          </button>
          {driversWithCoordinates.length > 0 && (
            <button
              onClick={fitMapToDrivers}
              className="flex items-center justify-center gap-2 px-3 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 text-sm font-medium whitespace-nowrap"
            >
              <Navigation className="w-4 h-4" />
              <span className="hidden sm:inline">Fit to</span> Drivers
            </button>
          )}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white p-2 sm:p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Total</p>
              <p className="text-lg sm:text-2xl font-bold text-gray-900">{safeDriverLocations.length}</p>
            </div>
            <User className="w-6 sm:w-8 h-6 sm:h-8 text-blue-500 flex-shrink-0" />
          </div>
        </div>

        <div className="bg-white p-2 sm:p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Available</p>
              <p className="text-lg sm:text-2xl font-bold text-green-600">
                {safeDriverLocations.filter(driver => driver?.profile?.status === 'available').length}
              </p>
            </div>
            <div className="w-6 sm:w-8 h-6 sm:h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
              <User className="w-3 sm:w-4 h-3 sm:h-4 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-2 sm:p-4 rounded-lg shadow-sm border border-gray-200 hidden sm:block">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Busy</p>
              <p className="text-lg sm:text-2xl font-bold text-orange-600">
                {safeDriverLocations.filter(driver => driver?.profile?.status === 'busy').length}
              </p>
            </div>
            <div className="w-6 sm:w-8 h-6 sm:h-8 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Package className="w-3 sm:w-4 h-3 sm:h-4 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-2 sm:p-4 rounded-lg shadow-sm border border-gray-200 hidden sm:block">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs sm:text-sm font-medium text-gray-600">Updated</p>
              <p className="text-xs sm:text-sm font-bold text-gray-900">
                {latestUpdate
                  ? formatLastUpdated(latestUpdate)
                  : 'No data'
                }
              </p>
            </div>
            <Clock className="w-6 sm:w-8 h-6 sm:h-8 text-purple-500 flex-shrink-0" />
          </div>
        </div>
      </div>

      {/* Map Container */}
      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading && safeDriverLocations.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-lg">Loading map...</div>
          </div>
        ) : (
          <MapContainer
            center={defaultCenter}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
            scrollWheelZoom={isMapInteractive}
            whenCreated={setMap}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Driver Markers */}
            {driversWithCoordinates.map(driver => (
              <Marker
                key={driver._id}
                position={[driver.location.latitude, driver.location.longitude]}
                icon={createDriverIcon(driver.profile?.status)}
                eventHandlers={{
                  click: () => setSelectedDriver(driver),
                }}
              >
                <Popup>
                  <div className="min-w-48">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                        {driver.profile?.firstName?.[0]}{driver.profile?.lastName?.[0]}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-900">
                          {driver.profile?.firstName} {driver.profile?.lastName}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${getDriverStatusColor(driver.profile?.status)}`}>
                          {driver.profile?.status || 'offline'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center text-gray-600">
                        <MapPin className="w-4 h-4 mr-2" />
                        <span>{driver.location.address || 'Location updated'}</span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <Clock className="w-4 h-4 mr-2" />
                        <span>{formatLastUpdated(driver.location.lastUpdated)}</span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <User className="w-4 h-4 mr-2" />
                        <span>{driver.email}</span>
                      </div>
                    </div>

                    <div className="mt-3 flex space-x-2">
                      <button className="flex-1 px-3 py-2 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                        View Details
                      </button>
                      <button className="flex-1 px-3 py-2 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300">
                        Message
                      </button>
                    </div>
                  </div>
                </Popup>
                
                <Tooltip permanent direction="top" offset={[0, -10]}>
                  <div className="font-semibold">
                    {driver.profile?.firstName} {driver.profile?.lastName}
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>
        )}
      </div>

      {/* Driver List Sidebar */}
      {selectedDriver && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          className="absolute right-6 top-24 w-80 bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto"
        >
          <div className="p-4 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900">Driver Details</h3>
          </div>
          <div className="p-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold">
                {selectedDriver.profile?.firstName?.[0]}{selectedDriver.profile?.lastName?.[0]}
              </div>
              <div>
                <h4 className="font-semibold text-gray-900">
                  {selectedDriver.profile?.firstName} {selectedDriver.profile?.lastName}
                </h4>
                <p className="text-sm text-gray-500">{selectedDriver.email}</p>
              </div>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-600">Status</label>
                <div className={`px-2 py-1 text-sm font-medium rounded-full inline-block ${getDriverStatusColor(selectedDriver.profile?.status)}`}>
                  {selectedDriver.profile?.status}
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600">Location</label>
                <p className="text-sm text-gray-900">{selectedDriver.location.address || 'No address'}</p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600">Last Updated</label>
                <p className="text-sm text-gray-900">
                  {formatLastUpdated(selectedDriver.location.lastUpdated)}
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-600">Coordinates</label>
                <p className="text-sm text-gray-900">
                  {selectedDriver.location.latitude.toFixed(6)}, {selectedDriver.location.longitude.toFixed(6)}
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {safeDriverLocations.length === 0 && !isLoading && (
        <div className="flex items-center justify-center h-64 bg-white rounded-lg border border-gray-200">
          <div className="text-center">
            <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <div className="text-gray-500 text-lg">No driver locations available</div>
            <div className="text-gray-400 mt-2">Driver locations will appear here when available</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveMap;
