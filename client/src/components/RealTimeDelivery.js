import React, { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, CheckCircle, XCircle, Clock } from 'lucide-react';

const RealTimeDelivery = () => {
  const { socket } = useSocket();
  const [updates, setUpdates] = useState([]);

  useEffect(() => {
    if (!socket) return;

    const handleDeliveryUpdate = (data) => {
      setUpdates(prev => [data, ...prev.slice(0, 4)]);
      
      // Auto remove after 5 seconds
      setTimeout(() => {
        setUpdates(prev => prev.filter(update => update.id !== data.id));
      }, 5000);
    };

    socket.on('delivery:updated', handleDeliveryUpdate);

    return () => {
      socket.off('delivery:updated', handleDeliveryUpdate);
    };
  }, [socket]);

  const getStatusIcon = (status) => {
    switch (status) {
      case 'delivered': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Clock className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'delivered': return 'border-green-200 bg-green-50';
      case 'failed': return 'border-red-200 bg-red-50';
      default: return 'border-yellow-200 bg-yellow-50';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      <AnimatePresence>
        {updates.map((update, index) => (
          <motion.div
            key={update.id}
            initial={{ opacity: 0, x: 300 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 300 }}
            transition={{ duration: 0.3, delay: index * 0.1 }}
            className={`p-3 rounded-lg border shadow-sm ${getStatusColor(update.status)}`}
          >
            <div className="flex items-center space-x-2">
              <Package className="w-4 h-4 text-gray-600" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {update.customerName}
                </p>
                <p className="text-xs text-gray-500 capitalize">
                  {update.status} • {update.driverName}
                </p>
              </div>
              {getStatusIcon(update.status)}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default RealTimeDelivery;