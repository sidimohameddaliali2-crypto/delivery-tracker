import React, { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, 
  Download, 
  FileText, 
  CheckCircle, 
  XCircle, 
  Clock,
  RefreshCw,
  Filter,
  Plus,
  X,
  Save
} from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { uploadDeliveryChanges, fetchDeliveryChanges, processPendingChanges, createDeliveryChange } from '../store/slices/deliveryChangeSlice';
import api from '../utils/api';

const DeliveryChanges = () => {
  const dispatch = useDispatch();
  const { changes, isLoading, uploadResult, error } = useSelector(state => state.deliveryChange);
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showManualForm, setShowManualForm] = useState(false);
  const [filters, setFilters] = useState({
    status: '',
    startDate: '',
    endDate: '',
    customerId: ''
  });

  // Manual form state
  const [manualForm, setManualForm] = useState({
    customerId: '',
    customerName: '',
    scheduledDate: '',
    endDate: '',
    address: '',
    zone: '',
    scheduledTime: '',
    notes: '',
    reason: 'address change' // 'address change' or 'timing change'
  });

  const [dateRange, setDateRange] = useState({ from: undefined, to: undefined });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectionMode, setSelectionMode] = useState('range'); // 'range' | 'multiple'
  const [selectedDates, setSelectedDates] = useState([]); // for multiple-date selection

  // Keep dateRange and manualForm in sync
  useEffect(() => {
    const parseISO = (s) => (s ? new Date(s + 'T00:00:00') : undefined);
    setDateRange({ from: parseISO(manualForm.scheduledDate), to: parseISO(manualForm.endDate) });
  }, []);

  useEffect(() => {
    if (selectionMode !== 'range') return;
    if (!dateRange || !dateRange.from) return;
    const fmt = (d) => (d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10) : '');
    const startDate = fmt(dateRange.from);
    const endDate = dateRange.to ? fmt(dateRange.to) : startDate; // If no end date, use start date
    setManualForm((prev) => ({
      ...prev,
      scheduledDate: startDate,
      endDate: endDate
    }));
  }, [dateRange, selectionMode]);

  // Sync manualForm when multiple dates are selected: set to earliest date for validation/display
  useEffect(() => {
    if (selectionMode !== 'multiple') return;
    if (!Array.isArray(selectedDates) || selectedDates.length === 0) {
      setManualForm((prev) => ({ ...prev, scheduledDate: '', endDate: '' }));
      return;
    }
    const sorted = [...selectedDates].sort((a, b) => a - b);
    const first = sorted[0];
    const fmt = (d) => (d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10) : '');
    const firstStr = fmt(first);
    setManualForm((prev) => ({ ...prev, scheduledDate: firstStr, endDate: firstStr }));
  }, [selectedDates, selectionMode]);

  useEffect(() => {
    loadChanges();
  }, []);

  const loadChanges = () => {
    dispatch(fetchDeliveryChanges(filters));
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      await dispatch(uploadDeliveryChanges(formData)).unwrap();
      setSelectedFile(null);
      setShowUpload(false);
      loadChanges();
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  const handleProcessPending = async () => {
    try {
      await dispatch(processPendingChanges()).unwrap();
      loadChanges();
    } catch (error) {
      console.error('Process pending failed:', error);
    }
  };

 const handleApplyChange = async (changeId) => {
  try {
    console.log('Applying change:', changeId);
    
    // First, let's debug what's happening
    const debugResponse = await api.get(`/delivery-changes/debug/${changeId}`);
    console.log('Debug info:', debugResponse.data);

    if (debugResponse.data.deliveryCount === 0) {
      alert(`No delivery found for customer ${debugResponse.data.change.customerId} on ${new Date(debugResponse.data.change.scheduledDate).toLocaleDateString()}. Please create the delivery first.`);
      return;
    }

    // Now apply the change
    const response = await api.post(`/delivery-changes/${changeId}/apply`);
    
    if (response.data.success) {
      alert('Changes applied successfully!');
      loadChanges(); // Refresh the list
    } else {
      throw new Error(response.data.message);
    }
  } catch (error) {
    console.error('Failed to apply change:', error);
    
    if (error.response?.data?.message) {
      alert(`Failed to apply changes: ${error.response.data.message}`);
    } else {
      alert('Failed to apply changes. Please check the console for details.');
    }
  }
};
const handleManualSubmit = async (e) => {
  e.preventDefault();
  
  try {
    // Basic client-side validation to avoid 400s
    if (!manualForm.customerId?.trim()) {
      alert('Please enter Customer ID');
      return;
    }
    if (!manualForm.customerName?.trim()) {
      alert('Please enter Customer Name');
      return;
    }
    if (!manualForm.scheduledDate) {
      alert('Please select a Schedule Date');
      setShowDatePicker(true);
      return;
    }

    const baseChanges = {};
    if (manualForm.address) baseChanges.address = manualForm.address;
    if (manualForm.zone) baseChanges.zone = manualForm.zone;
    if (manualForm.scheduledTime) baseChanges.scheduledTime = manualForm.scheduledTime;
    if (manualForm.notes) baseChanges.notes = manualForm.notes;

    const fmt = (d) => (d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10) : '');

    if (selectionMode === 'multiple' && Array.isArray(selectedDates) && selectedDates.length > 0) {
      const sorted = [...selectedDates].sort((a, b) => a - b);
      for (const d of sorted) {
        const dateStr = fmt(d);
        const changeData = {
          customerId: manualForm.customerId,
          customerName: manualForm.customerName,
          scheduledDate: dateStr,
          endDate: dateStr,
          changes: { ...baseChanges },
          reason: manualForm.reason
        };
        await dispatch(createDeliveryChange(changeData)).unwrap();
      }
    } else {
      const changeData = {
        customerId: manualForm.customerId,
        customerName: manualForm.customerName,
        scheduledDate: manualForm.scheduledDate,
        endDate: manualForm.endDate || manualForm.scheduledDate,
        changes: { ...baseChanges },
        reason: manualForm.reason
      };
      await dispatch(createDeliveryChange(changeData)).unwrap();
    }
    
    // Reset form and close modal
    setManualForm({
      customerId: '',
      customerName: '',
      scheduledDate: '',
      endDate: '',
      address: '',
      zone: '',
      scheduledTime: '',
      notes: '',
      reason: 'address change'
    });
    setShowManualForm(false);
    // Reset date selections
    setDateRange({ from: undefined, to: undefined });
    setSelectedDates([]);
    setSelectionMode('range');
    loadChanges();
    
    alert('Delivery change created successfully!');
  } catch (error) {
    console.error('Failed to create manual change:', error);
    alert(error.response?.data?.message || 'Failed to create delivery change');
  }
};


  const handleManualFormChange = (e) => {
    const { name, value } = e.target;
    setManualForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      applied: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      failed: { color: 'bg-red-100 text-red-800', icon: XCircle },
      cancelled: { color: 'bg-gray-100 text-gray-800', icon: XCircle }
    };

    const config = statusConfig[status] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full flex items-center w-fit ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const formatChangeValue = (value, fieldKey = '') => {
    if (value === null || value === undefined) {
      return '—';
    }
    
    // Special formatting for specific fields
    if (fieldKey === 'scheduledTime' && typeof value === 'string') {
      try {
        const date = new Date(value);
        return date.toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          second: undefined,
          hour12: true,
          timeZone: 'UTC'
        });
      } catch (e) {
        return String(value);
      }
    }
    
    if (typeof value === 'object') {
      // Handle driver objects - show firstName or driver name
      if (fieldKey === 'driver') {
        if (value.profile && value.profile.firstName) {
          return value.profile.firstName;
        }
        if (value.firstName) return value.firstName;
        if (value.name) return value.name;
        // If it's just an ID, return it
        return JSON.stringify(value).substring(0, 20) + '...';
      }
      
      // Handle nested objects with old/new values
      if (value.newValue !== undefined && value.oldValue !== undefined) {
        // Format based on field type
        const oldFormatted = formatChangeValue(value.oldValue, fieldKey);
        const newFormatted = formatChangeValue(value.newValue, fieldKey);
        return `${oldFormatted} → ${newFormatted}`;
      }
      
      // Try to extract meaningful properties
      if (value.name) return value.name;
      if (value.firstName && value.lastName) return `${value.firstName} ${value.lastName}`;
      if (value.firstName) return value.firstName;
      
      // Last resort - stringify but keep it readable
      const str = JSON.stringify(value);
      return str.length > 50 ? str.substring(0, 47) + '...' : str;
    }
    
    return String(value);
  };

  const downloadTemplate = () => {
    const template = `customerId,customerName,customerPhone,scheduledDate,endDate,address,scheduledTime,company,notes,reason
CUST001,John Doe,+1234567890,2024-11-15,2024-11-15,123 New Main St,09:00,Matter,Leave at back door,Address update
CUST002,Jane Smith,+1234567891,2024-11-15,2024-11-17,456 Updated Oak Ave,10:30,Yellow Block,Ring bell twice,Time change window
CUST003,Bob Wilson,+1234567892,2024-11-16,2024-11-16,789 Pine Rd,14:00,CookIt,Call on arrival,Company change`;

    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'delivery-changes-template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Delivery Changes</h1>
            <p className="text-gray-600 text-sm mt-1">Manage pre-emptive delivery updates</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            <button
              onClick={handleProcessPending}
              className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium transition-colors text-sm"
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Process Pending
            </button>
            <button
              onClick={downloadTemplate}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors text-sm"
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </button>
            <button
              onClick={() => setShowManualForm(true)}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors text-sm"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Manual Change
            </button>
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium transition-colors text-sm"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Changes
            </button>
          </div>
      </div>

      {/* Manual Change Modal */}
      <AnimatePresence>
        {showManualForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Add Manual Delivery Change</h2>
                <button
                  onClick={() => setShowManualForm(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <form onSubmit={handleManualSubmit} className="p-6 space-y-6">
                {/* Hidden required inputs to allow browser validation */}
                <input type="hidden" name="scheduledDate" value={manualForm.scheduledDate || ''} required />
                <input type="hidden" name="customerIdHidden" value={manualForm.customerId || ''} required />
                <input type="hidden" name="customerNameHidden" value={manualForm.customerName || ''} required />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Customer ID with CUST- prefix */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Customer ID *
                    </label>
                    <div className="flex items-center">
                      <span className="px-3 py-2 bg-gray-200 border border-gray-300 rounded-l-lg text-gray-700 font-medium">
                        CUST-
                      </span>
                      <input
                        type="text"
                        name="customerId"
                        value={(manualForm.customerId || '').replace(/^CUST-?/i, '')}
                        onChange={(e) => setManualForm(prev => ({
                          ...prev,
                          customerId: `CUST-${(e.target.value || '').replace(/\D+/g, '')}`
                        }))}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="001"
                      />
                    </div>
                  </div>

                  {/* Customer Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Customer Name *
                    </label>
                    <input
                      type="text"
                      name="customerName"
                      value={manualForm.customerName}
                      onChange={handleManualFormChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="John Doe"
                    />
                  </div>

                  {/* Schedule Date (range or multiple) - trigger button showing a popup */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Schedule Date
                    </label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setShowDatePicker(true)}
                        className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600"
                      >
                        Select Schedule Date
                      </button>
                      <div className="text-sm text-gray-700">
                        {selectionMode === 'range' ? (
                          manualForm.scheduledDate && manualForm.endDate && manualForm.endDate !== manualForm.scheduledDate ? (
                            <span>
                              Selected: <span className="font-medium">{manualForm.scheduledDate}</span> → <span className="font-medium">{manualForm.endDate}</span>
                            </span>
                          ) : manualForm.scheduledDate ? (
                            <span>Selected: <span className="font-medium">{manualForm.scheduledDate}</span></span>
                          ) : (
                            <span className="text-gray-500">No date selected</span>
                          )
                        ) : (
                          Array.isArray(selectedDates) && selectedDates.length > 0 ? (
                            <span>Selected: <span className="font-medium">{selectedDates.length}</span> date{selectedDates.length>1?'s':''}</span>
                          ) : (
                            <span className="text-gray-500">No date selected</span>
                          )
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      Use Range for continuous days, or Multiple Dates to pick specific days.
                    </p>
                  </div>

                  {/* Reason for Change */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Reason for Change *
                    </label>
                    <select
                      name="reason"
                      value={manualForm.reason}
                      onChange={handleManualFormChange}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="address change">Address Change</option>
                      <option value="timing change">Timing Change</option>
                    </select>
                  </div>

                  {/* New Address */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Address
                    </label>
                    <textarea
                      name="address"
                      value={manualForm.address}
                      onChange={handleManualFormChange}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter new address (leave blank if no address change)..."
                    />
                  </div>

                  {/* New Timing */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Zone
                    </label>
                    <input
                      type="text"
                      name="zone"
                      value={manualForm.zone}
                      onChange={handleManualFormChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Enter zone (optional)"
                    />
                  </div>

                  {/* New Timing */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      New Scheduled Time
                    </label>
                    <input
                      type="time"
                      name="scheduledTime"
                      value={manualForm.scheduledTime}
                      onChange={handleManualFormChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>

                  {/* Additional Notes */}
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Additional Notes
                    </label>
                    <textarea
                      name="notes"
                      value={manualForm.notes}
                      onChange={handleManualFormChange}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="Any additional information..."
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={() => setShowManualForm(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                  >
                    <Save className="w-4 h-4 mr-2" />
                    Save Change
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Schedule Date Picker Modal */}
      <AnimatePresence>
        {showDatePicker && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-lg w-full max-w-lg"
            >
              <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">Select Schedule Date</h3>
                <button
                  onClick={() => setShowDatePicker(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm text-gray-600">Mode:</span>
                  <button
                    type="button"
                    onClick={() => setSelectionMode('range')}
                    className={`px-3 py-1 rounded-md text-sm border ${selectionMode==='range' ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    Range
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectionMode('multiple')}
                    className={`px-3 py-1 rounded-md text-sm border ${selectionMode==='multiple' ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}`}
                  >
                    Multiple Dates
                  </button>
                </div>
                {selectionMode === 'range' ? (
                  <DayPicker
                    mode="range"
                    selected={dateRange}
                    onSelect={setDateRange}
                    numberOfMonths={1}
                    weekStartsOn={1}
                    showOutsideDays
                  />
                ) : (
                  <DayPicker
                    mode="multiple"
                    selected={selectedDates}
                    onSelect={setSelectedDates}
                    numberOfMonths={1}
                    weekStartsOn={1}
                    showOutsideDays
                  />
                )}
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    {selectionMode === 'range' ? (
                      manualForm.scheduledDate && manualForm.endDate && manualForm.endDate !== manualForm.scheduledDate ? (
                        <span>
                          {manualForm.scheduledDate} → {manualForm.endDate}
                        </span>
                      ) : manualForm.scheduledDate ? (
                        <span>{manualForm.scheduledDate}</span>
                      ) : (
                        <span className="text-gray-500">No date selected</span>
                      )
                    ) : (
                      Array.isArray(selectedDates) && selectedDates.length > 0 ? (
                        <span>{selectedDates.length} date{selectedDates.length>1?'s':''} selected</span>
                      ) : (
                        <span className="text-gray-500">No date selected</span>
                      )
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (selectionMode === 'range') {
                          setDateRange({ from: undefined, to: undefined });
                        } else {
                          setSelectedDates([]);
                        }
                        setManualForm((prev) => ({ ...prev, scheduledDate: '', endDate: '' }));
                      }}
                      className="px-3 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                    >
                      Clear
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (selectionMode === 'range') {
                          // ensure manualForm sync happens if user didn't click on any date after opening
                          if (!dateRange || !dateRange.from) {
                            alert('Please select a date or range');
                            return;
                          }
                          const fmt = (d) => (d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10) : '');
                          const startDate = fmt(dateRange.from);
                          const endDate = dateRange.to ? fmt(dateRange.to) : startDate;
                          setManualForm((prev) => ({ ...prev, scheduledDate: startDate, endDate }));
                        } else {
                          if (!Array.isArray(selectedDates) || selectedDates.length === 0) {
                            alert('Please select at least one date');
                            return;
                          }
                          const sorted = [...selectedDates].sort((a, b) => a - b);
                          const first = sorted[0];
                          const fmt = (d) => (d ? new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10) : '');
                          const firstStr = fmt(first);
                          setManualForm((prev) => ({ ...prev, scheduledDate: firstStr, endDate: firstStr }));
                        }
                        setShowDatePicker(false);
                      }}
                      className="px-3 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>


      {/* Upload Modal */}
      <AnimatePresence>
        {showUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-white rounded-lg w-full max-w-2xl"
            >
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-xl font-bold text-gray-900">Upload Delivery Changes</h2>
                <button
                  onClick={() => setShowUpload(false)}
                  className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Upload CSV File
                  </label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                    <input
                      type="file"
                      accept=".csv,.xlsx,.xls"
                      onChange={handleFileSelect}
                      className="hidden"
                      id="file-upload"
                    />
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <Upload className="w-12 h-12 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600">
                        {selectedFile ? selectedFile.name : 'Click to select CSV file'}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        Supports CSV, Excel files. Max 10MB.
                      </p>
                    </label>
                  </div>
                </div>

                {selectedFile && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <FileText className="w-8 h-8 text-blue-500 mr-3" />
                        <div>
                          <p className="font-medium text-blue-900">{selectedFile.name}</p>
                          <p className="text-sm text-blue-700">
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSelectedFile(null)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <XCircle className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}

                {uploadResult && (
                  <div className={`p-4 rounded-lg ${
                    uploadResult.errors.length > 0 
                      ? 'bg-yellow-50 border border-yellow-200' 
                      : 'bg-green-50 border border-green-200'
                  }`}>
                    <div className="flex items-center mb-2">
                      <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                      <span className="font-medium">
                        Processed {uploadResult.processed} changes
                        {uploadResult.errors.length > 0 && `, ${uploadResult.errors.length} errors`}
                      </span>
                    </div>
                    
                    {uploadResult.errors.length > 0 && (
                      <div className="mt-2">
                        <p className="text-sm font-medium text-yellow-800">Errors:</p>
                        <ul className="text-sm text-yellow-700 list-disc list-inside">
                          {uploadResult.errors.slice(0, 5).map((error, index) => (
                            <li key={index}>Row {error.row}: {error.error}</li>
                          ))}
                          {uploadResult.errors.length > 5 && (
                            <li>... and {uploadResult.errors.length - 5} more errors</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowUpload(false);
                      setSelectedFile(null);
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={!selectedFile || isLoading}
                    className="flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
                  >
                    {isLoading ? 'Uploading...' : 'Upload Changes'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center">
            <Filter className="w-4 h-4 text-gray-400 mr-2" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>
          
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
          >
            <option value="">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="applied">Applied</option>
            <option value="failed">Failed</option>
          </select>

          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Start Date"
          />

          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="End Date"
          />

          <input
            type="text"
            value={filters.customerId}
            onChange={(e) => setFilters({ ...filters, customerId: e.target.value })}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            placeholder="Customer ID"
          />

          <button
            onClick={loadChanges}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 whitespace-nowrap"
          >
            Apply Filters
          </button>
        </div>
      </div>

      {/* Changes List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-6 py-4 text-left font-semibold text-gray-700 whitespace-nowrap">
                Customer
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700 whitespace-nowrap">
                Date
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700 min-w-80">
                Changes
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700 whitespace-nowrap">
                Status
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700 whitespace-nowrap">
                Confidence
              </th>
              <th className="px-6 py-4 text-left font-semibold text-gray-700 whitespace-nowrap">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {changes.map((change) => (
              <tr key={change._id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div>
                    <div className="font-semibold text-gray-900 truncate">
                      {change.customerName}
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {change.customerId}
                    </div>
                    {change.customerPhone && (
                      <div className="text-xs text-gray-500 truncate">
                        {change.customerPhone}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm text-gray-900 font-medium">
                    {new Date(change.scheduledDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="space-y-2 max-w-md">
                    {Object.entries(change.changes).map(([key, value]) => (
                      <div key={key} className="text-xs bg-gray-50 p-2 rounded border border-gray-200">
                        <div className="font-medium text-gray-700 capitalize">
                          {key.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                        <div className="text-gray-600 mt-1 break-words">
                          {formatChangeValue(value, key)}
                        </div>
                      </div>
                    ))}
                    {change.reason && (
                      <div className="text-xs text-gray-600 bg-blue-50 p-2 rounded border border-blue-200">
                        <span className="font-medium">Reason:</span> {change.reason}
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(change.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <div className="w-20 bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-500 h-2 rounded-full transition-all"
                        style={{ width: `${change.matchConfidence || 0}%` }}
                      ></div>
                    </div>
                    <span className="text-xs text-gray-600 font-medium w-10 text-right">
                      {change.matchConfidence || 0}%
                    </span>
                  </div>
                  {change.matchingFields && (
                    <div className="text-xs text-gray-500 mt-2">
                      Matched: {change.matchingFields.join(', ')}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {change.status === 'pending' && (
                    <button
                      onClick={() => handleApplyChange(change._id)}
                      className="px-3 py-1 bg-blue-100 text-blue-600 rounded hover:bg-blue-200 font-medium transition-colors text-xs"
                    >
                      Apply
                    </button>
                  )}
                  {change.status === 'applied' && (
                    <div className="text-xs text-green-600 font-medium">
                      ✓ Applied
                    </div>
                  )}
                  {change.status === 'failed' && (
                    <div className="text-xs text-red-600 font-medium">
                      ✗ Failed
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {changes.length === 0 && !isLoading && (
          <div className="text-center py-16">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-600 font-medium">No delivery changes found</p>
            <p className="text-gray-500 text-sm mt-1">Add manual changes or upload a CSV file to get started</p>
          </div>
        )}

        {isLoading && (
          <div className="text-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
            <p className="text-gray-600 mt-4">Loading changes...</p>
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

export default DeliveryChanges;