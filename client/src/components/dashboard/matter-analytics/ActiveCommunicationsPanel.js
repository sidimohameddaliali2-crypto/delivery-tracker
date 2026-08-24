import React from 'react';
import { ISSUE_TYPE_LABELS, formatCompactRelativeTime } from './communications/constants';

const PRIORITY_BADGE = {
  high: { label: 'Urgent', cls: 'bg-red-500 text-white', cardCls: 'bg-red-50 border-red-100' },
  medium: { label: 'High', cls: 'bg-amber-500 text-white', cardCls: 'bg-amber-50 border-amber-100' },
};

function ActiveCommunicationsPanel({ issues, loading, onViewAll, onNewCommunication, onSelectIssue }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-blue-600">forum</span>
          <h3 className="text-lg font-semibold text-gray-900">Active Communications</h3>
        </div>
        <button onClick={onViewAll} className="text-blue-600 font-medium text-sm hover:underline">View All</button>
      </div>
      <div className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar gap-3 pb-1 -mx-1 px-1 md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible md:pb-0 md:mx-0 md:px-0">
        {loading ? (
          <div className="w-full md:col-span-full text-center py-6 text-sm text-gray-400">Loading…</div>
        ) : issues.length === 0 ? (
          <div className="w-full md:col-span-2 flex items-center justify-center p-3 text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg">
            No urgent communications
          </div>
        ) : (
          issues.slice(0, 2).map((issue) => {
            const badge = PRIORITY_BADGE[issue.priority] || PRIORITY_BADGE.medium;
            return (
              <div
                key={issue._id}
                onClick={() => onSelectIssue?.(issue)}
                className={`min-w-[260px] md:min-w-0 flex-shrink-0 snap-center p-3 border rounded-lg flex flex-col gap-2 cursor-pointer hover:shadow-md transition-shadow ${badge.cardCls}`}
              >
                <div className="flex justify-between items-start">
                  <span className={`px-2 py-0.5 text-[11px] font-bold rounded uppercase ${badge.cls}`}>{badge.label}</span>
                  <span className="text-gray-500 text-xs">{formatCompactRelativeTime(issue.createdAt)}</span>
                </div>
                <p className="font-medium text-gray-900 text-sm">
                  {ISSUE_TYPE_LABELS[issue.issueType] || issue.issueType}: {issue.customerName}
                </p>
                <p className="text-sm text-gray-500 line-clamp-2 flex-1">{issue.description}</p>
                <button
                  onClick={(e) => { e.stopPropagation(); onSelectIssue?.(issue); }}
                  className="self-start text-xs font-semibold text-green-700 hover:text-green-800 hover:underline"
                >
                  Resolve
                </button>
              </div>
            );
          })
        )}
        <div className="min-w-[200px] md:min-w-0 flex-shrink-0 snap-center p-3 border border-dashed border-gray-200 rounded-lg flex items-center justify-center text-center">
          <button onClick={onNewCommunication} className="flex flex-col items-center gap-1 text-gray-400 hover:text-blue-600 transition-colors">
            <span className="material-symbols-outlined">add_circle</span>
            <span className="text-xs font-semibold">New Communication</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ActiveCommunicationsPanel;
