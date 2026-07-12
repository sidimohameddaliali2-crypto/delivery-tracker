import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons
const deliveryIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const driverIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const warehouseIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
});

const DeliveryMap = ({ deliveries, drivers, selectedDelivery, onDeliverySelect }) => {
  const [map, setMap] = React.useState(null);
  const [route, setRoute] = React.useState([]);

  // Warehouse coordinates (update with your actual warehouse location)
  const warehouseCoords = [40.7128, -74.0060]; // Default NYC

  // Generate coordinates based on delivery data
  const getDeliveryCoords = (delivery, index) => {
    // If delivery has GPS coordinates, use them
    if (delivery.gpsLocation && delivery.gpsLocation.lat && delivery.gpsLocation.lng) {
      return [delivery.gpsLocation.lat, delivery.gpsLocation.lng];
    }
    
    // Fallback: generate coordinates around warehouse based on delivery ID
    const baseLat = warehouseCoords[0] + (Math.sin(index * 0.5) * 0.02);
    const baseLng = warehouseCoords[1] + (Math.cos(index * 0.5) * 0.02);
    return [baseLat, baseLng];
  };

  const getDriverCoords = (driver, index) => {
    // If driver has current location, use it
    if (driver.currentLocation && driver.currentLocation.lat && driver.currentLocation.lng) {
      return [driver.currentLocation.lat, driver.currentLocation.lng];
    }
    
    // Fallback: position drivers near their assigned deliveries
    const driverDeliveries = deliveries.filter(d => d.driver?._id === driver._id);
    if (driverDeliveries.length > 0) {
      const deliveryCoords = getDeliveryCoords(driverDeliveries[0], index);
      return [
        deliveryCoords[0] + (Math.random() - 0.5) * 0.01,
        deliveryCoords[1] + (Math.random() - 0.5) * 0.01
      ];
    }
    
    // Default: random position near warehouse
    return [
      warehouseCoords[0] + (Math.random() - 0.5) * 0.03,
      warehouseCoords[1] + (Math.random() - 0.5) * 0.03
    ];
  };

  useEffect(() => {
    if (selectedDelivery && map) {
      const deliveryCoords = getDeliveryCoords(selectedDelivery, deliveries.findIndex(d => d._id === selectedDelivery._id));
      setRoute([warehouseCoords, deliveryCoords]);
      
      const bounds = L.latLngBounds([warehouseCoords, deliveryCoords]);
      map.fitBounds(bounds, { padding: [20, 20] });
    } else {
      setRoute([]);
    }
  }, [selectedDelivery, map, deliveries]);

  // Calculate map center based on deliveries
  const calculateMapCenter = () => {
    if (deliveries.length === 0) return warehouseCoords;
    
    const deliveryCoords = deliveries.map((delivery, index) => 
      getDeliveryCoords(delivery, index)
    );
    
    const allCoords = [warehouseCoords, ...deliveryCoords];
    const avgLat = allCoords.reduce((sum, coord) => sum + coord[0], 0) / allCoords.length;
    const avgLng = allCoords.reduce((sum, coord) => sum + coord[1], 0) / allCoords.length;
    
    return [avgLat, avgLng];
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'delivered': return 'text-green-600';
      case 'failed': return 'text-red-600';
      case 'picked_up': return 'text-blue-600';
      case 'assigned': return 'text-yellow-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="h-96 rounded-lg overflow-hidden border border-gray-200">
      <MapContainer
        center={calculateMapCenter()}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
        whenCreated={setMap}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Warehouse Marker */}
        <Marker position={warehouseCoords} icon={warehouseIcon}>
          <Popup>
            <div className="text-center">
              <strong>Matter Warehouse</strong>
              <br />
              <span>Delivery Hub</span>
            </div>
          </Popup>
        </Marker>

        {/* Delivery Markers */}
        {deliveries.map((delivery, index) => (
          <Marker
            key={delivery._id}
            position={getDeliveryCoords(delivery, index)}
            icon={deliveryIcon}
            eventHandlers={{
              click: () => onDeliverySelect && onDeliverySelect(delivery),
            }}
          >
            <Popup>
              <div className="min-w-48">
                <strong>{delivery.customerName}</strong>
                <br />
                <span className="text-sm">
                  Scheduled: {new Date(delivery.scheduledTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                </span>
                <br />
                <span className={`text-sm font-medium ${getStatusColor(delivery.status)}`}>
                  Status: {delivery.status}
                </span>
                <br />
                {delivery.driver && (
                  <span className="text-sm">
                    Driver: {delivery.driver.profile?.firstName} {delivery.driver.profile?.lastName}
                  </span>
                )}
                {delivery.zone && (
                  <>
                    <br />
                    <span className="text-sm">Zone: {delivery.zone}</span>
                  </>
                )}
                {delivery.deliveryWindow && (
                  <>
                    <br />
                    <span className="text-sm">
                      Window: {new Date(delivery.deliveryWindow.startTime).toLocaleTimeString()} - {new Date(delivery.deliveryWindow.endTime).toLocaleTimeString()}
                    </span>
                  </>
                )}
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Driver Markers */}
        {drivers.map((driver, index) => (
          <Marker
            key={driver._id}
            position={getDriverCoords(driver, index)}
            icon={driverIcon}
          >
            <Popup>
              <div className="min-w-40">
                <strong>{driver.profile?.firstName} {driver.profile?.lastName}</strong>
                <br />
                <span className="text-sm">
                  Status: <span className="capitalize">{driver.profile?.status || 'offline'}</span>
                </span>
                <br />
                <span className="text-sm">
                  Today's Deliveries: {driver.todayDeliveries || 0}
                </span>
                <br />
                <span className="text-sm">
                  KPI Score: {driver.kpi?.score || 0}
                </span>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Route for Selected Delivery */}
        {route.length > 0 && (
          <Polyline
            positions={route}
            color="blue"
            weight={4}
            opacity={0.7}
          />
        )}
      </MapContainer>
    </div>
  );
};

export default DeliveryMap;