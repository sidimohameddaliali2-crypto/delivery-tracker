import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Zap, Loader, CheckCircle, XCircle, Calendar, Filter } from 'lucide-react';
import Layout from '../components/Layout';

/**
 * Batch Auto-Assignment Page
 * Allows dispatchers to auto-assign multiple deliveries at once
 */
const BatchAutoAssign = () => {
  const [deliveries, setDeliveries] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [results, setResults] = useState(null);
  const [filters, setFilters] = useState({
    date: new Date().toISOString().split('T')[0],
    status: 'assigned',  // Changed from 'pending' to 'assigned' to show all active deliveries
    area: ''
  });
  const [useAI, setUseAI] = useState(false);
  const [maxDistance, setMaxDistance] = useState(50);

  // Fetch unassigned deliveries
  const fetchDeliveries = async () => {
    try {
      setIsLoading(true);
      const token = localStorage.getItem('token');
      
      const params = new URLSearchParams({
        dateFrom: filters.date,
        dateTo: filters.date,
        page: 1,
        limit: 100  // Fetch up to 100 deliveries at once
      });

      // Only add status if not viewing all statuses
      if (filters.status) {
        params.append('status', filters.status);
      }

      if (filters.area) {
        params.append('area', filters.area);
      }

      const url = `http://localhost:5000/api/deliveries?${params}`;
      console.log('🔍 Fetching deliveries from:', url);
      console.log('📋 Filters:', { status: filters.status || 'ALL', date: filters.date });

      const response = await axios.get(
        url,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('✅ API Response:', response.data);

      if (response.data.success) {
        // Check if response has deliveries array
        const data = response.data.data.deliveries || response.data.data || [];
        console.log('📦 Raw data received:', data.length, 'deliveries');
        
        const unassigned = data.filter(d => {
          console.log('Checking delivery:', d._id, 'status:', d.status, 'driver:', d.driver);
          return !d.driver || filters.status === 'pending';
        });
        
        console.log('🎯 Filtered deliveries:', unassigned.length);
        setDeliveries(unassigned);
      } else {
        console.error('❌ API returned success:false', response.data);
        setDeliveries([]);
      }
    } catch (error) {
      console.error('❌ Fetch deliveries error:', error);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response data:', error.response.data);
      }
      setDeliveries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDeliveries();
  }, [filters]);

  // Toggle delivery selection
  const toggleSelection = (id) => {
    setSelectedIds(prev => 
      prev.includes(id) 
        ? prev.filter(i => i !== id)
        : [...prev, id]
    );
  };

  // Select all deliveries
  const selectAll = () => {
    if (selectedIds.length === deliveries.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(deliveries.map(d => d._id));
    }
  };

  // Perform batch auto-assignment
  const performBatchAssign = async () => {
    if (selectedIds.length === 0) {
      alert('Please select at least one delivery');
      return;
    }

    if (!confirm(`Auto-assign ${selectedIds.length} deliveries?`)) {
      return;
    }

    try {
      setIsAssigning(true);
      setResults(null);
      
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:5000/api/deliveries/batch/auto-assign',
        { 
          deliveryIds: selectedIds,
          useAI,
          maxDistance,
          minScore: 30
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setResults(response.data.data);
        setSelectedIds([]);
        fetchDeliveries();
      }
    } catch (error) {
      console.error('Batch assign error:', error);
      alert(error.response?.data?.message || 'Failed to batch assign deliveries');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Zap className="h-8 w-8 text-purple-600" />
                AI Batch Auto-Assign
              </h1>
              <p className="text-gray-600 mt-2">
                Automatically assign multiple deliveries to optimal drivers
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Filter className="h-5 w-5 text-gray-600" />
                <h3 className="font-semibold text-gray-900">Filters</h3>
              </div>
              <button
                onClick={fetchDeliveries}
                disabled={isLoading}
                className="px-3 py-1 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition"
              >
                {isLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date
                </label>
                <input
                  type="date"
                  value={filters.date}
                  onChange={(e) => setFilters({ ...filters, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  💡 Try going to Deliveries page to find dates with data
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Status
                </label>
                <select
                  value={filters.status}
                  onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">--- All Statuses ---</option>
                  <option value="pending">Pending</option>
                  <option value="assigned">Assigned</option>
                  <option value="on_route">On Route</option>
                  <option value="picked_up">Picked Up</option>
                  <option value="delivered">Delivered</option>
                  <option value="failed">Failed</option>
                  <option value="completed">Completed</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max Distance (km)
                </label>
                <input
                  type="number"
                  value={maxDistance}
                  onChange={(e) => setMaxDistance(Number(e.target.value))}
                  min="1"
                  max="200"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useAI}
                    onChange={(e) => setUseAI(e.target.checked)}
                    className="w-5 h-5 rounded"
                  />
                  <span className="text-sm font-medium text-gray-700">
                    Use OpenAI
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        {deliveries.length > 0 && (
          <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === deliveries.length}
                    onChange={selectAll}
                    className="w-5 h-5 rounded"
                  />
                  <span className="font-medium text-gray-900">
                    {selectedIds.length === deliveries.length ? 'Deselect All' : 'Select All'}
                  </span>
                </label>
                <span className="text-gray-600">
                  {selectedIds.length} of {deliveries.length} selected
                </span>
              </div>

              <button
                onClick={performBatchAssign}
                disabled={isAssigning || selectedIds.length === 0}
                className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium shadow-md hover:shadow-lg transition-all"
              >
                {isAssigning ? (
                  <>
                    <Loader className="h-5 w-5 mr-2 animate-spin" />
                    Assigning...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5 mr-2" />
                    Auto-Assign {selectedIds.length} Deliveries
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Assignment Results</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-900">Successful</span>
                </div>
                <p className="text-3xl font-bold text-green-600">{results.successCount}</p>
              </div>

              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <span className="font-medium text-red-900">Failed</span>
                </div>
                <p className="text-3xl font-bold text-red-600">{results.failedCount}</p>
              </div>
            </div>

            {results.results.failed.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-red-900 mb-2">Failed Assignments:</h4>
                <ul className="space-y-1">
                  {results.results.failed.map((item, index) => (
                    <li key={index} className="text-sm text-red-700">
                      Delivery {item.deliveryId}: {item.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Deliveries List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader className="h-8 w-8 animate-spin text-purple-600" />
              <span className="ml-3 text-gray-600">Loading deliveries...</span>
            </div>
          ) : deliveries.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Calendar className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600 mb-4 font-medium">No deliveries found for {filters.date}</p>
              <div className="text-sm text-gray-600 space-y-3 mb-4">
                <p className="font-medium">📋 No deliveries exist for this date in the database</p>
                <p>Your database might be empty or deliveries exist on different dates</p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 inline-block">
                  <p className="font-medium text-blue-900 mb-2">Next Steps:</p>
                  <ol className="text-left space-y-1 text-blue-800">
                    <li>1️⃣ Go to <strong>Deliveries</strong> page</li>
                    <li>2️⃣ Try different dates to find ones with data</li>
                    <li>3️⃣ Once you find a date with deliveries, return here</li>
                    <li>4️⃣ Use that date and click Refresh</li>
                  </ol>
                </div>
              </div>
              <div className="flex gap-2 justify-center">
                <button
                  onClick={fetchDeliveries}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition"
                >
                  Refresh Data
                </button>
                <a
                  href="/deliveries"
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
                >
                  Go to Deliveries →
                </a>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.length === deliveries.length}
                        onChange={selectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Customer</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Address</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Area</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Time</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-900">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {deliveries.map((delivery) => (
                    <tr 
                      key={delivery._id}
                      className={`hover:bg-gray-50 transition ${
                        selectedIds.includes(delivery._id) ? 'bg-purple-50' : ''
                      }`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(delivery._id)}
                          onChange={() => toggleSelection(delivery._id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {delivery.customerName}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {delivery.address}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {delivery.area || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(delivery.scheduledTime).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                          delivery.status === 'pending' 
                            ? 'bg-yellow-100 text-yellow-800'
                            : delivery.status === 'assigned'
                            ? 'bg-blue-100 text-blue-800'
                            : delivery.status === 'on_route'
                            ? 'bg-indigo-100 text-indigo-800'
                            : delivery.status === 'picked_up'
                            ? 'bg-purple-100 text-purple-800'
                            : delivery.status === 'delivered'
                            ? 'bg-green-100 text-green-800'
                            : delivery.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : delivery.status === 'completed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}>
                          {delivery.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default BatchAutoAssign;
