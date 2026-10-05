import React, { useEffect } from 'react';
import DeliveryIssuesTab from './DeliveryIssuesTab';

function CommunicationsCenterModal({ onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mo-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mo-modal mo-modal-skin" style={{ width: 'min(1152px, 100%)' }} role="dialog" aria-modal="true" aria-label="Communications center">
        <div className="mo-modal-head">
          <div>
            <h2>Communications center</h2>
            <p>Report and track delivery issues per customer</p>
          </div>
          <button type="button" className="mo-btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <DeliveryIssuesTab />
        </div>
      </div>
    </div>
  );
}

export default CommunicationsCenterModal;
