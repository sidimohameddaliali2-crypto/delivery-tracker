import React, { useState } from 'react';
import axios from 'axios';
import { Loader } from 'lucide-react';

/**
 * API Test Page - Debug delivery fetching
 */
const TestAPI = () => {
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [status, setStatus] = useState('pending');

  const testAPI = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      
      const url = `http://localhost:5000/api/deliveries?status=${status}&dateFrom=${date}&dateTo=${date}&page=1&limit=100`;
      console.log('Testing URL:', url);

      const res = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      console.log('Full response:', res);
      setResponse(res.data);
    } catch (error) {
      console.error('Error:', error);
      setResponse({
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">API Test Page</h1>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-2">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="pending">Pending</option>
              <option value="assigned">Assigned</option>
              <option value="on_route">On Route</option>
              <option value="picked_up">Picked Up</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
              <option value="completed">Completed</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={testAPI}
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-400"
            >
              {loading ? <Loader className="inline animate-spin mr-2" /> : ''}
              Test API
            </button>
          </div>
        </div>
      </div>

      {response && (
        <div className="bg-gray-900 text-green-400 p-6 rounded-lg font-mono text-sm overflow-auto max-h-96">
          <pre>{JSON.stringify(response, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

export default TestAPI;
