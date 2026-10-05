import React, { useEffect } from 'react';
import QuickReportForm from './QuickReportForm';

function QuickNewCommunicationModal({ onClose, onSubmitted }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mo-modal-backdrop" style={{ zIndex: 210 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mo-modal mo-modal-narrow mo-modal-skin" role="dialog" aria-modal="true" aria-label="New communication">
        <div className="mo-modal-head">
          <div><h2>New communication</h2><p>Report a delivery issue for a customer.</p></div>
          <button type="button" className="mo-btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 14 }}>
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
