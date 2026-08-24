import React from 'react';
import DeliveryIssuesTab from './DeliveryIssuesTab';

function CommunicationsCenterModal({ onClose }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[200] p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Communications Center</h2>
            <p className="text-sm text-gray-500 mt-0.5">Report and track delivery issues per customer</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          <DeliveryIssuesTab />
        </div>
      </div>
    </div>
  );
}

export default CommunicationsCenterModal;
