import React, { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion } from 'framer-motion';
import { Upload, Copy, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { fetchDrivers } from '../store/slices/driverSlice';

const GoogleSheetsImport = ({ onImport }) => {
  const dispatch = useDispatch();
  const { drivers } = useSelector(state => state.driver);
  const [pastedData, setPastedData] = useState('');
  const [parsedData, setParsedData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [isValidating, setIsValidating] = useState(false);

  // Extract drivers array from Redux state with better debugging
  const driversArray = Array.isArray(drivers) 
    ? drivers 
    : (drivers?.data || drivers?.drivers || []);

  console.log('=== GOOGLE SHEETS IMPORT DEBUG ===');
  console.log('Total drivers in Redux:', driversArray.length);
  console.log('Drivers list:', driversArray.map(d => ({
    id: d._id,
    firstName: d.profile?.firstName,
    lastName: d.profile?.lastName,
    fullName: `${d.profile?.firstName || ''} ${d.profile?.lastName || ''}`.trim(),
    isActive: d.isActive
  })));

  const sampleData = `Customer ID,Customer Name,Zone,Delivery Window Start,Delivery Window End,Scheduled Time,Driver,Company,Address,GPS Link,Latitude,Longitude,Notes
CUST001,John Doe,Downtown,13:00,15:00,14:00,John Smith,Matter,123 Main St,https://maps.google.com/?q=40.7128,-74.0060,,,Leave at front door
CUST002,Jane Smith,North Zone,14:00,16:00,15:00,Sarah Johnson,Yellow Block,456 Oak Ave,,40.7218,-74.0160,Ring bell`;

  // Enhanced normalization function
  const normalizeName = (name) => {
    if (!name) return '';
    return name.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\w\s]/g, '');
  };

  // SUPER DEBUGGED driver finding function
  const findDriverByName = (driverName) => {
    console.log('🔍 Searching for driver:', driverName);
    
    if (!driverName) {
      console.log('❌ No driver name provided');
      return null;
    }

    const normalizedSearchName = normalizeName(driverName);
    console.log('Normalized search name:', normalizedSearchName);

    // Try multiple matching strategies
    let driver = null;
    let matchType = 'none';

    // Strategy 1: Exact full name match
    driver = driversArray.find(d => {
      const fullName = `${d.profile?.firstName || ''} ${d.profile?.lastName || ''}`.trim();
      const normalizedFullName = normalizeName(fullName);
      const isMatch = normalizedFullName === normalizedSearchName;
      if (isMatch) console.log('✅ Exact full name match:', fullName);
      return isMatch;
    });
    if (driver) matchType = 'exact-full';

    // Strategy 2: Case-insensitive contains match
    if (!driver) {
      driver = driversArray.find(d => {
        const fullName = `${d.profile?.firstName || ''} ${d.profile?.lastName || ''}`.trim();
        const normalizedFullName = normalizeName(fullName);
        const isMatch = normalizedFullName.includes(normalizedSearchName) || 
                       normalizedSearchName.includes(normalizedFullName);
        if (isMatch) console.log('✅ Contains match:', fullName);
        return isMatch;
      });
      if (driver) matchType = 'contains';
    }

    // Strategy 3: First name only match
    if (!driver) {
      driver = driversArray.find(d => {
        const firstName = d.profile?.firstName || '';
        const normalizedFirstName = normalizeName(firstName);
        const isMatch = normalizedFirstName === normalizedSearchName;
        if (isMatch) console.log('✅ First name match:', firstName);
        return isMatch;
      });
      if (driver) matchType = 'first-name';
    }

    // Strategy 4: Last name only match
    if (!driver) {
      driver = driversArray.find(d => {
        const lastName = d.profile?.lastName || '';
        const normalizedLastName = normalizeName(lastName);
        const isMatch = normalizedLastName === normalizedSearchName;
        if (isMatch) console.log('✅ Last name match:', lastName);
        return isMatch;
      });
      if (driver) matchType = 'last-name';
    }

    // Strategy 5: Partial first name match
    if (!driver) {
      driver = driversArray.find(d => {
        const firstName = d.profile?.firstName || '';
        const normalizedFirstName = normalizeName(firstName);
        const isMatch = normalizedSearchName.includes(normalizedFirstName) || 
                       normalizedFirstName.includes(normalizedSearchName);
        if (isMatch) console.log('✅ Partial first name match:', firstName);
        return isMatch;
      });
      if (driver) matchType = 'partial-first';
    }

    if (driver) {
      console.log(`🎯 Found driver: ${driver.profile?.firstName} ${driver.profile?.lastName} (${matchType})`);
      console.log('Driver details:', {
        id: driver._id,
        firstName: driver.profile?.firstName,
        lastName: driver.profile?.lastName,
        isActive: driver.isActive
      });
    } else {
      console.log('❌ No driver found for:', driverName);
      console.log('Available drivers:', driversArray.map(d => 
        `${d.profile?.firstName} ${d.profile?.lastName} (ID: ${d._id})`
      ));
    }

    return driver;
  };

  const parseGPSFromLink = (link) => {
  if (!link) return null;
  
  try {
    // Handle Google Maps links
    if (link.includes('google.com/maps') || link.includes('maps.app.goo.gl')) {
      const coordMatch = link.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (coordMatch) {
        return {
          lat: parseFloat(coordMatch[1]),
          lng: parseFloat(coordMatch[2])
        };
      }
      
      const queryMatch = link.match(/q=(-?\d+\.\d+),(-?\d+\.\d+)/);
      if (queryMatch) {
        return {
          lat: parseFloat(queryMatch[1]),
          lng: parseFloat(queryMatch[2])
        };
      }
    }
    return null;
  } catch (error) {
    return null;
  }
};

// In the row processing, add GPS link parsing:
if (row['GPS Link']) {
  const coords = parseGPSFromLink(row['GPS Link']);
  if (coords) {
    row.gpsLocation = {
      ...coords,
      link: row['GPS Link']
    };
  }
}

// Also keep existing coordinate parsing as fallback:
if (!row.gpsLocation && row['Latitude'] && row['Longitude']) {
  row.gpsLocation = {
    lat: parseFloat(row['Latitude']),
    lng: parseFloat(row['Longitude'])
  };
}

  const handlePaste = (e) => {
    const text = e.target.value;
    setPastedData(text);
    
    if (text.trim()) {
      setIsValidating(true);
      setTimeout(() => {
        const data = parseCSV(text);
        setParsedData(data);
        setIsValidating(false);
      }, 500);
    } else {
      setParsedData([]);
      setErrors([]);
    }
  };

  const handleImport = () => {
    console.log('🚀 Starting import with data:', parsedData);
    if (errors.length === 0 && parsedData.length > 0) {
      const importData = parsedData.map(row => ({
        customerId: row.customerId,
        customerName: row.customerName,
        scheduledTime: row.scheduledTime,
        driver: row.driverId,
        company: row.company,
        address: row.address,
        notes: row.notes,
        type: row.type
      }));
      
      console.log('📤 Sending to parent component:', importData);
      onImport(importData);
      setPastedData('');
      setParsedData([]);
      setErrors([]);
    }
  };

  const copySample = () => {
    navigator.clipboard.writeText(sampleData);
  };

  // Refresh drivers list when component mounts
  React.useEffect(() => {
    console.log('🔄 Fetching drivers...');
    dispatch(fetchDrivers());
  }, [dispatch]);

  return (
    <div className="space-y-6">
      {/* Debug Info */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <h3 className="font-semibold text-purple-900 mb-2">🔧 Debug Information</h3>
        <div className="text-sm text-purple-800 space-y-1">
          <div>Loaded Drivers: {driversArray.length}</div>
          <div>Available Drivers: {driversArray.map(d => `${d.profile?.firstName} ${d.profile?.lastName}`).join(', ')}</div>
          <div>Check browser console for detailed matching logs</div>
        </div>
      </div>

      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How to import from Google Sheets</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm text-blue-800">
          <li>Select the range in your Google Sheet</li>
          <li>Copy (Ctrl+C) the selected cells</li>
          <li>Paste (Ctrl+V) into the field below</li>
          <li>Review and fix any validation errors</li>
          <li>Click "Import Deliveries"</li>
        </ol>
      </div>

      {/* Available Drivers List */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <h4 className="font-semibold text-green-900 mb-2">Available Drivers</h4>
        <div className="text-sm text-green-800">
          {driversArray.length === 0 ? (
            <div>No drivers available. Please create drivers first.</div>
          ) : (
            <div className="space-y-1">
              {driversArray.map(driver => (
                <div key={driver._id} className="flex justify-between">
                  <span>
                    {driver.profile?.firstName} {driver.profile?.lastName}
                  </span>
                  <span className="text-green-600 text-xs">
                    ID: {driver._id?.substring(0, 8)}...
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Rest of the component remains the same */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <h4 className="font-semibold text-gray-900">Sample Format</h4>
          <button
            onClick={copySample}
            className="flex items-center px-3 py-1 text-sm bg-white border border-gray-300 rounded hover:bg-gray-50"
          >
            <Copy className="w-4 h-4 mr-1" />
            Copy Sample
          </button>
        </div>
        <pre className="text-xs bg-white p-3 rounded border overflow-x-auto">
          {sampleData}
        </pre>
      </div>

      {/* Paste Area */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Paste Google Sheets Data
        </label>
        <textarea
          value={pastedData}
          onChange={handlePaste}
          placeholder="Paste your Google Sheets data here..."
          rows={8}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
        />
      </div>

      {/* Validation Results */}
      {isValidating && (
        <div className="text-center py-4">
          <div className="text-gray-500">Validating data...</div>
        </div>
      )}

      {!isValidating && parsedData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-gray-200 rounded-lg overflow-hidden"
        >
          <div className="bg-green-50 px-4 py-2 border-b border-green-200">
            <div className="flex items-center text-green-800">
              <CheckCircle className="w-5 h-5 mr-2" />
              {parsedData.length} valid deliveries ready to import
            </div>
          </div>
          
          <div className="max-h-64 overflow-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Customer
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Scheduled
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Driver
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Company
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {parsedData.map((row, index) => (
                  <tr key={row._id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-sm">
                      <div className="font-medium text-gray-900">{row['Customer Name']}</div>
                      <div className="text-gray-500">{row['Customer ID']}</div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">{row['Scheduled Time']}</td>
                    <td className="px-4 py-2 text-sm text-gray-900">
                      <div className="font-medium">{row.driverName}</div>
                      <div className="text-green-600 text-xs">✓ Driver found</div>
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-900">{row.Company}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {errors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-red-50 border border-red-200 rounded-lg p-4"
        >
          <div className="flex items-center text-red-800 mb-2">
            <AlertCircle className="w-5 h-5 mr-2" />
            {errors.length} error(s) found
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </motion.div>
      )}

      {/* Actions */}
      <div className="flex justify-end space-x-3">
        <button
          onClick={() => {
            setPastedData('');
            setParsedData([]);
            setErrors([]);
          }}
          className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
        >
          Clear
        </button>
        <button
          onClick={handleImport}
          disabled={errors.length > 0 || parsedData.length === 0}
          className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Upload className="w-5 h-5 mr-2" />
          Import {parsedData.length} Deliveries
        </button>
      </div>
    </div>
  );
};

export default GoogleSheetsImport;