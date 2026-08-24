import React, { useState } from 'react';

function FlaggedCustomersModal({ flaggedCustomers, onClose }) {
  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Flagged Customers</h3>
            <p className="text-sm text-gray-500">Customers holding 3+ bags</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="overflow-y-auto divide-y divide-gray-100">
          {flaggedCustomers.map((c) => (
            <div key={c.key} className="flex items-center justify-between px-6 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{c.customerName}</p>
                {c.customerId && <p className="text-xs text-gray-500">ID: {c.customerId}</p>}
              </div>
              <span className="text-sm font-semibold text-amber-600 flex-shrink-0 ml-3">{c.bags.length} bags</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function BagLifecycleAnalyticsCard({ assignedCount, remainingCount, flaggedCustomers }) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <div className="col-span-12 lg:col-span-5 flex flex-col gap-2">
      <h3 className="text-lg font-semibold text-gray-900 mb-1">Bag Lifecycle Analytics</h3>
      <div className="grid grid-cols-2 gap-2 h-full">
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center text-center">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined">work</span>
          </div>
          <div className="text-2xl font-semibold text-gray-900">{assignedCount.toLocaleString()}</div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Assigned Bags</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-4 flex flex-col justify-center items-center text-center">
          <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined">pending_actions</span>
          </div>
          <div className="text-2xl font-semibold text-gray-900">{remainingCount.toLocaleString()}</div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Remaining</div>
        </div>
        <button
          type="button"
          onClick={() => flaggedCustomers.length > 0 && setIsModalOpen(true)}
          disabled={flaggedCustomers.length === 0}
          className={`bg-white border border-gray-200 rounded-xl p-4 col-span-2 text-left ${flaggedCustomers.length > 0 ? 'cursor-pointer hover:border-amber-300 hover:shadow-sm transition-all' : 'cursor-default'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined">flag</span>
              </div>
              <div>
                <div className="text-2xl font-semibold text-gray-900">{flaggedCustomers.length}</div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Flagged Customers (3+ bags)</div>
              </div>
            </div>
            {flaggedCustomers.length > 0 && (
              <span className="text-xs font-medium text-blue-600 flex-shrink-0">View All</span>
            )}
          </div>
          {flaggedCustomers.length > 0 && (
            <div className="w-full bg-gray-50 rounded p-2 mt-2">
              <ul className="text-sm space-y-1">
                {flaggedCustomers.slice(0, 3).map((c) => (
                  <li key={c.key} className="flex justify-between">
                    <span className="text-gray-500 truncate">{c.customerName}</span>
                    <span className="font-medium text-gray-900 flex-shrink-0 ml-2">{c.bags.length} bags</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </button>
      </div>

      {isModalOpen && (
        <FlaggedCustomersModal flaggedCustomers={flaggedCustomers} onClose={() => setIsModalOpen(false)} />
      )}
    </div>
  );
}

export default BagLifecycleAnalyticsCard;
