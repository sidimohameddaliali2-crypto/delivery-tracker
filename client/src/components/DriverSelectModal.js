import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const DriverSelectModal = ({ isOpen, onClose, onSelect, currentDriverId }) => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    let mounted = true;
    const loadDrivers = async () => {
      setLoading(true);
      try {
        const res = await api.get('/users/drivers');
        if (!mounted) return;
        setDrivers(res.data?.data || res.data || []);
      } catch (err) {
        console.error('Failed to load drivers for modal:', err);
        setDrivers([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadDrivers();
    return () => { mounted = false; };
  }, [isOpen]);

  const filtered = drivers.filter(d => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (d.profile?.firstName || '').toLowerCase().includes(q) ||
      (d.profile?.lastName || '').toLowerCase().includes(q) ||
      (d.email || '').toLowerCase().includes(q) ||
      (d._id || '').toLowerCase().includes(q)
    );
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-40" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-lg w-full max-w-xl mx-4">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-medium">Reassign Driver</h3>
          <button className="text-gray-600" onClick={onClose}>Close</button>
        </div>
        <div className="p-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search drivers by name, email or id"
            className="w-full border rounded px-3 py-2 mb-3"
          />

          {loading ? (
            <div className="text-center py-6">Loading drivers...</div>
          ) : (
            <div className="max-h-64 overflow-auto">
              {filtered.length === 0 ? (
                <div className="text-center text-sm text-gray-500 py-4">No drivers match your search</div>
              ) : (
                filtered.map(driver => (
                  <div
                    key={driver._id}
                    className={`p-3 rounded hover:bg-gray-50 flex items-center justify-between ${driver._id === currentDriverId ? 'bg-gray-100' : ''}`}
                  >
                    <div>
                      <div className="font-medium">{driver.profile?.firstName} {driver.profile?.lastName}</div>
                      <div className="text-sm text-gray-500">{driver.email} • {driver.todayDeliveries ?? '0'} today</div>
                    </div>
                    <div>
                      <button
                        onClick={() => { onSelect(driver._id); onClose(); }}
                        className="px-3 py-1 bg-blue-500 text-white rounded text-sm"
                      >
                        Select
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DriverSelectModal;
