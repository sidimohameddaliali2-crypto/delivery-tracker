import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { InfoTip, CardMenu } from './DashboardBits';

const fmt = (n) => Number(n).toLocaleString('en-GB');

function FlaggedCustomersModal({ flaggedCustomers, onClose }) {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="mo-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mo-modal mo-modal-narrow" role="dialog" aria-modal="true" aria-label="Flagged customers">
        <div className="mo-modal-head">
          <div>
            <h2>Flagged customers</h2>
            <p>Customers holding 3+ bags</p>
          </div>
          <button type="button" className="mo-btn" onClick={onClose}>Close</button>
        </div>
        <div className="mo-context-list">
          {flaggedCustomers.map((c) => (
            <div key={c.key} className="mo-context-record">
              <div>
                <strong>{c.customerName}</strong>
                {c.customerId && <p>ID: {c.customerId}</p>}
                <p>{c.bags.length} bags</p>
              </div>
              <button
                type="button"
                className="mo-btn"
                onClick={() => navigate('/customers', { state: { search: c.customerName } })}
              >
                Find account
              </button>
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
    <section className="mo-panel" aria-label="Bag lifecycle">
      <div className="mo-panel-head">
        <div>
          <h2>Bag lifecycle <InfoTip text="Bags currently assigned to customers. Flagged customers hold 3 or more bags." /></h2>
          <p>Bag balances are independent of the delivery date range.</p>
        </div>
        <CardMenu
          label="Bag lifecycle options"
          items={[{ label: 'View flagged accounts', disabled: !flaggedCustomers.length, onSelect: () => setIsModalOpen(true) }]}
        />
      </div>
      <div className="mo-bag-grid">
        <div><span>Assigned bags</span><strong>{fmt(assignedCount)}</strong></div>
        <div><span>Remaining</span><strong>{fmt(remainingCount)}</strong></div>
        <div className="mo-flagged">
          <span>Flagged customers</span>
          <strong>{fmt(flaggedCustomers.length)}</strong>
          <small>Holding 3+ bags</small>
          {flaggedCustomers.length > 0 && (
            <button type="button" className="mo-text-link" onClick={() => setIsModalOpen(true)}>View accounts →</button>
          )}
        </div>
      </div>
      {isModalOpen && <FlaggedCustomersModal flaggedCustomers={flaggedCustomers} onClose={() => setIsModalOpen(false)} />}
    </section>
  );
}

export default BagLifecycleAnalyticsCard;
