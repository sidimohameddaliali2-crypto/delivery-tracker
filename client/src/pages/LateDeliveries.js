import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { 
  Search, 
  Filter, 
  Clock, 
  AlertTriangle, 
  CheckCircle, 
  Eye,
  MessageCircle,
  Calendar,
  RefreshCw,
  Download,
  Package,
  AlertCircle
} from 'lucide-react';
import { fetchLateEarlyDeliveries } from '../store/slices/deliverySlice';

const formatDuration = (minutes = 0) => {
  const value = Math.abs(Math.round(minutes));
  if (value < 60) {
    return `${value}m`;
  }

  const hours = Math.floor(value / 60);
  const mins = value % 60;
  return `${hours}h:${mins.toString().padStart(2, '0')}m`;
};

const LateDeliveries = () => {
  const dispatch = useDispatch();
  const { 
    lateEarlyDeliveries = [], 
    lateEarlyStats = {}, 
    lateEarlyDateRange = {},
    isLoading,
    error 
  } = useSelector(state => state.delivery);

  const [filters, setFilters] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    type: 'all',
    search: ''
  });

  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    loadDeliveries();
  }, []);

  const loadDeliveries = () => {
    dispatch(fetchLateEarlyDeliveries(filters));
  };

  const handleFilterChange = (key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleApplyFilters = () => {
    loadDeliveries();
    setShowFilters(false);
  };

  const handleResetFilters = () => {
    const today = new Date().toISOString().split('T')[0];
    setFilters({
      startDate: today,
      endDate: today,
      type: 'all',
      search: ''
    });
  };

  const getStatusBadge = (delivery) => {
    if (delivery.deliveryType === 'late') {
      return (
        <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded-full flex items-center w-fit">
          <Clock className="w-3 h-3 mr-1" />
          Late by {formatDuration(delivery.actualLateMinutes)}
        </span>
      );
    } else if (delivery.deliveryType === 'early') {
      return (
        <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs font-medium rounded-full flex items-center w-fit">
          <AlertTriangle className="w-3 h-3 mr-1" />
          Early by {formatDuration(delivery.earlyMinutes)}
        </span>
      );
    } else {
      return (
        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full flex items-center w-fit">
          <CheckCircle className="w-3 h-3 mr-1" />
          On Time
        </span>
      );
    }
  };

  const formatTime = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatDriverName = (driver) => {
    if (!driver) return 'Unassigned';
    if (driver.profile?.firstName) return driver.profile.firstName;
    if (driver.firstName) return driver.firstName;
    return 'Unknown';
  };

  const filteredDeliveries = lateEarlyDeliveries.filter(delivery =>
    delivery.customerName?.toLowerCase().includes(filters.search.toLowerCase()) ||
    delivery.customerId?.toLowerCase().includes(filters.search.toLowerCase()) ||
    delivery.driver?.profile?.firstName?.toLowerCase().includes(filters.search.toLowerCase()) ||
    delivery.driver?.profile?.lastName?.toLowerCase().includes(filters.search.toLowerCase())
  );

  const exportToCSV = () => {
    const headers = ['Delivery ID', 'Customer', 'Scheduled Time', 'Delivered Time', 'Type', 'Time Difference', 'Driver', 'Company'];
    const csvData = filteredDeliveries.map(delivery => [
      delivery._id,
      delivery.customerName,
      new Date(delivery.scheduledTime).toLocaleString(),
      new Date(delivery.deliveredTime).toLocaleString(),
      delivery.deliveryType === 'late' ? 'Late' : delivery.deliveryType === 'early' ? 'Early' : 'On Time',
      delivery.deliveryType === 'late' ? `+${formatDuration(delivery.actualLateMinutes)}` : 
        delivery.deliveryType === 'early' ? `-${formatDuration(delivery.earlyMinutes)}` : '0m',
      `${delivery.driver?.profile?.firstName} ${delivery.driver?.profile?.lastName}`,
      delivery.company
    ]);
  

    const csvContent = [
      headers.join(','),
      ...csvData.map(row => row.map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `delivery-performance-${filters.startDate}-to-${filters.endDate}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };
  

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Delivery Performance</h1>
            <p className="text-gray-600 text-sm mt-1">Monitor late and early deliveries</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <button
              onClick={exportToCSV}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors text-sm whitespace-nowrap"
              disabled={filteredDeliveries.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </button>
            <button
              onClick={loadDeliveries}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors text-sm whitespace-nowrap"
              disabled={isLoading}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Total Uploaded</p>
              <p className="text-3xl font-bold text-blue-600 mt-2">{lateEarlyStats.total || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Total deliveries</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Completed</p>
              <p className="text-3xl font-bold text-green-600 mt-2">{lateEarlyStats.completed || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Delivered</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Not Completed</p>
              <p className="text-3xl font-bold text-orange-600 mt-2">{lateEarlyStats.incomplete || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Pending</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <AlertCircle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Late Deliveries</p>
              <p className="text-3xl font-bold text-red-600 mt-2">{lateEarlyStats.late || 0}</p>
              <p className="text-xs text-gray-500 mt-1">
                Avg: {formatDuration(lateEarlyStats.avgLateTime || 0)}
              </p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <Clock className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Early Deliveries</p>
              <p className="text-3xl font-bold text-yellow-600 mt-2">{lateEarlyStats.early || 0}</p>
              <p className="text-xs text-gray-500 mt-1">
                Avg: {formatDuration(lateEarlyStats.avgEarlyTime || 0)}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 space-y-4\">
        <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between\">
          <div className="flex flex-wrap items-center gap-2\">
            <button
                onClick={() => setShowFilters(!showFilters)}
              className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors text-sm"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
            </button>

            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search deliveries..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
                className="w-full md:w-72 pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
              />
            </div>
          </div>

          <div className="text-xs md:text-sm text-gray-600 font-medium">
            <span>{filteredDeliveries.length}</span>
            <span className="text-gray-400"> deliveries</span>
            {lateEarlyDateRange.start && (
              <span className="text-gray-500">
                {' '}\u2014 {formatDate(lateEarlyDateRange.start)} to {formatDate(lateEarlyDateRange.end)}
              </span>
            )}
          </div>
        </div>

        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 pt-4 border-t border-gray-200 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange('startDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange('endDate', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Delivery Type
                </label>
                <select
                  value={filters.type}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                >
                  <option value="all">All Types</option>
                  <option value="late">Late Only</option>
                  <option value="early">Early Only</option>
                  <option value="on-time">On Time Only</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col md:flex-row justify-end gap-2 md:space-x-3">
              <button
                onClick={handleResetFilters}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 font-medium transition-colors text-sm"
              >
                Reset
              </button>
              <button
                onClick={handleApplyFilters}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors text-sm"
              >
                Apply Filters
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Deliveries Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-6 py-4 text-left font-semibold text-gray-700">
                Customer
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700">
                Scheduled
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700">
                Delivered
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700">
                Status
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700">
                Driver
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredDeliveries.map((delivery) => (
              <tr key={delivery._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <div className="font-semibold text-gray-900 truncate">
                      {delivery.customerName}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {delivery.customerId}
                    </div>
                    <div className="text-xs text-gray-400">
                      {delivery.company}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-gray-900 font-medium">
                    {formatDate(delivery.scheduledTime)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatTime(delivery.scheduledTime)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-gray-900 font-medium">
                    {formatDate(delivery.deliveredTime)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatTime(delivery.deliveredTime)}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(delivery)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="font-semibold text-gray-900">
                    {formatDriverName(delivery.driver)}
                  </div>
                  <div className="text-xs text-gray-500 truncate">
                    {delivery.driver?.email || 'N/A'}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex gap-2">
                    <Link
                      to={`/deliveries/${delivery._id}`}
                      className="px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 font-medium transition-colors flex items-center text-xs"
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      View
                    </Link>
                    <button className="px-3 py-1 bg-green-100 text-green-600 rounded hover:bg-green-200 font-medium transition-colors flex items-center text-xs">
                      <MessageCircle className="w-3 h-3 mr-1" />
                      Feedback
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredDeliveries.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <AlertTriangle className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">
              {filters.search ? 'No deliveries match your search' : 'No deliveries found'}
            </p>
            <p className="text-gray-500 text-sm mt-1">
              Try adjusting your filters or date range
            </p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading deliveries...</p>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg font-medium">
          {error}
        </div>
      )}
      </div>
    </div>
  );
};

export default LateDeliveries;
