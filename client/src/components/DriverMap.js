import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default markers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom driver icons
const createDriverIcon = (status) => {
  const color = status === 'available' ? 'green' : status === 'busy' ? 'orange' : 'red';
  
  return L.divIcon({
    html: `
      <div style="
        background-color: ${color};
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      "></div>
    `,
    className: 'driver-marker',
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

const DriverMap = () => {
  const [drivers, setDrivers] = useState([]);

  // Mock real-time driver locations (in real app, this would come from WebSocket)
  useEffect(() => {
    const mockDrivers = [
      {
        id: '1',
        name: 'John Doe',
        position: [40.7128 + (Math.random() - 0.5) * 0.02, -74.0060 + (Math.random() - 0.5) * 0.02],
        status: 'available',
        currentDelivery: null,
        speed: '25 km/h'
      },
      {
        id: '2',
        name: 'Sarah Smith',
        position: [40.7128 + (Math.random() - 0.5) * 0.02, -74.0060 + (Math.random() - 0.5) * 0.02],
        status: 'busy',
        currentDelivery: 'Customer B',
        speed: '18 km/h'
      },
      {
        id: '3',
        name: 'Mike Johnson',
        position: [40.7128 + (Math.random() - 0.5) * 0.02, -74.0060 + (Math.random() - 0.5) * 0.02],
        status: 'available',
        currentDelivery: null,
        speed: '0 km/h'
      },
      {
        id: '4',
        name: 'Lisa Brown',
        position: [40.7128 + (Math.random() - 0.5) * 0.02, -74.0060 + (Math.random() - 0.5) * 0.02],
        status: 'busy',
        currentDelivery: 'Customer D',
        speed: '32 km/h'
      },
    ];

    setDrivers(mockDrivers);

    // Simulate real-time updates
    const interval = setInterval(() => {
      setDrivers(prev => prev.map(driver => ({
        ...driver,
        position: [
          driver.position[0] + (Math.random() - 0.5) * 0.001,
          driver.position[1] + (Math.random() - 0.5) * 0.001
        ]
      })));
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="h-96 rounded-lg overflow-hidden border border-gray-200">
      <MapContainer
        center={[40.7128, -74.0060]}
        zoom={12}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {drivers.map((driver) => (
          <Marker
            key={driver.id}
            position={driver.position}
            icon={createDriverIcon(driver.status)}
          >
            <Popup>
              <div className="p-2">
                <h3 className="font-semibold text-gray-900">{driver.name}</h3>
                <div className={`text-sm font-medium ${
                  driver.status === 'available' ? 'text-green-600' : 
                  driver.status === 'busy' ? 'text-orange-600' : 'text-red-600'
                }`}>
                  Status: {driver.status}
                </div>
                {driver.currentDelivery && (
                  <div className="text-sm text-gray-600">
                    Current: {driver.currentDelivery}
                  </div>
                )}
                <div className="text-sm text-gray-600">
                  Speed: {driver.speed}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Last updated: {new Date().toLocaleTimeString()}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default DriverMap;