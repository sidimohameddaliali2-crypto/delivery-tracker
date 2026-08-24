import React from 'react';
import QuickReportForm from './QuickReportForm';

function QuickNewCommunicationModal({ onClose, onSubmitted }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[210] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="text-lg font-bold text-gray-900">New Communication</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6">
          <QuickReportForm
            onCancel={onClose}
            onSubmitted={(issue) => { onSubmitted?.(issue); onClose(); }}
          />
        </div>
      </div>
    </div>
  );
}

export default QuickNewCommunicationModal;
