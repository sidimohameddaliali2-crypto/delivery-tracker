import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';

const TYPE_LABELS = { accident: 'Accident', not_working: 'Not working' };
const dateFmt = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Dubai' });

function IncidentsDialog({ incidents, onClose, onChanged, onReport }) {
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const open = incidents.filter((i) => i.status !== 'resolved');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const resolve = async (incident) => {
    setBusyId(incident._id);
    setError('');
    try {
      await api.patch(`/incidents/${incident._id}`, { status: 'resolved' });
      await onChanged();
    } catch {
      setError('Could not update this incident.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="mo-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mo-modal mo-modal-narrow" role="dialog" aria-modal="true" aria-label="Open incidents">
        <div className="mo-modal-head">
          <div><h2>Open incidents</h2><p>Mark an incident resolved once it is handled.</p></div>
          <button type="button" className="mo-btn" onClick={onClose}>Close</button>
        </div>
        {error && <p className="mo-error" role="alert">{error}</p>}
        <div className="mo-context-list">
          {open.length ? open.map((i) => (
            <div key={i._id} className="mo-context-record">
              <div>
                <strong>{TYPE_LABELS[i.incidentType] || i.incidentType} · {i.vehicleType === 'van' ? 'Van' : 'Bike'}</strong>
                <p>{dateFmt(i.date)}</p>
                {i.description && <p>{i.description}</p>}
              </div>
              <button type="button" className="mo-btn" disabled={busyId === i._id} onClick={() => resolve(i)}>
                {busyId === i._id ? 'Updating…' : 'Mark resolved'}
              </button>
            </div>
          )) : <div className="mo-context-empty">No open incidents.</div>}
        </div>
        <div className="mo-modal-foot"><button type="button" className="mo-btn mo-primary" onClick={onReport}>Report incident</button></div>
      </div>
    </div>
  );
}

export default IncidentsDialog;
