import React from 'react';
import { formatDateMDY } from '../utils/subscriptionFormat';

export const statusColors = {
  active: 'bg-emerald-100 text-emerald-700',
  paused: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-gray-100 text-gray-500',
  expired: 'bg-gray-100 text-gray-500',
};

export const matchLabels = { email: 'Matched by email', phone: 'Matched by phone', name: 'Matched by name' };

export const StatusBadge = ({ status }) => (
  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${statusColors[status] || 'bg-gray-100 text-gray-600'}`}>
    {status || 'unknown'}
  </span>
);

export const CycleEndBadge = ({ cycleEndDate }) => (
  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 whitespace-nowrap">
    Cycle end {formatDateMDY(cycleEndDate)}
  </span>
);

export function Card({ title, icon: Icon, action, children, className = '' }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-5 ${className}`}>
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-700 uppercase tracking-wide">
            {Icon && <Icon className="w-4 h-4 text-gray-400" />}
            {title}
          </h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Field({ label, value }) {
  return (
    <div>
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm text-gray-900 font-medium break-words">{value ?? '—'}</p>
    </div>
  );
}

export function StatTile({ icon: Icon, label, value, sub, color = 'bg-purple-100 text-purple-600' }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">{label}</p>
        <p className="text-lg font-bold text-gray-900 leading-tight truncate">{value ?? '—'}</p>
        {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
      </div>
    </div>
  );
}
