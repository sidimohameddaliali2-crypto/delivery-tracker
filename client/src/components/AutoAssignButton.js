import React, { useState } from 'react';
import axios from 'axios';
import { Zap, Loader, AlertCircle, CheckCircle, Users } from 'lucide-react';

/**
 * AI Auto-Assignment Component
 * Allows dispatchers to auto-assign deliveries to optimal drivers
 */
const AutoAssignButton = ({ delivery, onAssignmentComplete }) => {
  const [isAssigning, setIsAssigning] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState('');
  const [useAI, setUseAI] = useState(false);

  // Get assignment suggestions
  const getSuggestions = async () => {
    try {
      setError('');
      setIsAssigning(true);
      
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `http://localhost:5000/api/deliveries/${delivery._id}/assignment-suggestions`,
        { useAI, maxDistance: 50, minScore: 30 },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setSuggestions(response.data.data);
        setShowSuggestions(true);
      }
    } catch (err) {
      console.error('Get suggestions error:', err);
      setError(err.response?.data?.message || 'Failed to get suggestions');
    } finally {
      setIsAssigning(false);
    }
  };

  // Perform auto-assignment
  const performAutoAssign = async () => {
    try {
      setError('');
      setIsAssigning(true);
      
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `http://localhost:5000/api/deliveries/${delivery._id}/auto-assign`,
        { useAI, maxDistance: 50, minScore: 30 },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        setShowSuggestions(false);
        setSuggestions(null);
        if (onAssignmentComplete) {
          onAssignmentComplete(response.data.data.delivery);
        }
      }
    } catch (err) {
      console.error('Auto-assign error:', err);
      setError(err.response?.data?.message || 'Failed to auto-assign delivery');
    } finally {
      setIsAssigning(false);
    }
  };

  return (
    <div className="relative">
      {/* Main Auto-Assign Button */}
      <div className="flex items-center gap-2">
        <button
          onClick={getSuggestions}
          disabled={isAssigning || delivery.status === 'delivered' || delivery.status === 'cancelled'}
          className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:from-purple-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
        >
          {isAssigning ? (
            <Loader className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          AI Auto-Assign
        </button>

        {/* AI Toggle */}
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={useAI}
            onChange={(e) => setUseAI(e.target.checked)}
            className="rounded"
          />
          <span className="text-gray-600">Use OpenAI</span>
        </label>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Suggestions Modal */}
      {showSuggestions && suggestions && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-6 rounded-t-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="h-6 w-6" />
                  <h3 className="text-xl font-semibold">AI Assignment Suggestion</h3>
                </div>
                <button
                  onClick={() => setShowSuggestions(false)}
                  className="text-white hover:bg-white hover:bg-opacity-20 rounded-lg p-2 transition"
                >
                  ✕
                </button>
              </div>
              <p className="mt-2 text-purple-100 text-sm">
                {suggestions.method === 'openai' ? '🤖 Powered by OpenAI' : '📊 Rule-based scoring'}
              </p>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Recommended Driver */}
              <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  <h4 className="font-semibold text-green-900">Recommended Driver</h4>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-bold text-green-900">
                      {suggestions.assignedDriver.name}
                    </span>
                    <span className="px-4 py-2 bg-green-600 text-white rounded-full text-sm font-medium">
                      Score: {suggestions.score.toFixed(1)}/100
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-600">Distance:</span>
                      <span className="ml-2 font-medium text-gray-900">
                        {suggestions.distance === Infinity 
                          ? 'Unknown' 
                          : `${suggestions.distance.toFixed(2)} km`}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Email:</span>
                      <span className="ml-2 font-medium text-gray-900 truncate">
                        {suggestions.assignedDriver.email}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-3 border border-green-200">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium">Reason:</span> {suggestions.reason}
                    </p>
                  </div>
                </div>
              </div>

              {/* Alternative Drivers */}
              {suggestions.alternativeDrivers && suggestions.alternativeDrivers.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Users className="h-5 w-5 text-gray-600" />
                    <h4 className="font-semibold text-gray-900">Alternative Options</h4>
                  </div>
                  
                  <div className="space-y-2">
                    {suggestions.alternativeDrivers.map((driver, index) => (
                      <div 
                        key={driver.id}
                        className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:bg-gray-100 transition"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">{driver.name}</p>
                            <p className="text-sm text-gray-600">
                              {driver.distance === Infinity 
                                ? 'Distance unknown' 
                                : `${driver.distance.toFixed(2)} km away`}
                            </p>
                          </div>
                          <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded-full text-sm font-medium">
                            {driver.score.toFixed(1)}/100
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  onClick={performAutoAssign}
                  disabled={isAssigning}
                  className="flex-1 bg-gradient-to-r from-purple-500 to-indigo-600 text-white py-3 px-6 rounded-lg hover:from-purple-600 hover:to-indigo-700 disabled:opacity-50 font-medium transition-all shadow-md hover:shadow-lg"
                >
                  {isAssigning ? (
                    <>
                      <Loader className="inline h-4 w-4 mr-2 animate-spin" />
                      Assigning...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="inline h-4 w-4 mr-2" />
                      Confirm Assignment
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => setShowSuggestions(false)}
                  disabled={isAssigning}
                  className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50 font-medium transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AutoAssignButton;
