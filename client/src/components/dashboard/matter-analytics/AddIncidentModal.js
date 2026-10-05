import React, { useEffect } from 'react';

function AddIncidentModal({ form, onChange, onSubmit, submitting, error, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mo-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mo-modal mo-modal-narrow" role="dialog" aria-modal="true" aria-label="Report incident">
        <div className="mo-modal-head">
          <div><h2>Report incident</h2><p>Log an accident or a vehicle that is not working.</p></div>
          <button type="button" className="mo-btn" onClick={onClose}>Close</button>
        </div>

        {error && <p className="mo-error" role="alert">{error}</p>}

        <form onSubmit={onSubmit} className="mo-form">
          <label className="mo-field">Incident date
            <input type="date" value={form.date} onChange={(e) => onChange({ ...form, date: e.target.value })} />
          </label>

          <div className="mo-form-grid">
            <label className="mo-field">Vehicle
              <select value={form.vehicleType} onChange={(e) => onChange({ ...form, vehicleType: e.target.value })}>
                <option value="bike">Bike</option>
                <option value="van">Van</option>
              </select>
            </label>
            <label className="mo-field">Incident type
              <select value={form.incidentType} onChange={(e) => onChange({ ...form, incidentType: e.target.value })}>
                <option value="accident">Accident</option>
                <option value="not_working">Not working</option>
              </select>
            </label>
          </div>

          <label className="mo-field">Details (optional)
            <textarea
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              rows={3}
              maxLength={500}
              placeholder="Add details about the incident..."
            />
          </label>

          <div className="mo-form-actions">
            <button type="button" className="mo-btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="mo-btn mo-primary" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default AddIncidentModal;
