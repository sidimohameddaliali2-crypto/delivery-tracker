import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { User, Clock, CheckCircle, XCircle } from 'lucide-react';

const DriverAvailability = ({ drivers = [] }) => {
  // Ensure drivers is always an array
  const safeDrivers = Array.isArray(drivers) ? drivers : [];

  const getStatusColor = (status) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'busy': return 'bg-yellow-100 text-yellow-800';
      case 'offline': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'available': return CheckCircle;
      case 'busy': return Clock;
      case 'offline': return XCircle;
      default: return User;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Driver Availability</h3>
      <div className="space-y-3">
        {safeDrivers.length > 0 ? (
          safeDrivers.map((driver, index) => {
            // Ensure driver has required properties
            const driverProfile = driver?.profile || {};
            const firstName = driverProfile.firstName || 'Unknown';
            const lastName = driverProfile.lastName || 'Driver';
            const status = driverProfile.status || 'offline';
            
            const StatusIcon = getStatusIcon(status);
            
            return (
              <motion.div
                key={driver?._id || index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-sm">
                    {firstName[0]}{lastName[0]}
                  </div>
                  <div>
                    <Link 
                      to={`/drivers/${driver?._id || index}`}
                      className="font-medium text-gray-900 hover:text-blue-600"
                    >
                      {firstName} {lastName}
                    </Link>
                    <div className="flex items-center space-x-2 mt-1">
                      <StatusIcon className="w-4 h-4" />
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor(status)}`}>
                        {status}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-900">
                    {driver?.todayDeliveries || 0}
                  </div>
                  <div className="text-xs text-gray-500">deliveries</div>
                </div>
              </motion.div>
            );
          })
        ) : (
          <div className="text-center py-4">
            <User className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-gray-500 text-sm">No drivers available</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DriverAvailability;