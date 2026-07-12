import React, { useState, useEffect, memo, useMemo, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Grid } from 'react-window';
import { 
  Search, 
  Plus, 
  MoreVertical, 
  Edit, 
  Eye, 
  UserX,
  Phone,
  Star,
  RefreshCw
} from 'lucide-react';
import { fetchDrivers, toggleDriverStatus, updateDriver } from '../store/slices/driverSlice';
import CreateDriverModal from '../components/drivers/CreateDriverModal';
import UserAvatar from '../components/users/UserAvatar';

// Helper functions moved outside the component
const getStatusColor = (status) => {
  switch (status) {
    case 'available': return 'bg-green-100 text-green-800';
    case 'busy': return 'bg-yellow-100 text-yellow-800';
    case 'offline': return 'bg-gray-100 text-gray-800';
    default: return 'bg-gray-100 text-gray-800';
  }
};

const getKpiColor = (score) => {
  if (score >= 90) return 'text-green-600';
  if (score >= 70) return 'text-yellow-600';
  return 'text-red-600';
};

// Custom hook for debouncing values
const useDebouncedValue = (value, delay = 300) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
};

// Virtualized Driver Grid Component for large lists
const VirtualizedDriverGrid = memo(({ drivers, onToggleStatus, onColorChange }) => {
  const columnCount = 4; // xl:grid-cols-4
  const rowCount = Math.ceil(drivers.length / columnCount);
  const cardWidth = 350; // approximate card width
  const cardHeight = 420; // approximate card height
  const gap = 24; // gap-6

  const Cell = useCallback(({ columnIndex, rowIndex, style }) => {
    const index = rowIndex * columnCount + columnIndex;
    if (index >= drivers.length) return null;
    
    const driver = drivers[index];
    return (
      <div style={{ ...style, padding: gap / 2 }}>
        <DriverCard
          driver={driver}
          index={index}
          onToggleStatus={onToggleStatus}
          onColorChange={onColorChange}
        />
      </div>
    );
  }, [drivers, onToggleStatus, onColorChange]);

  return (
    <Grid
      columnCount={columnCount}
      columnWidth={cardWidth + gap}
      height={600}
      rowCount={rowCount}
      rowHeight={cardHeight + gap}
      width={1400}
      className="mx-auto"
    >
      {Cell}
    </Grid>
  );
});

const Drivers = () => {
  const dispatch = useDispatch();
  const { drivers, isLoading, error } = useSelector(state => state.driver);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState('grid');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Debounce search term to avoid filtering on every keystroke
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 300);

  // Extract drivers array from response - handle both array and object responses
  const driversArray = Array.isArray(drivers) 
    ? drivers 
    : (drivers?.data || drivers?.drivers || []);

  useEffect(() => {
    dispatch(fetchDrivers());
  }, [dispatch]);

  const filteredDrivers = useMemo(() => 
    driversArray.filter(driver => 
      driver?.profile?.firstName?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      driver?.profile?.lastName?.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
      driver?.profile?.phone?.includes(debouncedSearchTerm) ||
      driver?.email?.toLowerCase().includes(debouncedSearchTerm.toLowerCase())
    ), [driversArray, debouncedSearchTerm]
  );

  const handleToggleStatus = useCallback((driverId, currentStatus) => {
    const isActive = !currentStatus;
    dispatch(toggleDriverStatus({ id: driverId, isActive }));
  }, [dispatch]);

  const handleColorChange = useCallback((driverId, colorCode) => {
    if (!driverId || !colorCode) return;
    dispatch(updateDriver({ id: driverId, driverData: { colorCode } }));
  }, [dispatch]);

  const handleRefresh = useCallback(() => {
    dispatch(fetchDrivers());
  }, [dispatch]);

  if (isLoading && driversArray.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Loading drivers...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Drivers</h1>
          <p className="text-gray-500">Manage your delivery drivers</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            className="flex items-center px-3 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </button>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            <Plus className="w-5 h-5 mr-2" />
            Create Driver
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-lg">
          {error}
        </div>
      )}

      {/* Search and Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="relative w-80">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search drivers by name, email, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-2 rounded-lg ${
              viewMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Grid
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-2 rounded-lg ${
              viewMode === 'table' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'
            }`}
          >
            Table
          </button>
        </div>
      </div>

      {/* Drivers Count */}
      <div className="text-sm text-gray-600">
        Showing {filteredDrivers.length} of {driversArray.length} drivers
      </div>

      {/* Drivers Grid/Table */}
      {viewMode === 'grid'
        ? filteredDrivers.length > 50
          ? (
            // Virtualized grid for better performance with many drivers
            <VirtualizedDriverGrid 
              drivers={filteredDrivers}
              onToggleStatus={handleToggleStatus}
              onColorChange={handleColorChange}
            />
          ) : (
            // Regular grid for smaller lists (better animations)
            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
            >
              {filteredDrivers.map((driver, index) => (
                <DriverCard 
                  key={driver._id} 
                  driver={driver} 
                  index={index}
                  onToggleStatus={handleToggleStatus}
                  onColorChange={handleColorChange}
                />
              ))}
            </motion.div>
          )
        : (
          <DriversTable 
            drivers={filteredDrivers} 
            onToggleStatus={handleToggleStatus}
            onColorChange={handleColorChange}
          />
        )}

      {filteredDrivers.length === 0 && searchTerm && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg">No drivers found</div>
          <div className="text-gray-500 mt-2">Try adjusting your search criteria</div>
        </div>
      )}

      {filteredDrivers.length === 0 && !searchTerm && driversArray.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg">No drivers yet</div>
          <div className="text-gray-500 mt-2">Create your first driver to get started</div>
          <button 
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            Create Driver
          </button>
        </div>
      )}

      {/* Create Driver Modal */}
      <CreateDriverModal 
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </div>
  );
};

