import React, { useState } from 'react';

function daysBetweenInclusive(startStr, endStr) {
  const start = new Date(`${startStr}T00:00:00`);
  const end = new Date(`${endStr}T00:00:00`);
  const diff = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return Number.isFinite(diff) && diff > 0 ? diff : 0;
}

function LogVacationModal({ driver, onClose, onSave }) {
  const vacation = driver?.profile?.vacation || {};
  const [allowanceDays, setAllowanceDays] = useState(vacation.allowanceDays ?? 30);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const today = new Date();
  const isCurrentlyOnVacation = vacation.currentStart && vacation.currentEnd
    && new Date(vacation.currentStart) <= today && today <= new Date(vacation.currentEnd);

  const days = startDate && endDate ? daysBetweenInclusive(startDate, endDate) : 0;

  const handleLog = async () => {
    setError('');
    if (!startDate || !endDate) {
      setError('Please select a start and end date.');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      setError('End date must be on or after the start date.');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        allowanceDays: Number(allowanceDays) || 0,
        usedDays: (vacation.usedDays || 0) + days,
        currentStart: startDate,
        currentEnd: endDate,
        history: [
          ...(vacation.history || []),
          { startDate, endDate, days, reason: reason.trim() || undefined, loggedAt: new Date().toISOString() }
        ]
      });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to log vacation');
    } finally {
      setSaving(false);
    }
  };

  const handleEndNow = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave({
        allowanceDays: Number(allowanceDays) || 0,
        usedDays: vacation.usedDays || 0,
        currentStart: null,
        currentEnd: null,
        history: vacation.history || []
      });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update vacation');
    } finally {
      setSaving(false);
    }
  };

  const handleAllowanceOnly = async () => {
    setSaving(true);
    setError('');
    try {
      await onSave({
        allowanceDays: Number(allowanceDays) || 0,
        usedDays: vacation.usedDays || 0,
        currentStart: vacation.currentStart || null,
        currentEnd: vacation.currentEnd || null,
        history: vacation.history || []
      });
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to update allowance');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900">Vacation — {driver?.profile?.firstName} {driver?.profile?.lastName}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <span className="text-gray-500">Used so far</span>
            <span className="font-semibold text-gray-900">{vacation.usedDays || 0} / {allowanceDays} days</span>
          </div>

          {isCurrentlyOnVacation && (
            <div className="flex items-center justify-between text-sm bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <span className="text-amber-700">
                Currently on vacation until {new Date(vacation.currentEnd).toLocaleDateString()}
              </span>
              <button
                onClick={handleEndNow}
                disabled={saving}
                className="text-amber-700 font-medium hover:underline disabled:opacity-50"
              >
                End Now
              </button>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Annual Allowance (days)</label>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                value={allowanceDays}
                onChange={(e) => setAllowanceDays(e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={handleAllowanceOnly}
                disabled={saving}
                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Log a Vacation Period</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm mb-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {days > 0 && <p className="text-xs text-gray-500 mb-2">{days} day{days === 1 ? '' : 's'}</p>}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
          )}
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-gray-100 rounded-b-xl">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={handleLog}
            disabled={saving || !startDate || !endDate}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Log Vacation'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default LogVacationModal;
