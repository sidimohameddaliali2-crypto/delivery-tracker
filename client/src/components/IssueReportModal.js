import React, { useState } from 'react';
import { X } from 'lucide-react';

const IssueReportModal = ({ isOpen, onClose, onSubmit, isLoading, deliveryInfo }) => {
  const [complaintType, setComplaintType] = useState('');
  const [remarks, setRemarks] = useState('');
  const [compensationType, setCompensationType] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [extraDays, setExtraDays] = useState('');

  const complaintTypes = [
    { value: 'late', label: 'Late Delivery' },
    { value: 'early', label: 'Early Delivery' },
    { value: 'missed', label: 'Missed Delivery' },
    { value: 'wrong_address', label: 'Wrong Address' },
    { value: 'delivery_issue', label: 'Delivery Issue' },
    { value: 'food_quality', label: 'Food Quality' },
    { value: 'major_incident', label: 'Major Incident' },
    { value: 'damaged_food', label: 'Damaged Food' },
    { value: 'macros_inaccuracy', label: 'Macros Inaccuracy' },
    { value: 'late_delivery_transcorp', label: 'Late delivery - Transcorp' },
    { value: 'wrong_food', label: 'Wrong Food' },
    { value: 'other', label: 'Other' }
  ];

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!complaintType) {
      alert('Please select a complaint type');
      return;
    }

    if (compensationType === 'refund' && !refundAmount) {
      alert('Please enter refund amount');
      return;
    }

    if (compensationType === 'extra_day' && !extraDays) {
      alert('Please enter number of extra days');
      return;
    }

    const issueData = {
      complaintType,
      remarks
    };

    // Only include compensation if a type is selected
    if (compensationType) {
      issueData.compensation = {
        type: compensationType,
        amount: compensationType === 'refund' ? parseFloat(refundAmount) : undefined,
        days: compensationType === 'extra_day' ? parseInt(extraDays) : undefined
      };
    }

    onSubmit(issueData);

    // Reset form
    setComplaintType('');
    setRemarks('');
    setCompensationType('');
    setRefundAmount('');
    setExtraDays('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-md w-full max-h-screen overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-gray-200 p-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Report Issue</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Delivery Info */}
          {deliveryInfo && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="text-gray-700">
                <span className="font-semibold">Customer:</span> {deliveryInfo.customerName}
              </p>
              <p className="text-gray-700">
                <span className="font-semibold">ID:</span> {deliveryInfo.customerId}
              </p>
            </div>
          )}

          {/* Complaint Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Complaint Type *
            </label>
            <select
              value={complaintType}
              onChange={(e) => setComplaintType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select complaint type</option>
              {complaintTypes.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>

          {/* Remarks */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Remarks
            </label>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={4}
              placeholder="Describe the issue in detail..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Compensation Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Compensation Type (Optional)
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="compensation"
                  value=""
                  checked={compensationType === ''}
                  onChange={(e) => setCompensationType(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">None</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="compensation"
                  value="refund"
                  checked={compensationType === 'refund'}
                  onChange={(e) => setCompensationType(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Refund</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="compensation"
                  value="extra_day"
                  checked={compensationType === 'extra_day'}
                  onChange={(e) => setCompensationType(e.target.value)}
                  className="mr-2"
                />
                <span className="text-sm text-gray-700">Extra Day</span>
              </label>
            </div>
          </div>

          {/* Refund Amount */}
          {compensationType === 'refund' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Refund Amount (AED) *
              </label>
              <input
                type="number"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                step="0.01"
                min="0"
                placeholder="Enter refund amount"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* Extra Days */}
          {compensationType === 'extra_day' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Extra Days *
              </label>
              <input
                type="number"
                value={extraDays}
                onChange={(e) => setExtraDays(e.target.value)}
                min="1"
                placeholder="Enter number of days"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:bg-red-300"
            >
              {isLoading ? 'Submitting...' : 'Submit Report'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default IssueReportModal;