// Driver Card Component
const DriverCard = memo(({ driver, index, onToggleStatus, onColorChange }) => {
  const [showMenu, setShowMenu] = useState(false);

  // Memoize extracted driver data to avoid recalculation
  const driverData = useMemo(() => ({
    firstName: driver?.profile?.firstName || 'Unknown',
    lastName: driver?.profile?.lastName || 'Driver',
    phone: driver?.profile?.phone || 'No phone',
    status: driver?.profile?.status || 'offline',
    email: driver?.email || 'No email',
    todayDeliveries: driver?.todayDeliveries || 0,
    deliveriesCount: driver?.deliveriesCount || 0,
    tasksCount: driver?.tasksCount || 0,
    performedCount: driver?.performedCount || 0,
    avgLateTime: driver?.kpi?.avgLateTime || 0,
    kpiScore: driver?.kpi?.score || 0,
    complaintsCount: driver?.kpi?.complaintsCount || 0,
    isActive: driver?.isActive !== false,
    colorCode: driver?.profile?.colorCode || '#000000'
  }), [driver]);

  const { firstName, lastName, phone, status, email, todayDeliveries, deliveriesCount, 
          tasksCount, performedCount, avgLateTime, kpiScore, complaintsCount, isActive, colorCode } = driverData;

  // Memoize toggle handler
  const handleToggle = useCallback(() => {
    onToggleStatus(driver._id, isActive);
  }, [onToggleStatus, driver._id, isActive]);

  // Memoize color change handler
  const handleColorChange = useCallback((e) => {
    onColorChange(driver._id, e.target.value);
  }, [onColorChange, driver._id]);

  // Memoize menu toggle
  const toggleMenu = useCallback(() => setShowMenu(prev => !prev), []);
  const closeMenu = useCallback(() => setShowMenu(false), []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"
    >
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <UserAvatar
              user={driver}
              sizePx={48}
              showStatus
              fallbackName={`${firstName} ${lastName}`}
              fallbackEmail={driver?.email || `${firstName}.${lastName}@drivers.local`}
              className="shadow-sm"
            />
            <div>
              <h3 className="font-semibold text-gray-900">
                {firstName} {lastName}
              </h3>
              <div className="flex items-center text-sm text-gray-500">
                <Phone className="w-4 h-4 mr-1" />
                {phone}
              </div>
            </div>
          </div>
          <div className="relative">
            <button 
              onClick={toggleMenu}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <MoreVertical className="w-5 h-5 text-gray-400" />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg z-10 min-w-32">
                <Link
                  to={`/drivers/${driver._id}`}
                  className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
                  onClick={closeMenu}
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View
                </Link>
                <button className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100">
                  <Edit className="w-4 h-4 mr-2" />
                  Edit
                </button>
                <button 
                  onClick={() => {
                    handleToggle();
                    closeMenu();
                  }}
                  className="flex items-center w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                >
                  <UserX className="w-4 h-4 mr-2" />
                  {isActive ? 'Disable' : 'Enable'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Status</span>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(status)}`}>
              {status}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Sticker Color</span>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono text-gray-500 hidden sm:block">{colorCode}</span>
              <input
                type="color"
                value={colorCode}
                onChange={handleColorChange}
                className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
                title="Select driver sticker color"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Deliveries</span>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded-full">
                  {driver.deliveriesCount || 0}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Tasks</span>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-1 text-xs font-semibold bg-purple-100 text-purple-800 rounded-full relative">
                  {driver.tasksCount || 0}
                  {(driver.tasksCount || 0) > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-purple-600 rounded-full animate-pulse"></span>
                  )}
                </span>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Performed</span>
              <span className="px-2 py-1 text-xs font-semibold bg-green-100 text-green-800 rounded-full">
                {driver.performedCount || 0}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Avg Late Time</span>
            <span className="font-semibold">{avgLateTime}m</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">KPI Score</span>
            <span className={`font-semibold flex items-center ${getKpiColor(kpiScore)}`}>
              <Star className="w-4 h-4 mr-1 fill-current" />
              {kpiScore}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">Complaints</span>
            <span className="font-semibold">{complaintsCount}</span>
          </div>
        </div>

        <div className="flex justify-between mt-4 pt-4 border-t border-gray-200">
          <Link
            to={`/drivers/${driver._id}`}
            className="flex items-center px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
          >
            <Eye className="w-4 h-4 mr-1" />
            View
          </Link>
          <button 
            onClick={handleToggle}
            className={`flex items-center px-3 py-2 text-sm rounded-lg ${
              isActive 
                ? 'text-red-600 hover:bg-red-50' 
                : 'text-green-600 hover:bg-green-50'
            }`}
          >
            <UserX className="w-4 h-4 mr-1" />
            {isActive ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>
    </motion.div>
  );
});

// Drivers Table Component
const DriversTable = memo(({ drivers, onToggleStatus, onColorChange }) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Driver
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Status
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Sticker Color
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Today Deliveries
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Avg Late
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            KPI Score
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Complaints
          </th>
          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
            Actions
          </th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {drivers.map((driver) => {
          const firstName = driver?.profile?.firstName || 'Unknown';
          const lastName = driver?.profile?.lastName || 'Driver';
          const phone = driver?.profile?.phone || 'No phone';
          const status = driver?.profile?.status || 'offline';
          const todayDeliveries = driver?.todayDeliveries || 0;
          const avgLateTime = driver?.kpi?.avgLateTime || 0;
          const kpiScore = driver?.kpi?.score || 0;
          const complaintsCount = driver?.kpi?.complaintsCount || 0;
          const isActive = driver?.isActive !== false;
          const colorCode = driver?.profile?.colorCode || '#000000';

          return (
            <tr key={driver._id} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center">
                  <div className="mr-3">
                    <UserAvatar
                      user={driver}
                      size="small"
                      showStatus
                      fallbackName={`${firstName} ${lastName}`}
                      fallbackEmail={driver?.email || `${firstName}.${lastName}@drivers.local`}
                    />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {firstName} {lastName}
                    </div>
                    <div className="text-sm text-gray-500">{phone}</div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(status)}`}>
                  {status}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap">
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={colorCode}
                    onChange={(e) => onColorChange?.(driver._id, e.target.value)}
                    className="w-8 h-8 border border-gray-300 rounded cursor-pointer"
                    title="Select driver sticker color"
                  />
                  <span className="text-xs font-mono text-gray-500 hidden xl:block">{colorCode}</span>
                </div>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {todayDeliveries}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {avgLateTime}m
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <span className={`font-semibold ${getKpiColor(kpiScore)}`}>
                  {kpiScore}
                </span>
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {complaintsCount}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                <div className="flex space-x-2">
                  <Link
                    to={`/drivers/${driver._id}`}
                    className="text-blue-600 hover:text-blue-900"
                  >
                    View
                  </Link>
                  <button 
                    onClick={() => onToggleStatus(driver._id, isActive)}
                    className={isActive ? 'text-red-600 hover:text-red-900' : 'text-green-600 hover:text-green-900'}
                  >
                    {isActive ? 'Disable' : 'Enable'}
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
));

export default Drivers;
